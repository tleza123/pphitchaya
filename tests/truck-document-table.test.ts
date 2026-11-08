import { test } from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { TruckDocumentTable } from '../src/lib/server/truck-document-table';

test('An oversized Thai table row splits across pages without losing its ending or repeating money', async () => {
  const doc = new PDFDocument({size:'A4',margin:0,bufferPages:true});
  doc.registerFont('Regular',path.join(process.cwd(),'src/assets/fonts/THSarabunNew.ttf'));
  doc.registerFont('Bold',path.join(process.cwd(),'src/assets/fonts/THSarabunNew-Bold.ttf'));
  const done = new Promise<void>((resolve,reject)=>{doc.on('data',()=>{});doc.on('end',resolve);doc.on('error',reject);});
  const rendered:{text:string;x:number;y:number;height:number}[]=[];
  const original=doc.text.bind(doc);
  doc.text=((text:string,x:number,y:number,options:PDFKit.Mixins.TextOptions)=>{
    rendered.push({text,x,y,height:doc.heightOfString(text,options)});
    return original(text,x,y,options);
  }) as any;
  const layout=new TruckDocumentTable(doc,page=>page.headerText('เอกสารทดสอบ',18,true));
  const route='จาก สถานที่ต้นทาง ไป ปลายทางภาษาไทย '.repeat(250)+'จุดจบรายการ';
  layout.table([{title:'วันที่',width:75},{title:'ทะเบียนรถ',width:80},{title:'เส้นทาง',width:270},{title:'จำนวนเงิน',width:90,align:'right'}],[['2026-11-08','89-1924',route,'111.25']]);
  layout.footers();
  const pages=doc.bufferedPageRange().count;
  assert.ok(pages>1);
  assert.equal(rendered.filter(cell=>cell.text==='วันที่').length,pages);
  assert.equal(rendered.filter(cell=>cell.text==='111.25').length,1);
  const chunks=rendered.filter(cell=>cell.x===201&&cell.text!=='เส้นทาง');
  assert.equal(chunks.map(cell=>cell.text).join(''),route);
  assert.ok(chunks.every(cell=>cell.y+cell.height<=775));
  doc.end(); await done;
});
