import 'server-only';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { formatMoney } from '../payroll/money';
import { formatThaiMonth, formatThaiDate } from '../payroll/dates';
import { TruckMonthlyReport, TruckMonthlyRow, TruckDailyRecordDoc } from '../truck/types';

/**
 * Generates an A4 PDF monthly report for the truck operations.
 */
export async function createTruckReportPdf(
  report: TruckMonthlyReport,
  companyName = 'ระบบบันทึกงานรถสิบล้อ',
  truckFilter?: string
): Promise<Buffer> {
  const fontRegular = path.join(process.cwd(), 'src/assets/fonts/THSarabunNew.ttf');
  const fontBold = path.join(process.cwd(), 'src/assets/fonts/THSarabunNew-Bold.ttf');

  const filteredTruck = truckFilter
    ? report.perTruck.find(t => t.truckId === truckFilter)
    : undefined;

  const records: TruckDailyRecordDoc[] = truckFilter
    ? report.records.filter(r => r.truckId === truckFilter)
    : [...report.records];

  const perTruckRows: TruckMonthlyRow[] = truckFilter
    ? report.perTruck.filter(t => t.truckId === truckFilter)
    : [...report.perTruck];

  const totalTrips = records.reduce((sum, r) => sum + r.tripCount, 0);
  const totalDriverPaySatang = records.reduce((sum, r) => sum + r.totalDriverPaySatang, 0);

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    font: fontRegular,
    info: {
      Title: `รายงานรถสิบล้อ ${report.monthKey}`
    }
  });

  doc.registerFont('Regular', fontRegular);
  doc.registerFont('Bold', fontBold);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 45;
  const right = 550;
  const width = right - left;
  const pale = '#f3f6fa';
  const ink = '#0f2942';
  const muted = '#617084';
  const borderCol = '#d7e0ea';

  let y = 35;

  const text = (
    value: string,
    x: number,
    yPos: number,
    w: number,
    size = 14,
    bold = false,
    align: 'left' | 'right' | 'center' = 'left',
    color = ink
  ) => {
    doc
      .font(bold ? 'Bold' : 'Regular')
      .fontSize(size)
      .fillColor(color)
      .text(value, x, yPos, { width: w, align, lineGap: 1 });
  };

  const line = (yPos: number) => {
    doc.strokeColor(borderCol).lineWidth(0.5).moveTo(left, yPos).lineTo(right, yPos).stroke();
  };

  const drawHeader = (isContinuation = false) => {
    text(companyName, left, y, 320, 20, true, 'left', ink);
    const monthText = `ประจำเดือน ${formatThaiMonth(report.monthKey)}`;
    text(monthText, right - 220, y + 2, 220, 16, true, 'right', muted);
    y += 24;

    const sub = isContinuation
      ? '(ต่อ)'
      : filteredTruck
      ? `สรุปเฉพาะคัน: ${filteredTruck.plateNumber} (คนขับ: ${filteredTruck.driverName})`
      : 'สรุปภาพรวมการวิ่งงานทุกคัน';
    text(sub, left, y, width, 13, false, 'left', muted);
    y += 18;
    line(y);
    y += 10;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > 770) {
      doc.addPage();
      y = 35;
      drawHeader(true);
    }
  };

  // Draw initial header
  drawHeader(false);

  // KPI Summary Strip (4 cards)
  const cardGap = 8;
  const cardWidth = (width - cardGap) / 2;
  const cardHeight = 48;

  const kpis = [
    { label: 'เที่ยววิ่งทั้งหมด', value: `${totalTrips.toLocaleString('th-TH')} เที่ยว` },
    { label: 'ค่าเที่ยวคนขับรวม', value: `${formatMoney(totalDriverPaySatang)} บ.` },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = left + idx * (cardWidth + cardGap);
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 4).fillAndStroke(pale, borderCol);
    text(kpi.label, cardX + 6, y + 6, cardWidth - 12, 11, false, 'left', muted);
    text(kpi.value, cardX + 6, y + 24, cardWidth - 12, 13.5, true, 'left', ink);
  });

  y += cardHeight + 14;

  // Section 1: Per-truck summary (only if multiple trucks / not filtered to single truck)
  if (!filteredTruck && perTruckRows.length > 0) {
    ensureSpace(60);
    text('สรุปผลงานแยกตามคันรถ', left, y, width, 15, true, 'left', ink);
    y += 20;

    // Table Header
    doc.rect(left, y, width, 22).fill(pale);
    text('ทะเบียนรถ', left + 8, y + 4, 90, 12, true, 'left', muted);
    text('คนขับประจำ', left + 105, y + 4, 120, 12, true, 'left', muted);
    text('เที่ยววิ่ง', left + 230, y + 4, 55, 12, true, 'right', muted);
    text('ค่าเที่ยว (บาท)', left + 295, y + 4, 100, 12, true, 'right', muted);
    y += 22;

    for (const tr of perTruckRows) {
      ensureSpace(20);
      text(tr.plateNumber, left + 8, y + 3, 90, 12, true);
      text(tr.driverName, left + 105, y + 3, 120, 12, false);
      text(`${tr.tripCount}`, left + 230, y + 3, 55, 12, false, 'right');
      text(formatMoney(tr.totalDriverPaySatang), left + 295, y + 3, 100, 12, false, 'right');
      y += 18;
      line(y);
    }

    y += 14;
  }

  // Section 2: Detailed Daily Records
  ensureSpace(60);
  text('ประวัติการวิ่งงานรายวัน', left, y, width, 15, true, 'left', ink);
  y += 20;

  // Detail Table Header
  doc.rect(left, y, width, 22).fill(pale);
  text('วันที่', left + 8, y + 4, 75, 12, true, 'left', muted);
  text('ทะเบียนรถ / คนขับ', left + 88, y + 4, 115, 12, true, 'left', muted);
  text('เส้นทาง / หมายเหตุ', left + 208, y + 4, 140, 12, true, 'left', muted);
  text('ค่าเที่ยว (บาท)', left + 352, y + 4, 75, 12, true, 'right', muted);
  y += 22;

  if (records.length === 0) {
    ensureSpace(30);
    text('ไม่มีรายการวิ่งงานในเดือนนี้', left, y + 8, width, 13, false, 'center', muted);
    y += 30;
  } else {
    for (const rec of records) {
      const tripsSummary = rec.trips.length > 0
        ? rec.trips.map(t => `${t.fromLocation} -> ${t.destinationName}${t.note ? ` (${t.note})` : ''}`).join('\n')
        : '-';

      const tripsHeight = Math.max(18, doc.font('Regular').fontSize(11).heightOfString(tripsSummary, { width: 140, lineGap: 1 }));
      const rowHeight = tripsHeight + 10;

      ensureSpace(rowHeight);

      text(formatThaiDate(rec.dateKey, { day: 'numeric', month: 'short' }), left + 8, y + 4, 75, 12);
      text(`${rec.plateNumberSnapshot}\n${rec.driverNameSnapshot}`, left + 88, y + 4, 115, 11);
      text(tripsSummary, left + 208, y + 4, 140, 11);
      text(formatMoney(rec.totalDriverPaySatang), left + 352, y + 4, 75, 12, false, 'right');

      y += rowHeight;
      line(y);
    }
  }

  // Draw Page numbers
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    line(794);
    text('ระบบบันทึกงานรถสิบล้อ • พี.พิชญา', left, 802, 300, 11, false, 'left', muted);
    text(`หน้า ${i + 1} / ${pages.count}`, right - 100, 802, 100, 11, false, 'right', muted);
  }

  doc.end();
  return done;
}
