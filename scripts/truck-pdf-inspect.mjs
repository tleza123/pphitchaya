import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.env.QA_NODE_MODULES;
if(!runtime)throw Error('Set QA_NODE_MODULES to the bundled runtime node_modules directory');
const require=createRequire(path.join(runtime,'package.json'));
const canvas=require('@napi-rs/canvas');
for(const key of ['DOMMatrix','ImageData','Path2D'])globalThis[key]=canvas[key];
const pdfjs=await import(pathToFileURL(path.join(runtime,'pdfjs-dist/legacy/build/pdf.mjs')).href);
const output='output/truck-qa';mkdirSync(output,{recursive:true});
const summary=[];
for(const name of ['qa-v3','qa-legacy','qa-payroll',...(existsSync(`${output}/qa-report.pdf`)?['qa-report']:[])]){
  const doc=await pdfjs.getDocument({data:new Uint8Array(readFileSync(`${output}/${name}.pdf`)),useSystemFonts:false}).promise;
  const pages=[];
  const sheet=canvas.createCanvas(1000,Math.ceil(doc.numPages/4)*355);const sheetContext=sheet.getContext('2d');sheetContext.fillStyle='white';sheetContext.fillRect(0,0,sheet.width,sheet.height);
  for(let n=1;n<=doc.numPages;n++){
    const page=await doc.getPage(n);const text=await page.getTextContent();
    const content=text.items.filter(x=>'str' in x).map(x=>x.str).join(' ');
    const viewport=page.getViewport({scale:1.4});const target=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvasContext:target.getContext('2d'),viewport,canvas:target}).promise;
    writeFileSync(`${output}/${name}-${n}.png`,target.toBuffer('image/png'));
    sheetContext.drawImage(target,((n-1)%4)*250,Math.floor((n-1)/4)*355,250,354);
    pages.push({page:n,text:content,items:text.items.filter(x=>'str' in x).map(x=>({text:x.str,x:x.transform[4],y:x.transform[5]}))});
  }
  const all=pages.map(p=>p.text).join('\n');writeFileSync(`${output}/${name}-text.txt`,all);
  writeFileSync(`${output}/${name}-contact.png`,sheet.toBuffer('image/png'));
  for(const p of pages){assert.ok(p.text.includes(name==='qa-report'?'บริษัท ทดสอบรายงานภาษาไทย':name==='qa-payroll'?'ใบสรุปค่าแรงคนขับ':'ใบวางบิล'));assert.ok(p.text.includes(`หน้า ${p.page} / ${doc.numPages}`));assert.ok(p.items.every(x=>x.y>=10&&x.y<=835),'text stays inside A4');}
  if(name!=='qa-report')assert.ok(all.includes(name==='qa-payroll'?'24,000.00':name==='qa-v3'?'120,000.00':'130,000.00'));
  assert.ok(!all.includes('\uFFFD'));
  if(name==='qa-v3'){assert.equal((all.match(/น้ำหนัก 12\.500/g)||[]).length,100);assert.ok(!all.includes('2026-12-02'));assert.ok(!all.includes('ค่าแรง'));}
  summary.push({name,pages:doc.numPages,thaiCharacters:(all.match(/[\u0E00-\u0E7F]/g)||[]).length,replacementCharacters:(all.match(/\uFFFD/g)||[]).length,pageDetails:pages});
  await doc.destroy();
}
writeFileSync(`${output}/pdf-inspection.json`,JSON.stringify(summary,null,2));
console.log(summary.map(({name,pages,thaiCharacters,replacementCharacters})=>({name,pages,thaiCharacters,replacementCharacters})));

