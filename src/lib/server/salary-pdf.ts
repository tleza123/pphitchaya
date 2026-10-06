import PDFDocument from 'pdfkit';
import path from 'node:path';
import { AnalyticsMonth } from '../payroll/analytics';
import { SalaryLine, salaryLines } from '../payroll/salary-statement';
import { formatMoney } from '../payroll/money';
import { formatThaiMonth } from '../payroll/dates';

export async function createSalaryPdf(report: AnalyticsMonth): Promise<Buffer> {
  const sections = salaryLines(report);
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true,
    font: path.join(process.cwd(), 'src/assets/fonts/THSarabunNew.ttf'),
    info: { Title: `เงินเดือน ${report.nickname || report.name} ${report.month}` } });
  doc.registerFont('Regular', path.join(process.cwd(), 'src/assets/fonts/THSarabunNew.ttf'));
  doc.registerFont('Bold', path.join(process.cwd(), 'src/assets/fonts/THSarabunNew-Bold.ttf'));
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  });
  const left = 51, right = 544, width = right - left, pale = '#f3f6f9', ink = '#243447', muted = '#617084';
  const totalRows = Object.values(sections).reduce((n, rows) => n + Math.max(1, rows.length), 0);
  const compact = totalRows > 9;
  const dense = totalRows > 15;
  const font = dense ? 12.5 : compact ? 13 : 14.3, padding = compact ? .5 : 5;
  const lineGap = dense ? 0 : 1;
  const text = (value: string, x: number, y: number, w: number, size = font, bold = false, align: 'left' | 'right' = 'left', color = ink) => {
    doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(value, x, y, { width: w, align, lineGap });
  };
  const measured = (value: string, w: number, size = font) => doc.font('Regular').fontSize(size).heightOfString(value, { width: w, lineGap });
  const line = (y: number) => doc.strokeColor('#dce3eb').lineWidth(.5).moveTo(left, y).lineTo(right, y).stroke();
  const name = report.nickname || report.name || 'พนักงาน';
  const title = () => { text('เงินเดือน', left, dense ? 30 : 41, 230, dense ? 32 : 36, true); text(formatThaiMonth(report.month), 330, dense ? 37 : 50, 214, dense ? 17 : 19, true, 'right'); line(dense ? 76 : 88); };
  title();
  text('ชื่อพนักงาน', left, dense ? 88 : 101, 300, 13, false, 'left', muted);
  let nameSize = dense ? 26 : 32;
  while (nameSize > 22 && doc.font('Bold').fontSize(nameSize).widthOfString(name) > width) nameSize--;
  const nameTop = dense ? 105 : 121;
  text(name, left, nameTop, width, nameSize, true);
  let y = Math.max(dense ? 140 : 164, nameTop + measured(name, width, nameSize));
  text('จำนวนวันที่มาทำงาน', left, y, width, dense ? 13 : 14.3, false, 'left', muted); y += dense ? 20 : 26;
  const labels = [['เต็มวัน', report.full], ['ครึ่งวัน', report.half], ['ไม่มาทำงาน', report.absent], ['วันหยุดของร้าน', report.days.filter(day => day.status === 'HOLIDAY').length]];
  const cell = (width - 24) / 4;
  labels.forEach(([label, count], i) => {
    const x = left + i * (cell + 8);
    doc.roundedRect(x, y, cell, dense ? 44 : 53, 5).fill(pale);
    text(String(label), x + 8, y + (dense ? 4 : 7), cell - 16, 13, false, 'left', muted);
    text(`${count} วัน`, x + 8, y + (dense ? 22 : 27), cell - 16, dense ? 16 : 18, true);
  });
  y += dense ? 54 : 68;
  const newPage = () => { doc.addPage(); title(); text(name, left, 101, width, 18, true); y = Math.max(137, 101 + measured(name, width, 18) + 8); };
  const ensure = (height: number) => { if (y + height > 778) newPage(); };
  const table = (titleText: string, rows: SalaryLine[], total: number) => {
    const header = (continued = false) => {
      text(titleText + (continued ? ' ต่อ' : ''), left, y, width, dense ? 16 : 17, true); y += dense ? 22 : compact ? 23 : 25;
      const headerHeight = dense ? 20 : compact ? 21 : 23;
      doc.rect(left, y, width, headerHeight).fill(pale);
      text('วันที่', left + 8, y + 4, 97, 13, true, 'left', muted);
      text('รายการ', left + 112, y + 4, 264, 13, true, 'left', muted);
      text('จำนวนเงิน / บาท', right - 113, y + 4, 105, 13, true, 'right', muted); y += headerHeight;
    };
    ensure(85); header();
    const entries = rows.length ? rows : [{ date: '', label: 'ไม่มีรายการ', satang: 0 }];
    for (const row of entries) {
      const height = Math.max(compact ? 14 : 17, measured(row.label, 264), measured(row.date, 97), measured(formatMoney(row.satang), 105)) + padding * 2;
      if (y + height + 27 > 778) { newPage(); header(true); }
      text(row.date, left + 8, y + padding, 97);
      text(row.label, left + 112, y + padding, 264);
      text(formatMoney(row.satang), right - 113, y + padding, 105, font, false, 'right');
      y += height; line(y);
    }
    ensure(29);
    text('รวม' + titleText.replace('รายการ', ''), left + 8, y + 7, 330, 14.3, true);
    text(formatMoney(total), right - 113, y + 7, 105, 14.3, true, 'right'); y += dense ? 26 : compact ? 28 : 35;
  };
  table('รายการเงินที่ได้', sections.income, report.grossSatang);
  table('รายการเงินเบิก', sections.advances, report.advanceSatang);
  if (dense && !sections.deductions.length) {
    ensure(28);
    text('รายการเงินหัก: ไม่มีรายการ', left + 8, y + 4, 330, 14.3);
    text('0.00', right - 113, y + 4, 105, 14.3, false, 'right'); y += 28;
  } else table('รายการเงินหัก', sections.deductions, report.deductionSatang);
  ensure(63);
  doc.rect(left, y, width, 59).fillAndStroke(pale, '#dce3eb');
  text('ยอดเงินสุทธิที่ได้รับ', left + 14, y + 10, 270, 16, true);
  text(`${formatMoney(report.grossSatang)} - ${formatMoney(report.advanceSatang)} - ${formatMoney(report.deductionSatang)}`, left + 14, y + 33, 270, 13, false, 'left', muted);
  const netText = `${formatMoney(report.totalSatang)} บาท`;
  let netSize = 23.4;
  while (netSize > 16 && doc.font('Bold').fontSize(netSize).widthOfString(netText) > 191) netSize -= .5;
  text(netText, right - 205, y + 18, 191, netSize, true, 'right');
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i); line(796);
    text(report.isClosed ? 'ยอดตามรอบเดือนที่ปิดบัญชี' : 'ยอดตามข้อมูล ณ วันที่ส่งออก', left, 804, 350, 12, false, 'left', muted);
    text(`หน้า ${i + 1} / ${pages.count}`, right - 100, 804, 100, 12, false, 'right', muted);
  }
  doc.end(); return done;
}
