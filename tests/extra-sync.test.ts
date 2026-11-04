import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMonthExtrasPrepared } from '../src/lib/server/extra-sync';
import { calculateEmployeeMonth } from '../src/lib/payroll/engine';

test('ensureMonthExtrasPrepared strictly executes all reads before all writes in transaction', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previous = globals.adminDb;

  const shopId = 'main';
  const targetMonth = '2026-09';
  const docs = new Map<string, any>();

  const shop = `shops/${shopId}`;
  docs.set(`${shop}/months/${targetMonth}`, { state: 'OPEN', revision: 1 });
  docs.set(`${shop}/control/finance`, { closingMonth: null, activeCloseJobId: null });

  // Add 3 active employees with extra templates
  for (let i = 1; i <= 3; i++) {
    const empId = `emp_${i}`;
    docs.set(`${shop}/employees/${empId}`, {
      name: `พนักงาน ${i}`,
      position: 'ช่าง',
      startDate: '2026-08-01',
      status: 'ACTIVE'
    });

    docs.set(`${shop}/employees/${empId}/extraTemplates/tpl_${i}`, {
      templateId: `tpl_${i}`,
      employeeId: empId,
      label: `เบี้ยขยัน ${i}`,
      amountSatang: 100000 * i,
      version: 1
    });
  }

  function reference(path: string): any {
    return {
      path,
      id: path.slice(path.lastIndexOf('/') + 1),
      collection: (name: string) => reference(`${path}/${name}`),
      doc: (name?: string) => reference(name ? `${path}/${name}` : `${path}/gen_${Math.random()}`),
      get: async () => {
        const records = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
        return {
          exists: docs.has(path),
          data: () => docs.get(path),
          size: records.length,
          empty: records.length === 0,
          docs: records.map(([key, value]) => ({
            id: key.slice(path.length + 1),
            ref: reference(key),
            data: () => value
          }))
        };
      }
    };
  }

  // Strict Firestore transaction validator: fails immediately if any read follows a write
  let writeExecuted = false;
  const mockDb: any = {
    collection: (name: string) => reference(name),
    runTransaction: async (updateFn: (tx: any) => Promise<any>) => {
      writeExecuted = false;
      const tx = {
        get: async (ref: any) => {
          if (writeExecuted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          return ref.get();
        },
        set: (ref: any, data: any, options?: any) => {
          writeExecuted = true;
          if (options?.merge && docs.has(ref.path)) {
            docs.set(ref.path, { ...docs.get(ref.path), ...data });
          } else {
            docs.set(ref.path, data);
          }
        },
        update: (ref: any, data: any) => {
          writeExecuted = true;
          docs.set(ref.path, { ...docs.get(ref.path), ...data });
        },
        delete: (ref: any) => {
          writeExecuted = true;
          docs.delete(ref.path);
        }
      };
      return await updateFn(tx);
    }
  };

  globals.adminDb = mockDb;

  try {
    const result = await ensureMonthExtrasPrepared(mockDb, shopId, targetMonth);
    assert.equal(result.createdCount, 3);

    // Verify all 3 extras were successfully created
    const createdExtras = [...docs.entries()].filter(([key]) => key.startsWith(`${shop}/months/${targetMonth}/extras/`));
    assert.equal(createdExtras.length, 3);
  } finally {
    globals.adminDb = previous;
  }
});

test('ensureMonthExtrasPrepared automatically copies extraTemplates to monthly extras and calculates total salary', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previous = globals.adminDb;

  const shopId = 'main';
  const targetMonth = '2026-09';
  const docs = new Map<string, any>();

  const shop = `shops/${shopId}`;
  docs.set(`${shop}/months/${targetMonth}`, { state: 'OPEN', revision: 1 });
  docs.set(`${shop}/control/finance`, { closingMonth: null, activeCloseJobId: null });

  const empId = 'emp_somchai';
  docs.set(`${shop}/employees/${empId}`, {
    name: 'สมชาย',
    nickname: 'ชาย',
    position: 'ช่างเครื่อง',
    startDate: '2026-08-01',
    endDate: null,
    status: 'ACTIVE'
  });

  const tplId = 'tpl_travel';
  docs.set(`${shop}/employees/${empId}/extraTemplates/${tplId}`, {
    templateId: tplId,
    employeeId: empId,
    label: 'ค่าเดินทาง',
    amountSatang: 150000,
    effectiveFromMonth: '2026-08',
    effectiveToMonth: null,
    version: 1
  });

  function reference(path: string): any {
    return {
      path,
      id: path.slice(path.lastIndexOf('/') + 1),
      collection: (name: string) => reference(`${path}/${name}`),
      doc: (name?: string) => reference(name ? `${path}/${name}` : `${path}/gen_${Math.random()}`),
      get: async () => {
        const records = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
        return {
          exists: docs.has(path),
          data: () => docs.get(path),
          size: records.length,
          empty: records.length === 0,
          docs: records.map(([key, value]) => ({
            id: key.slice(path.length + 1),
            ref: reference(key),
            data: () => value
          }))
        };
      }
    };
  }

  let writeExecuted = false;
  const mockDb: any = {
    collection: (name: string) => reference(name),
    runTransaction: async (updateFn: (tx: any) => Promise<any>) => {
      writeExecuted = false;
      const tx = {
        get: async (ref: any) => {
          if (writeExecuted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          return ref.get();
        },
        set: (ref: any, data: any, options?: any) => {
          writeExecuted = true;
          if (options?.merge && docs.has(ref.path)) {
            docs.set(ref.path, { ...docs.get(ref.path), ...data });
          } else {
            docs.set(ref.path, data);
          }
        },
        update: (ref: any, data: any) => {
          writeExecuted = true;
          docs.set(ref.path, { ...docs.get(ref.path), ...data });
        },
        delete: (ref: any) => {
          writeExecuted = true;
          docs.delete(ref.path);
        }
      };
      return await updateFn(tx);
    }
  };

  globals.adminDb = mockDb;

  try {
    const result = await ensureMonthExtrasPrepared(mockDb, shopId, targetMonth);
    assert.equal(result.createdCount, 1);

    const createdExtras = [...docs.entries()].filter(([key]) => key.startsWith(`${shop}/months/${targetMonth}/extras/`));
    assert.equal(createdExtras.length, 1);
    const extraRecord = createdExtras[0][1];
    assert.equal(extraRecord.label, 'ค่าเดินทาง');
    assert.equal(extraRecord.amountSatang, 150000);
    assert.equal(extraRecord.sourceTemplateId, tplId);

    const calculated = calculateEmployeeMonth({
      month: targetMonth,
      today: '2026-09-30',
      systemStartDate: '2026-08-01',
      employee: {
        employeeId: empId,
        name: 'สมชาย',
        position: 'ช่างเครื่อง',
        startDate: '2026-08-01',
        endDate: null,
        revision: 1
      },
      rates: [{ employeeId: empId, effectiveFrom: '2026-08-01', dailySatang: 50000 }],
      attendance: [{ employeeId: empId, dateKey: '2026-09-01', status: 'FULL' }],
      extras: [extraRecord],
      weekdays: [1, 2, 3, 4, 5, 6]
    });

    assert.equal(calculated.baseSatang, 1300000);
    assert.equal(calculated.extraSatang, 150000);
    assert.equal(calculated.grossSatang, 1450000);
    assert.equal(calculated.totalSatang, 1450000);
  } finally {
    globals.adminDb = previous;
  }
});

