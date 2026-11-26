import { AnalyticsMonth } from '../payroll/analytics';
import { SalaryLine, salaryLines } from '../payroll/salary-statement';
import { formatMoney } from '../payroll/money';
import { formatThaiMonth } from '../payroll/dates';
import { createThaiPdfDoc } from './pdf-base';

export async function createSalaryPdf(report: AnalyticsMonth): Promise<Buffer> {
  const sections = salaryLines(report);
  const name = report.nickname || report.name || 'พนักงาน';
  const { doc, finish } = createThaiPdfDoc(`เงินเดือน ${name} ${report.month}`);

  const left = 48;
  const right = 547;
  const width = right - left;
  const navy = '#003566';
  const ink = '#102033';
  const muted = '#475569';
  const pale = '#f1f5f9';
  const stripe = '#f8fafc';
  const border = '#cbd5e1';

  const totalRows = Object.values(sections).reduce((n, rows) => n + Math.max(1, rows.length), 0);
  const compact = totalRows > 9;
  const dense = totalRows > 15;
  const font = dense ? 12.5 : compact ? 13.5 : 15;
  const padding = dense ? 0.5 : compact ? 2 : 5;
  const lineGap = dense ? 0 : 1;

  const text = (
    value: string,
    x: number,
    y: number,
    w: number,
    size = font,
    bold = false,
    align: 'left' | 'right' = 'left',
    color = ink
  ) => {
    doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(value, x, y, { width: w, align, lineGap });
  };
  const measured = (value: string, w: number, size = font) =>
    doc.font('Regular').fontSize(size).heightOfString(value, { width: w, lineGap });
  const line = (y: number, color = border, weight = 0.5) =>
    doc.strokeColor(color).lineWidth(weight).moveTo(left, y).lineTo(right, y).stroke();

  const drawTitle = () => {
    doc.rect(left, dense ? 24 : 32, width, 3).fill(navy);
    text('เงินเดือน', left, dense ? 30 : 40, 230, dense ? 30 : 34, true, 'left', navy);
    text(formatThaiMonth(report.month), 320, dense ? 38 : 49, right - 320, dense ? 17 : 19, true, 'right', ink);
    line(dense ? 74 : 86, border, 0.8);
  };

  drawTitle();

  const fullLabel = report.name && report.nickname && report.name !== report.nickname
    ? `${name} (${report.name})`
    : name;
  const metaText = report.position ? `ชื่อพนักงาน · ตำแหน่ง ${report.position}` : 'ชื่อพนักงาน';
  text(metaText, left, dense ? 82 : 96, width, 13, false, 'left', muted);

  let nameSize = dense ? 24 : 30;
  while (nameSize > 20 && doc.font('Bold').fontSize(nameSize).widthOfString(fullLabel) > width) nameSize--;
  const nameTop = dense ? 98 : 114;
  text(fullLabel, left, nameTop, width, nameSize, true, 'left', ink);
  let y = Math.max(dense ? 132 : 154, nameTop + measured(fullLabel, width, nameSize) + 2);

  text(`สรุปวันทำงาน (วันคิดค่าจ้าง ${report.paidDayUnits} วัน)`, left, y, width, dense ? 13 : 14.5, false, 'left', muted);
  y += dense ? 18 : 23;

  const holidayCount = report.days.filter(day => day.status === 'HOLIDAY').length;
  const labels = [
    ['เต็มวัน', report.full],
    ['ครึ่งวัน', report.half],
    ['ไม่มา', report.absent],
    ['วันหยุดร้าน', holidayCount]
  ];
  const cell = (width - 24) / 4;
  const cardH = dense ? 42 : 52;
  labels.forEach(([label, count], i) => {
    const x = left + i * (cell + 8);
    doc.roundedRect(x, y, cell, cardH, 4).fillAndStroke(pale, border);
    text(String(label), x + 9, y + (dense ? 4 : 7), cell - 18, 13, false, 'left', muted);
    text(`${count} วัน`, x + 9, y + (dense ? 20 : 25), cell - 18, dense ? 16 : 18.5, true, 'left', navy);
  });
  y += cardH + (dense ? 10 : 16);

  const newPage = () => {
    doc.addPage();
    drawTitle();
    text(fullLabel, left, dense ? 88 : 98, width, 18, true, 'left', ink);
    y = Math.max(dense ? 120 : 134, (dense ? 88 : 98) + measured(fullLabel, width, 18) + 8);
  };
  const ensure = (height: number) => {
    if (y + height > 778) newPage();
  };

  const dateW = 100;
  const amtW = 108;
  const descX = left + dateW + 10;
  const descW = width - dateW - amtW - 26;
  const amtX = right - amtW - 8;

  const table = (titleText: string, rows: SalaryLine[], total: number) => {
    const header = (continued = false) => {
      text(titleText + (continued ? ' (ต่อ)' : ''), left, y, width, dense ? 15.5 : 17, true, 'left', navy);
      y += dense ? 20 : compact ? 22 : 24;
      const headerHeight = dense ? 19 : compact ? 21 : 24;
      doc.rect(left, y, width, headerHeight).fill(pale);
      text('วันที่', left + 8, y + (dense ? 2.5 : 4), dateW, 13.5, true, 'left', ink);
      text('รายการ', descX, y + (dense ? 2.5 : 4), descW, 13.5, true, 'left', ink);
      text('จำนวนเงิน (บาท)', amtX, y + (dense ? 2.5 : 4), amtW, 13.5, true, 'right', ink);
      y += headerHeight;
      line(y, navy, 0.9);
    };
    ensure(82);
    header();
    const entries = rows.length ? rows : [{ date: '-', label: 'ไม่มีรายการ', satang: 0 }];
    entries.forEach((row, idx) => {
      const amountStr = formatMoney(row.satang);
      const height = Math.max(
        dense ? 14 : compact ? 16 : 19,
        measured(row.label, descW),
        measured(row.date, dateW),
        measured(amountStr, amtW)
      ) + padding * 2;
      if (y + height + 26 > 778) {
        newPage();
        header(true);
      }
      if (idx % 2 === 1) doc.rect(left, y, width, height).fill(stripe);
      text(row.date, left + 8, y + padding, dateW);
      text(row.label, descX, y + padding, descW);
      text(amountStr, amtX, y + padding, amtW, font, false, 'right');
      y += height;
      line(y, '#e2e8f0', 0.5);
    });
    ensure(28);
    const subH = dense ? 22 : compact ? 24 : 27;
    doc.rect(left, y, width, subH).fill(pale);
    text('รวม' + titleText.replace('รายการ', ''), left + 8, y + (dense ? 3.5 : 5.5), width - amtW - 24, dense ? 14 : 15, true, 'left', ink);
    text(formatMoney(total), amtX, y + (dense ? 3.5 : 5.5), amtW, dense ? 14 : 15, true, 'right', navy);
    y += subH + (dense ? 6 : compact ? 8 : 12);
  };

  table('รายการเงินที่ได้', sections.income, report.grossSatang);
  table('รายการเงินเบิก', sections.advances, report.advanceSatang);
  if (dense && !sections.deductions.length) {
    ensure(26);
    doc.rect(left, y, width, 22).fill(pale);
    text('รายการเงินหัก: ไม่มีรายการ', left + 8, y + 3.5, width - amtW - 24, 14, true, 'left', muted);
    text('0.00', amtX, y + 3.5, amtW, 14, true, 'right', muted);
    y += 28;
  } else {
    table('รายการเงินหัก', sections.deductions, report.deductionSatang);
  }

  ensure(62);
  const netBoxH = dense ? 54 : 60;
  doc.roundedRect(left, y, width, netBoxH, 5).fillAndStroke(pale, navy);
  text('ยอดเงินสุทธิที่ได้รับ', left + 14, y + (dense ? 8 : 10), 275, 16.5, true, 'left', navy);
  text(
    `รายรับ ${formatMoney(report.grossSatang)} - เบิก ${formatMoney(report.advanceSatang)} - หัก ${formatMoney(report.deductionSatang)}`,
    left + 14,
    y + (dense ? 30 : 34),
    285,
    13,
    false,
    'left',
    muted
  );
  const netText = `${formatMoney(report.totalSatang)} บาท`;
  let netSize = 24;
  while (netSize > 16 && doc.font('Bold').fontSize(netSize).widthOfString(netText) > 190) netSize -= 0.5;
  text(netText, right - 204, y + (dense ? 14 : 17), 190, netSize, true, 'right', navy);

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    line(796, border, 0.6);
    text(
      report.isClosed ? 'ยอดตามรอบเดือนที่ปิดบัญชี' : 'ยอดตามข้อมูล ณ วันที่ส่งออก',
      left,
      803,
      360,
      12.5,
      false,
      'left',
      muted
    );
    text(`หน้า ${i + 1} / ${pages.count}`, right - 100, 803, 100, 12.5, false, 'right', muted);
  }
  return finish();
}
