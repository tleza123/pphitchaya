import 'server-only';
import { formatMoney } from '../payroll/money';
import { formatThaiMonth, formatThaiDate } from '../payroll/dates';
import { TruckMonthlyReport, TruckMonthlyRow, TruckDailyRecordDoc } from '../truck/types';
import { createThaiPdfDoc } from './pdf-base';

/**
 * Generates an A4 PDF monthly report for the truck operations.
 */
export async function createTruckReportPdf(
  report: TruckMonthlyReport,
  companyName = 'ระบบบันทึกงานรถสิบล้อ',
  truckFilter?: string
): Promise<Buffer> {
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

  const { doc, finish } = createThaiPdfDoc(`รายงานรถสิบล้อ ${report.monthKey}`);

  const left = 42;
  const right = 553;
  const width = right - left; // 511pt full usable A4 width
  const pale = '#f1f5f9';
  const stripe = '#f8fafc';
  const ink = '#0f2942';
  const bodyInk = '#102033';
  const muted = '#475569';
  const borderCol = '#cbd5e1';

  let y = 30;
  let repeatTableHeader: (() => void) | undefined;

  const text = (
    value: string,
    x: number,
    yPos: number,
    w: number,
    size = 14,
    bold = false,
    align: 'left' | 'right' | 'center' = 'left',
    color = bodyInk
  ) => {
    doc
      .font(bold ? 'Bold' : 'Regular')
      .fontSize(size)
      .fillColor(color)
      .text(value, x, yPos, { width: w, align, lineGap: 1.5 });
  };

  const line = (yPos: number, color = borderCol, weight = 0.5) => {
    doc.strokeColor(color).lineWidth(weight).moveTo(left, yPos).lineTo(right, yPos).stroke();
  };

  const drawHeader = (isContinuation = false) => {
    doc.rect(left, 26, width, 3).fill(ink);
    y = 35;
    text(companyName, left, y, 310, 21, true, 'left', ink);
    const monthText = `ประจำเดือน ${formatThaiMonth(report.monthKey)}`;
    text(monthText, right - 200, y + 3, 200, 16, true, 'right', muted);
    y += 26;

    const sub = isContinuation
      ? '(ต่อ)'
      : filteredTruck
      ? `เฉพาะรถทะเบียน ${filteredTruck.plateNumber} (คนขับ: ${filteredTruck.driverName})`
      : 'สรุปการวิ่งงานทุกคัน';
    text(sub, left, y, width, 14, false, 'left', muted);
    y += 20;
    line(y, borderCol, 0.8);
    y += 10;
  };

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > 770) {
      doc.addPage();
      drawHeader(true);
      repeatTableHeader?.();
    }
  };

  drawHeader(false);

  // KPI Summary Strip (2 spacious cards)
  const cardGap = 10;
  const cardWidth = (width - cardGap) / 2;
  const cardHeight = 54;
  const kpis = [
    { label: 'เที่ยววิ่งทั้งหมด', value: `${totalTrips.toLocaleString('th-TH')} เที่ยว` },
    { label: 'ค่าเที่ยวคนขับรวม', value: `${formatMoney(totalDriverPaySatang)} บาท` }
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = left + idx * (cardWidth + cardGap);
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 4).fillAndStroke(pale, borderCol);
    text(kpi.label, cardX + 10, y + 7, cardWidth - 20, 13, false, 'left', muted);
    text(kpi.value, cardX + 10, y + 25, cardWidth - 20, 17.5, true, 'left', ink);
  });

  y += cardHeight + 16;

  // Section 1: Per-truck summary (full 511pt width)
  if (!filteredTruck && perTruckRows.length > 0) {
    ensureSpace(64);
    text('สรุปแยกตามคันรถ', left, y, width, 16.5, true, 'left', ink);
    y += 22;

    const summaryHeader = () => {
      doc.rect(left, y, width, 25).fill(pale);
      text('ทะเบียนรถ', left + 8, y + 5, 115, 13.5, true, 'left', ink);
      text('คนขับประจำ', left + 128, y + 5, 195, 13.5, true, 'left', ink);
      text('เที่ยววิ่ง', left + 328, y + 5, 65, 13.5, true, 'right', ink);
      text('ค่าเที่ยว (บาท)', left + 398, y + 5, 105, 13.5, true, 'right', ink);
      y += 25;
      line(y, ink, 0.9);
    };
    summaryHeader();
    repeatTableHeader = summaryHeader;

    perTruckRows.forEach((tr, idx) => {
      const rowHeight = Math.max(
        22,
        doc.font('Regular').fontSize(14).heightOfString(tr.driverName, { width: 195, lineGap: 1.5 }) + 8,
        doc.font('Bold').fontSize(14).heightOfString(tr.plateNumber, { width: 115, lineGap: 1.5 }) + 8
      );
      ensureSpace(rowHeight);
      if (idx % 2 === 1) doc.rect(left, y, width, rowHeight).fill(stripe);
      text(tr.plateNumber, left + 8, y + 4, 115, 14, true);
      text(tr.driverName, left + 128, y + 4, 195, 14, false);
      text(`${tr.tripCount}`, left + 328, y + 4, 65, 14, false, 'right');
      text(formatMoney(tr.totalDriverPaySatang), left + 398, y + 4, 105, 14, true, 'right', ink);
      y += rowHeight;
      line(y, '#e2e8f0', 0.5);
    });

    y += 16;
    repeatTableHeader = undefined;
  }

  // Section 2: Detailed Daily Records (full 511pt width)
  ensureSpace(64);
  text('ประวัติการวิ่งงานรายวัน', left, y, width, 16.5, true, 'left', ink);
  y += 22;

  const colDateX = left + 8;
  const colDateW = 72;
  const colTruckX = left + 84;
  const colTruckW = 115;
  const colRouteX = left + 205;
  const colRouteW = 205;
  const colPayX = left + 415;
  const colPayW = 88;

  const detailHeader = () => {
    doc.rect(left, y, width, 25).fill(pale);
    text('วันที่', colDateX, y + 5, colDateW, 13.5, true, 'left', ink);
    text('ทะเบียนรถ / คนขับ', colTruckX, y + 5, colTruckW, 13.5, true, 'left', ink);
    text('เส้นทาง / หมายเหตุ', colRouteX, y + 5, colRouteW, 13.5, true, 'left', ink);
    text('ค่าเที่ยว (บาท)', colPayX, y + 5, colPayW, 13.5, true, 'right', ink);
    y += 25;
    line(y, ink, 0.9);
  };
  detailHeader();
  repeatTableHeader = detailHeader;

  if (records.length === 0) {
    ensureSpace(32);
    text('ไม่มีรายการวิ่งงานในเดือนนี้', left, y + 8, width, 14.5, false, 'center', muted);
    y += 32;
  } else {
    const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
    records.forEach((rec, recIdx) => {
      const tripsSummary = rec.trips.length > 0
        ? rec.trips.map(t => `${t.fromLocation} - ${t.destinationName}${t.note ? ` (${t.note})` : ''}`).join('\n')
        : '-';

      let remaining = [`${rec.plateNumberSnapshot}\n${rec.driverNameSnapshot}`, tripsSummary];
      let first = true;
      const shade = recIdx % 2 === 1;

      do {
        ensureSpace(38);
        const available = 770 - y - 10;
        const parts = remaining.map((value, index) => {
          const w = index === 0 ? colTruckW : colRouteW;
          const pieces = [...segmenter.segment(value)].map(s => s.segment);
          let lo = 0, hi = pieces.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            const h = doc.font('Regular').fontSize(13.5).heightOfString(pieces.slice(0, mid).join(''), { width: w, lineGap: 1.5 });
            if (h <= available) lo = mid;
            else hi = mid - 1;
          }
          return [pieces.slice(0, lo).join(''), pieces.slice(lo).join('')];
        });
        const rowHeight = Math.max(
          22,
          ...parts.map(([value], index) =>
            doc.font('Regular').fontSize(13.5).heightOfString(value, { width: index === 0 ? colTruckW : colRouteW, lineGap: 1.5 })
          )
        ) + 10;
        if (shade) doc.rect(left, y, width, rowHeight).fill(stripe);
        text(first ? formatThaiDate(rec.dateKey, { day: 'numeric', month: 'short' }) : '(ต่อ)', colDateX, y + 4, colDateW, 13.5);
        text(parts[0][0], colTruckX, y + 4, colTruckW, 13.5);
        text(parts[1][0], colRouteX, y + 4, colRouteW, 13.5);
        if (first) text(formatMoney(rec.totalDriverPaySatang), colPayX, y + 4, colPayW, 13.5, true, 'right', ink);
        y += rowHeight;
        line(y, '#e2e8f0', 0.5);
        remaining = parts.map(([, rest]) => rest);
        first = false;
        if (remaining.some(Boolean)) {
          doc.addPage();
          drawHeader(true);
          detailHeader();
        }
      } while (remaining.some(Boolean));
    });
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    line(794, borderCol, 0.6);
    text('ระบบบันทึกงานรถสิบล้อ · พี.พิชญา', left, 802, 320, 12.5, false, 'left', muted);
    text(`หน้า ${i + 1} / ${pages.count}`, right - 100, 802, 100, 12.5, false, 'right', muted);
  }

  return finish();
}