test('ensureMonthExtrasPrepared does not overwrite manually overridden or deleted extras', async () => {
  const globals = globalThis as unknown as { adminDb?: unknown };
  const previous = globals.adminDb;

  const shopId = 'main';
  const targetMonth = '2026-09';
  const docs = new Map<string, any>();

  const shop = `shops/${shopId}`;
  docs.set(`${shop}/months/${targetMonth}`, { state: 'OPEN', revision: 1 });
  docs.set(`${shop}/control/finance`, { closingMonth: null, activeCloseJobId: null });

  const empId = 'emp_somchai';
  docs.set(`${shop}/employees/${empId}`, {
    name: 'สมชาย',
    startDate: '2026-08-01',
    status: 'ACTIVE'
  });

  const tplId = 'tpl_travel';
  docs.set(`${shop}/employees/${empId}/extraTemplates/${tplId}`, {
    templateId: tplId,
    employeeId: empId,
    label: 'ค่าเดินทาง',
    amountSatang: 150000,
    version: 1
  });

  // Simulate an extra that was manually modified for this month to 200,000
  const extraId = 'extra_existing';
  docs.set(`${shop}/months/${targetMonth}/extras/${extraId}`, {
    extraId,
    employeeId: empId,
    monthKey: targetMonth,
    label: 'ค่าเดินทางพิเศษ',
    amountSatang: 200000,
    sourceTemplateId: tplId,
    manuallyOverridden: true,
    revision: 2
  });

  function reference(path: string): any {
    return {
      path,
      id: path.slice(path.lastIndexOf('/') + 1),
      collection: (name: string) => reference(`${path}/${name}`),
      doc: (name?: string) => reference(name ? `${path}/${name}` : `${path}/gen_${Math.random()}`),
      get: async () => {
        const records = [...docs.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'));
        return {
          exists: docs.has(path),
          data: () => docs.get(path),
          size: records.length,
          empty: records.length === 0,
          docs: records.map(([key, value]) => ({
            id: key.slice(path.length + 1),
            ref: reference(key),
            data: () => value
          }))
        };
      }
    };
  }

  let writeExecuted = false;
  const mockDb: any = {
    collection: (name: string) => reference(name),
    runTransaction: async (updateFn: (tx: any) => Promise<any>) => {
      writeExecuted = false;
      const tx = {
        get: async (ref: any) => {
          if (writeExecuted) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          return ref.get();
        },
        set: (ref: any, data: any) => {
          writeExecuted = true;
          docs.set(ref.path, data);
        },
        update: (ref: any, data: any) => {
          writeExecuted = true;
          docs.set(ref.path, { ...docs.get(ref.path), ...data });
        },
        delete: (ref: any) => {
          writeExecuted = true;
          docs.delete(ref.path);
        }
      };
      return await updateFn(tx);
    }
  };

  globals.adminDb = mockDb;

  try {
    const result = await ensureMonthExtrasPrepared(mockDb, shopId, targetMonth);
    assert.equal(result.createdCount, 0);
    assert.equal(result.updatedCount, 0);

    // Amount should stay 200000
    const preserved = docs.get(`${shop}/months/${targetMonth}/extras/${extraId}`);
    assert.equal(preserved.amountSatang, 200000);
    assert.equal(preserved.label, 'ค่าเดินทางพิเศษ');
  } finally {
    globals.adminDb = previous;
  }
});
