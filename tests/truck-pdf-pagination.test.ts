import {test} from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import {NextRequest} from 'next/server';
import {GET as invoicePdf} from '../src/app/api/truck/billing/[id]/pdf/route';
import {GET as payrollPdf} from '../src/app/api/truck/payroll/pdf/route';

test('Thai multipage documents repeat headers, keep totals and do not create footer-only pages',async()=>{
  const docs=new Map<string,any>();
  const ref=(path:string):any=>({path,collection:(n:string)=>ref(`${path}/${n}`),doc:(id:string)=>ref(`${path}/${id}`),get:async()=>({exists:docs.has(path),data:()=>docs.get(path)})});
  (globalThis as any).adminDb={collection:(n:string)=>ref(n)};
  const base=`shops/${process.env.SHOP_ID||'main'}`;
  const lines=Array.from({length:100},(_,i)=>({departureDate:'2026-11-30',arrivalDate:'2026-12-02',fromLocation:`โรงงานต้นทางบางนา ${i}`,destinationName:'คลังสินค้าท่าเรือแหลมฉบัง ลานรับสินค้าพิเศษ',plateNumberSnapshot:'70-1234',weightKg:12500,quantity:1,billingSatang:120000}));
  docs.set(`${base}/truckInvoices/qa`,{snapshotVersion:3,documentNo:'QA',issueDate:'2026-12-03',dueDate:'2026-12-20',customerName:'ลูกค้าทดสอบ',company:{companyName:'บริษัทขนส่ง'},lines,totalSatang:12000000});
  docs.set(`${base}/truckPayrollMonths/2026-11`,{state:'CLOSED',snapshot:{drivers:[{driverId:'d',driverName:'นายทดสอบ',days:[],trips:lines.map(l=>({pricingVersion:3,...l,origin:l.fromLocation,destination:l.destinationName,plate:l.plateNumberSnapshot,driverPaySatang:15000})),baseSatang:0,tripSatang:1500000,extraSatang:0,totalSatang:1500000}]}});
  const original=PDFDocument.prototype.text;
  const rendered:string[]=[];
  const cells:{text:string;x:any;y:any;options:any}[]=[];
  PDFDocument.prototype.text=function(this:PDFKit.PDFDocument,text:any,...args:any[]){rendered.push(String(text));cells.push({text:String(text),x:args[0],y:args[1],options:args[2]});return (original as any).call(this,text,...args);} as any;
  try{
    for(const kind of ['invoice','payroll']){
      rendered.length=0;
      cells.length=0;
      const response=kind==='invoice'?await invoicePdf(new NextRequest('http://qa/api/truck/billing/qa/pdf'),{params:Promise.resolve({id:'qa'})}):await payrollPdf(new NextRequest('http://qa/api/truck/payroll/pdf?month=2026-11&driverId=d'));
      assert.equal(response.status,200);
      const binary=Buffer.from(await response.arrayBuffer()).toString('latin1');
      const pages=(binary.match(/\/Type\s*\/Page\b/g)||[]).length;
      assert.ok(pages>1);
      const title=kind==='invoice'?'ใบวางบิล':'ใบสรุปค่าแรงคนขับ';
      assert.equal(rendered.filter(t=>t===title).length,pages,'every page must have a real header, including pages containing footers');
      assert.equal(rendered.filter(t=>/^หน้า \d+ \/ \d+$/.test(t)).length,pages);
      assert.ok(rendered.some(t=>t.includes(kind==='invoice'?'120,000.00':'15,000.00')));
      assert.ok(!rendered.some(t=>t.includes('→')),'Thai font has no arrow glyph; use readable Thai route separator');
      const dates=cells.filter(cell=>cell.text==='2026-11-30');
      const plates=cells.filter(cell=>cell.text==='70-1234');
      assert.equal(dates.length,100); assert.equal(plates.length,100);
      assert.ok(dates.every(cell=>cell.x===46));
      assert.ok(plates.every(cell=>cell.x===121));
      assert.ok(cells.some(cell=>cell.text==='ต้นทาง - ปลายทาง' || cell.text==='ต้นทาง - ปลายทาง / รายละเอียด'));
      assert.ok(cells.filter(cell=>cell.text===(kind==='invoice'?'1,200.00':'150.00')).some(cell=>cell.x===471 && cell.options.align==='right'),'Amounts occupy the right-aligned money column');
      if(kind==='invoice'){
        assert.equal(rendered.filter(t=>t.includes('น้ำหนัก 12.500')).length,100);
        assert.ok(!rendered.some(t=>t.includes('2026-12-02')));
        assert.ok(!rendered.some(t=>t.includes('ค่าแรง')||t.includes('เงินเพิ่ม')));
      }
    }
  }finally{PDFDocument.prototype.text=original;}
});
