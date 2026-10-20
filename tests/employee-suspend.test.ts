import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as suspendPost } from '../src/app/api/employees/[id]/suspend/route';
import { GET as attendanceGet, POST as attendancePost } from '../src/app/api/attendance/route';
import { calculateEmployeeMonth } from '../src/lib/payroll/engine';

test('Employee suspend/resume API toggles status and records audit', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previousDb = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const employeeId = 'emp_suspend_1';
  const docs = new Map<string, any>([
    [`${shop}/employees/${employeeId}`, {
      employeeId,
      name: 'สมชาย ช่างยนต์',
      nickname: 'ชาย',
      position: 'ช่างเครื่อง',
      startDate: '2026-08-01',
      revision: 1
    }]
  ]);

  const ref = (path: string): any => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id = 'audit-test') => ref(`${path}/${id}`)
  });

  globals.adminDb = {
    collection: (name: string) => ref(name),
    runTransaction: async (run: (tx: any) => Promise<unknown>) => {
      const staged: Array<[string, any]> = [];
      const read = (r: any) => ({
        exists: docs.has(r.path),
        data: () => docs.get(r.path)
      });
      const result = await run({
        get: async (r: any) => read(r),
        getAll: async (...refs: any[]) => refs.map(read),
        set: (r: any, value: any) => staged.push([r.path, value]),
        update: (r: any, value: any) => {
          const current = docs.get(r.path) || {};
          staged.push([r.path, { ...current, ...value }]);
        }
      });
      staged.forEach(([path, data]) => docs.set(path, data));
      return result;
    }
  };

  try {
    // 1. Suspend employee
    const reqSuspend = new NextRequest(`http://localhost/api/employees/${employeeId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suspended: true,
        expectedRevision: 1,
        requestId: 'req_suspend_01'
      })
    });
    const resSuspend = await (await suspendPost(reqSuspend, { params: Promise.resolve({ id: employeeId }) })).json();

    assert.equal(resSuspend.ok, true);
    assert.equal(resSuspend.data.suspended, true);
    assert.equal(resSuspend.data.status, 'SUSPENDED');
    assert.equal(resSuspend.data.revision, 2);

    // 2. Conflict test with outdated revision
    const reqConflict = new NextRequest(`http://localhost/api/employees/${employeeId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suspended: false,
        expectedRevision: 1,
        requestId: 'req_conflict_01'
      })
    });
    const resConflict = await suspendPost(reqConflict, { params: Promise.resolve({ id: employeeId }) });
    assert.equal(resConflict.status, 409);

    // 3. Resume employee
    const reqResume = new NextRequest(`http://localhost/api/employees/${employeeId}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suspended: false,
        expectedRevision: 2,
        requestId: 'req_resume_01'
      })
    });
    const resResume = await (await suspendPost(reqResume, { params: Promise.resolve({ id: employeeId }) })).json();

    assert.equal(resResume.ok, true);
    assert.equal(resResume.data.suspended, false);
    assert.equal(resResume.data.status, 'ACTIVE');
    assert.equal(resResume.data.revision, 3);
  } finally {
    globals.adminDb = previousDb;
  }
});

test('Suspended employee does not appear on attendance check-in list, but appears if past record exists', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previousDb = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const date = '2026-09-15';
  const month = `${shop}/months/2026-09`;

  const activeEmpId = 'emp_active';
  const suspendedEmpId = 'emp_suspended';
  const pastSuspendedEmpId = 'emp_past_suspended';

  const docs = new Map<string, any>([
    [month, { state: 'OPEN', revision: 1 }],
    [`${shop}/employees/${activeEmpId}`, {
      employeeId: activeEmpId,
      name: 'Active Worker',
      position: 'Staff',
      startDate: '2026-08-01',
      status: 'ACTIVE',
      suspended: false
    }],
    [`${shop}/employees/${suspendedEmpId}`, {
      employeeId: suspendedEmpId,
      name: 'Suspended Worker',
      position: 'Staff',
      startDate: '2026-08-01',
      status: 'SUSPENDED',
      suspended: true
    }],
    [`${shop}/employees/${pastSuspendedEmpId}`, {
      employeeId: pastSuspendedEmpId,
      name: 'Past Worker Now Suspended',
      position: 'Staff',
      startDate: '2026-08-01',
      status: 'SUSPENDED',
      suspended: true
    }],
    // Past attendance on this date exists for pastSuspendedEmpId
    [`${month}/attendance/${date}_${pastSuspendedEmpId}`, {
      employeeId: pastSuspendedEmpId,
      dateKey: date,
      status: 'FULL',
      advanceSatang: 0,
      deductionSatang: 0,
      revision: 1
    }]
  ]);

  const ref = (path: string): any => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id = 'doc') => ref(`${path}/${id}`),
    where: (field: string, op: string, val: any) => ({
      get: async () => {
        const matches: any[] = [];
        docs.forEach((data, p) => {
          if (p.startsWith(`${month}/attendance/`) && data[field] === val) {
            matches.push({ id: p.split('/').pop(), data: () => data });
          }
        });
        return { docs: matches };
      }
    }),
    get: async () => {
      if (path.endsWith('/employees')) {
        return {
          docs: [
            { id: activeEmpId, data: () => docs.get(`${shop}/employees/${activeEmpId}`) },
            { id: suspendedEmpId, data: () => docs.get(`${shop}/employees/${suspendedEmpId}`) },
            { id: pastSuspendedEmpId, data: () => docs.get(`${shop}/employees/${pastSuspendedEmpId}`) }
          ]
        };
      }
      if (path.endsWith('/calendarVersions')) {
        return { docs: [{ id: 'cv1', data: () => ({ effectiveFrom: '2026-08-01', weekdays: [1, 2, 3, 4, 5, 6, 0] }) }] };
      }
      if (path.endsWith('/calendarOverrides')) {
        return { docs: [] };
      }
      return { exists: docs.has(path), data: () => docs.get(path) };
    }
  });

  globals.adminDb = {
    collection: (name: string) => ref(name)
  };

  try {
    const res = await (await attendanceGet(new NextRequest(`http://localhost/api/attendance?date=${date}`))).json();
    assert.equal(res.ok, true);
    const itemIds = res.data.items.map((it: any) => it.employee.employeeId);

    // Active employee MUST appear
    assert.equal(itemIds.includes(activeEmpId), true);

    // Suspended employee without attendance record MUST NOT appear on check-in list
    assert.equal(itemIds.includes(suspendedEmpId), false);

    // Suspended employee who already had an attendance record on that day MUST appear (data kept intact)
    assert.equal(itemIds.includes(pastSuspendedEmpId), true);
  } finally {
    globals.adminDb = previousDb;
  }
});

