/** Local browser audit fixture. Every /api request stays in RAM; none is forwarded to Firebase. */
import http from 'node:http';
import { calculateEmployeeMonth, type AttendanceRecord } from '../../src/lib/payroll/engine';
import { buildAnalytics, reportMonths, type AnalyticsMonth, type ReportPeriod } from '../../src/lib/payroll/analytics';
import { getBangkokToday } from '../../src/lib/payroll/dates';
import { createSalaryPdf } from '../../src/lib/server/salary-pdf';
import { zipSync } from 'fflate';
import { moneySatang } from '../../src/lib/payroll/money';

const today = getBangkokToday();
const people: any[] = ['ก', 'ข'].map((name, i) => ({ employeeId: `audit-${i}`, name: `ทดสอบ ${name}`, nickname: `ทดสอบ ${name}`, position: 'พนักงานทดสอบ', startDate: '2026-08-01', revision: 1, dailyRateSatang: 45000, extraTemplates: [] }));
const attendance = new Map<string, AttendanceRecord>();
const extras: any[] = [];
const receipts = new Map<string, any>();
const months = new Map<string, { revision: number; state: string }>();
let profile = { shopName: 'ระบบทดสอบ', revision: 1 };
let weekdays = [0, 1, 2, 3, 4, 5, 6];
let writes = 0;
let closingMonth = '';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const results = (month: string): AnalyticsMonth[] => people.map(employee => ({
  ...calculateEmployeeMonth({ month, today, systemStartDate: '2026-08-01', employee,
    rates: [{ employeeId: employee.employeeId, effectiveFrom: employee.startDate, dailySatang: employee.dailyRateSatang }],
    attendance: [...attendance.values()], extras: extras.filter(extra => extra.monthKey === month),
    calendarVersions: [{ versionId: 'audit', revision: 1, effectiveFrom: '2026-08-01', weekdays }], calendar: {} }),
  name: employee.name, nickname: employee.nickname, position: employee.position, isClosed: months.get(month)?.state === 'CLOSED'
}));
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1:3012');
  if (!url.pathname.startsWith('/api/')) {
    const proxy = http.request({ hostname: '127.0.0.1', port: 3011, path: request.url, method: request.method, headers: request.headers }, upstream => {
      response.writeHead(upstream.statusCode || 500, upstream.headers); upstream.pipe(response);
    });
    proxy.on('error', () => { response.statusCode = 502; response.end('Start the local Next server on port 3011 first.'); });
    request.pipe(proxy); return;
  }
  const send = (data: any, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ ok: status === 200, data })); };
  try {
    let body: any = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      if (request.headers['content-type']?.includes('application/json')) body = JSON.parse(Buffer.concat(chunks).toString());
      await delay(1800);
      if (body.requestId && receipts.has(body.requestId)) { send(receipts.get(body.requestId)); return; }
      writes++;
    } else await delay(url.pathname.includes('reports') ? 650 : 350);
    const path = url.pathname, month = url.searchParams.get('month') || today.slice(0, 7);
    let data: any;
    if (path === '/api/audit-state') data = { writes, people, attendance: [...attendance.values()], extras };
    else if (path === '/api/settings') {
      if (request.method === 'PATCH') profile = { shopName: body.shopName, revision: profile.revision + 1 };
      data = { ...profile, profile, calendarVersions: [{ effectiveFrom: '2026-08-01', weekdays }] };
    } else if (path === '/api/calendar') { if (body.weekdays) weekdays = body.weekdays; data = { weekdays }; }
    else if (path === '/api/employees') {
      if (request.method === 'POST') { const employee = { ...body, employeeId: `audit-${people.length}`, revision: 1 }; people.push(employee); data = employee; } else data = people;
    } else if (path === '/api/attendance') {
      if (request.method === 'POST') {
        const key = `${body.dateKey}|${body.employeeId}`, previous = attendance.get(key);
        data = { ...previous, ...body, advanceSatang: body.advanceSatang ?? previous?.advanceSatang ?? 0, deductionSatang: body.deductionSatang ?? previous?.deductionSatang ?? 0, revision: (previous?.revision || 0) + 1, updatedAt: new Date().toISOString() };
        attendance.set(key, data);
      } else data = { isWorkday: true, isClosed: false, items: people.map(employee => ({ employee, attendance: attendance.get(`${url.searchParams.get('date')}|${employee.employeeId}`) || { status: 'FULL', automatic: true, advanceSatang: 0, deductionSatang: 0, revision: 0, updatedAt: null } })) };
    } else if (path === '/api/reports/analytics') {
      const period = (url.searchParams.get('period') || 'day') as ReportPeriod;
      const range = reportMonths(period, Object.fromEntries(url.searchParams), today);
      data = buildAnalytics(range.flatMap(results), period, today, range, []);
    } else if (path === '/api/reports/export') {
      const rows = results(month).filter(row => !url.searchParams.get('employeeId') || row.employeeId === url.searchParams.get('employeeId'));
      const files: Record<string, Uint8Array> = {};
      for (const row of rows) files[`${row.employeeId}.pdf`] = await createSalaryPdf(row);
      response.writeHead(200, { 'Content-Type': rows.length === 1 ? 'application/pdf' : 'application/zip' });
      response.end(rows.length === 1 ? Object.values(files)[0] : zipSync(files)); return;
    } else if (path === '/api/reports') {
      const rows = results(month); data = { month, revision: months.get(month)?.revision || 0, isClosed: months.get(month)?.state === 'CLOSED', employees: rows, pendingTotal: 0,
        totals: Object.fromEntries(['base', 'extra', 'advance', 'deduction', 'gross', 'total'].map(key => [key, rows.reduce((sum, row) => sum + Number((row as any)[`${key}Satang`]), 0)])) };
    } else if (/^\/api\/reports\/audit-/.test(path)) data = results(month).find(row => row.employeeId === path.split('/').pop());
    else if (path.endsWith('/extras')) { extras.push({ ...body, amountSatang: moneySatang(body.amount), extraId: `extra-${extras.length}`, monthKey: path.split('/')[3] }); data = body; }
    else if (path.includes('/review-extras')) data = body;
    else if (path.startsWith('/api/employees/')) {
      const employee = people.find(person => person.employeeId === path.split('/')[3]);
      if (!employee) { send(null, 404); return; }
      if (path.endsWith('/rates')) employee.dailyRateSatang = body.rateSatang;
      else if (path.endsWith('/extra-templates')) employee.extraTemplates = body.extraTemplates;
      else if (path.endsWith('/end-employment')) employee.endDate = body.endDate;
      else if (request.method === 'PATCH') Object.assign(employee, body);
      employee.revision++; data = { ...employee, employeeRevision: employee.revision };
    } else if (path.startsWith('/api/months/') && path.endsWith('/close')) {
      closingMonth = path.split('/')[3]; months.set(closingMonth, { state: 'CLOSING', revision: body.expectedRevision });
      data = { jobId: 'audit-job', status: 'IN_PROGRESS', cursor: 0, totalEmployees: people.length };
    } else if (path.endsWith('/continue')) {
      months.set(closingMonth, { state: 'CLOSED', revision: (months.get(closingMonth)?.revision || 0) + 1 });
      data = { jobId: 'audit-job', status: 'COMPLETED', cursor: people.length, totalEmployees: people.length };
    } else if (path.endsWith('/reopen')) {
      const key = path.split('/')[3]; months.set(key, { state: 'OPEN', revision: body.expectedRevision + 1 }); data = body;
    }
    else { send({ message: 'Unsupported fixture route; no production API was contacted' }, 404); return; }
    if (body.requestId) receipts.set(body.requestId, data);
    send(data);
  } catch (error) { send({ message: String(error) }, 500); }
});
server.listen(3012, '127.0.0.1', () => console.log('Isolated audit fixture: http://127.0.0.1:3012 (all API writes stay in memory)'));
