import { test } from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { createTruckReportPdf } from '../src/lib/server/truck-pdf';
import { reportQaFixture } from '../scripts/truck-report-pdf-qa';

test('report repeats table headers and explicitly splits a record taller than a page without losing its ending', async () => {
  const original = PDFDocument.prototype.text;
  const pages = new Map<object, string[]>();
  PDFDocument.prototype.text = function(this: PDFKit.PDFDocument, value: string, ...args: any[]) {
    const texts = pages.get(this.page) || []; texts.push(String(value)); pages.set(this.page, texts);
    return original.call(this, value, ...args as [any]);
  } as typeof original;
  const report = reportQaFixture(); const before = JSON.stringify(report);
  assert.equal(report.perTruck.reduce((sum,r)=>sum+r.tripCount,0),80);
  assert.equal(report.perTruck.reduce((sum,r)=>sum+r.totalDriverPaySatang,0),1200000);
  try {
    const pdf = await createTruckReportPdf(report);
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pages.size > 5, 'fixture exercises summary, detail and oversized row continuation');
    for (const texts of pages.values()) {
      assert.ok(texts.includes('คนขับประจำ') || texts.includes('เส้นทาง / หมายเหตุ'), 'each page repeats the active table header');
      assert.ok(texts.some(t => /^หน้า \d+ \/ \d+$/.test(t)), 'every page gets a footer');
    }
    const all = [...pages.values()].flat().join('');
    assert.ok(all.includes('สิ้นสุดหมายเหตุยาว'), 'long row ending is retained');
    assert.ok(all.includes('รายการทดสอบ 80'), 'last record is retained');
    assert.equal(JSON.stringify(report), before);
  } finally { PDFDocument.prototype.text = original; }
});