test('Posting attendance for a suspended employee is rejected with EMPLOYEE_SUSPENDED', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previousDb = globals.adminDb;
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const date = '2026-09-15';
  const month = `${shop}/months/2026-09`;
  const suspendedEmpId = 'emp_suspended_reject';

  const docs = new Map<string, any>([
    [month, { state: 'OPEN', revision: 1 }],
    [`${shop}/control/finance`, { closingMonth: null }],
    [`${shop}/employees/${suspendedEmpId}`, {
      employeeId: suspendedEmpId,
      name: 'Suspended Worker',
      position: 'Staff',
      startDate: '2026-08-01',
      status: 'SUSPENDED',
      suspended: true,
      revision: 1
    }]
  ]);

  const ref = (path: string): any => ({
    path,
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id = 'doc') => ref(`${path}/${id}`)
  });

  globals.adminDb = {
    collection: (name: string) => ref(name),
    runTransaction: async (run: (tx: any) => Promise<unknown>) => {
      const read = (r: any) => ({
        exists: docs.has(r.path),
        data: () => docs.get(r.path)
      });
      return run({
        get: async (r: any) => read(r),
        getAll: async (...refs: any[]) => refs.map(read),
        set: () => {}
      });
    }
  };

  try {
    const postReq = new NextRequest('http://localhost/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateKey: date,
        employeeId: suspendedEmpId,
        status: 'FULL',
        expectedRevision: 0,
        requestId: 'req_suspended_check'
      })
    });
    const res = await attendancePost(postReq);
    assert.equal(res.status, 422);
    const json = await res.json();
    assert.equal(json.error.code, 'EMPLOYEE_SUSPENDED');
  } finally {
    globals.adminDb = previousDb;
  }
});

test('Payroll calculation excludes unmarked workdays for suspended employees without charging full day', () => {
  const result = calculateEmployeeMonth({
    month: '2026-09',
    today: '2026-09-30',
    systemStartDate: '2026-08-01',
    employee: {
      employeeId: 'emp_s1',
      name: 'นาย พักงาน',
      position: 'พนักงาน',
      startDate: '2026-08-01',
      revision: 1,
      status: 'SUSPENDED',
      suspended: true
    },
    rates: [
      { employeeId: 'emp_s1', effectiveFrom: '2026-08-01', dailySatang: 50000 }
    ],
    // Only worked 2 days before being suspended
    attendance: [
      { employeeId: 'emp_s1', dateKey: '2026-09-01', status: 'FULL' },
      { employeeId: 'emp_s1', dateKey: '2026-09-02', status: 'HALF' }
    ],
    extras: [],
    weekdays: [1, 2, 3, 4, 5, 6]
  });

  // Exactly 1 full day and 1 half day worked, unmarked days do NOT count as full days
  assert.equal(result.full, 1);
  assert.equal(result.half, 1);
  assert.equal(result.workedDays, 2);
  assert.equal(result.baseSatang, 50000 + 25000); // 750 THB
  assert.equal(result.totalSatang, 75000);
});
