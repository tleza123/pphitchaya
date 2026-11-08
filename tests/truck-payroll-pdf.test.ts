import { test } from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { NextRequest } from 'next/server';
import { GET as payrollPdf } from '../src/app/api/truck/payroll/pdf/route';

test('payroll PDF renders both historic fee snapshots and v3 snapshots with preserved old rights', async () => {
  const docs = new Map<string, any>();
  const ref = (path: string): any => ({
    path,
    id: path.split('/').pop(),
    collection: (name: string) => ref(`${path}/${name}`),
    doc: (id: string) => ref(`${path}/${id}`),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) })
  });
  (globalThis as any).adminDb = { collection: (name: string) => ref(name), doc: (path: string) => ref(path) };
  const shop = `shops/${process.env.SHOP_ID || 'main'}`;
  const row = { driverId: 'd1', driverName: 'คนขับ', baseSatang: 30000, tripSatang: 15000, extraSatang: 2000, totalSatang: 47000, days: [], trips: [] };
  docs.set(`${shop}/truckPayrollMonths/2026-10`, { state: 'CLOSED', snapshot: { drivers: [{ ...row, trips: [{ departureDate: '2026-10-10', arrivalDate: '2026-10-10', plate: '70-1111', origin: 'A', destination: 'B', driverPaySatang: 15000, driverExtraSatang: 2000 }] }] } });
  docs.set(`${shop}/truckPayrollMonths/2026-11`, { state: 'CLOSED', snapshot: { pricingVersion: 3, drivers: [{ ...row, trips: [{ pricingVersion: 3, departureDate: '2026-11-10', arrivalDate: '2026-11-10', plate: '70-1111', origin: 'A', destination: 'B', driverPaySatang: 15000, legacyDriverExtraSatang: 2000 }] }] } });
  docs.set(`${shop}/truckPayrollMonths/2026-12`, {state:'CLOSED',snapshot:{payBasis:'TRIPS_ONLY',drivers:[{...row,days:[],baseSatang:0,tripSatang:30000,extraSatang:0,totalSatang:30000,trips:[1,2].map(()=>({departureDate:'2026-12-01',plate:'70-1111',origin:'A',destination:'B',driverPaySatang:15000}))}]}});
  const rendered:string[]=[];
  const original=PDFDocument.prototype.text;
  PDFDocument.prototype.text=function(this:PDFKit.PDFDocument,text:any,...args:any[]){rendered.push(String(text)); return (original as any).call(this,text,...args);} as any;
  try { for (const month of ['2026-10', '2026-11','2026-12']) {
    rendered.length=0;
    const response = await payrollPdf(new NextRequest(`http://localhost/api/truck/payroll/pdf?month=${month}&driverId=d1`));
    assert.equal(response.status, 200);
    const pdf = Buffer.from(await response.arrayBuffer());
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length >= 1);
    if(month==='2026-12') {
      assert.ok(rendered.includes('วันที่ออกรถ 1 วัน · 2 เที่ยว'));
      assert.ok(!rendered.some(text=>text.includes('ค่าแรงฐาน')));
    } else assert.ok(rendered.includes('วันทำงานและค่าแรงฐาน'));
  }
  } finally { PDFDocument.prototype.text=original; }
});
