export interface DocumentColumn {
  title: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

/** Explicit page layout keeps Thai cells, column headers and footers out of PDFKit's implicit pagination. */
export class TruckDocumentTable {
  y = 36;
  readonly left = 40;
  readonly width = 515;
  private readonly bottom = 775;
  private repeatTable?: () => void;
  private headerBottom = 0;

  constructor(private doc: PDFKit.PDFDocument, private pageHeader: (layout: TruckDocumentTable) => void) {
    pageHeader(this);
    this.headerBottom = this.y;
  }

  private height(value: string, width: number, size = 15, bold = false) {
    return this.doc.font(bold ? 'Bold' : 'Regular').fontSize(size).heightOfString(value || ' ', { width, lineGap: 1.5 });
  }

  private draw(
    value: string,
    x: number,
    y: number,
    width: number,
    size = 15,
    bold = false,
    align: 'left' | 'right' | 'center' = 'left',
    color = '#102033'
  ) {
    this.doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(value, x, y, { width, lineGap: 1.5, align });
  }

  headerText(value: string, size = 14.5, bold = false, align: 'left' | 'right' | 'center' = 'left', color = '#102033') {
    const height = this.height(value, this.width, size, bold);
    this.draw(value, this.left, this.y, this.width, size, bold, align, color);
    this.y += height + 3;
  }

  rule(color = '#cbd5e1', weight = 0.75) {
    this.doc.strokeColor(color).lineWidth(weight).moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).stroke();
    this.y += 6;
  }

  private newPage() {
    this.doc.addPage();
    this.y = 36;
    this.pageHeader(this);
    this.headerBottom = this.y;
    this.repeatTable?.();
  }

  private ensure(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }

  paragraph(value: string, size = 15, bold = false, align: 'left' | 'right' | 'center' = 'left', color = '#102033') {
    this.ensure(this.height(value, this.width, size, bold) + 6);
    this.headerText(value, size, bold, align, color);
  }

  section(title: string) {
    this.repeatTable = undefined;
    this.ensure(75);
    this.y += 10;
    this.headerText(title, 17, true, 'left', '#0f2942');
    this.y += 4;
  }

  summaryBox(label: string, value: string, detail?: string) {
    this.repeatTable = undefined;
    const boxHeight = detail ? 56 : 44;
    this.ensure(boxHeight + 8);
    this.y += 4;
    this.doc.roundedRect(this.left, this.y, this.width, boxHeight, 4).fillAndStroke('#f1f5f9', '#0f2942');
    this.draw(label, this.left + 12, this.y + (detail ? 9 : 11), 260, 16, true, 'left', '#0f2942');
    if (detail) {
      this.draw(detail, this.left + 12, this.y + 31, 280, 13, false, 'left', '#475569');
    }
    this.draw(value, this.left + 280, this.y + (detail ? 14 : 10), this.width - 292, 19, true, 'right', '#0f2942');
    this.y += boxHeight + 10;
  }

  signatures(leftLabel: string, rightLabel: string) {
    this.repeatTable = undefined;
    this.ensure(76);
    this.y += 16;
    const colW = 210;
    const rightX = this.left + this.width - colW;
    const lineY = this.y + 28;
    this.doc.strokeColor('#94a3b8').lineWidth(0.75)
      .moveTo(this.left + 10, lineY).lineTo(this.left + colW - 10, lineY)
      .moveTo(rightX + 10, lineY).lineTo(rightX + colW - 10, lineY)
      .stroke();
    this.draw(leftLabel, this.left, lineY + 6, colW, 13.5, false, 'center', '#475569');
    this.draw(rightLabel, rightX, lineY + 6, colW, 13.5, false, 'center', '#475569');
    this.draw('วันที่ ......... / ......... / .........', this.left, lineY + 24, colW, 12.5, false, 'center', '#64748b');
    this.draw('วันที่ ......... / ......... / .........', rightX, lineY + 24, colW, 12.5, false, 'center', '#64748b');
    this.y = lineY + 44;
  }

  table(columns: DocumentColumn[], rows: string[][]) {
    let headerHeight = 28;
    const header = () => {
      const height = Math.max(28, ...columns.map(column => this.height(column.title, column.width - 12, 14, true) + 12));
      headerHeight = height;
      this.doc.rect(this.left, this.y, this.width, height).fill('#edf2f7');
      let x = this.left;
      for (const column of columns) {
        this.draw(column.title, x + 6, this.y + 6, column.width - 12, 14, true, column.align, '#0f2942');
        x += column.width;
      }
      this.y += height;
      this.doc.strokeColor('#0f2942').lineWidth(1).moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).stroke();
    };
    this.ensure(68);
    header();
    this.repeatTable = header;
    if (!rows.length) this.paragraph('ไม่มีรายการ', 14.5, false, 'center', '#475569');
    const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
    let rowIndex = 0;
    for (const row of rows) {
      const shade = rowIndex % 2 === 1;
      rowIndex++;
      let remaining = columns.map((_, index) => String(row[index] ?? ''));
      const fullHeight = Math.max(26, ...remaining.map((value, index) => this.height(value, columns[index].width - 12, 14.5) + 12));
      if (this.y + fullHeight > this.bottom && fullHeight <= this.bottom - this.headerBottom - headerHeight) this.newPage();
      do {
        this.ensure(30);
        const available = this.bottom - this.y - 12;
        const chunks = remaining.map((value, index) => {
          if (!value || this.height(value, columns[index].width - 12, 14.5) <= available) return value;
          const graphemes = [...segmenter.segment(value)].map(part => part.segment);
          let low = 0, high = graphemes.length;
          while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (this.height(graphemes.slice(0, middle).join(''), columns[index].width - 12, 14.5) <= available) low = middle;
            else high = middle - 1;
          }
          return graphemes.slice(0, Math.max(1, low)).join('');
        });
        const height = Math.max(26, ...chunks.map((value, index) => this.height(value, columns[index].width - 12, 14.5) + 12));
        if (shade) this.doc.rect(this.left, this.y, this.width, height).fill('#f8fafc');
        let x = this.left;
        chunks.forEach((value, index) => {
          if (value) this.draw(value, x + 6, this.y + 6, columns[index].width - 12, 14.5, false, columns[index].align);
          x += columns[index].width;
        });
        this.y += height;
        this.doc.strokeColor('#d5dfe9').lineWidth(0.5).moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).stroke();
        remaining = remaining.map((value, index) => value.slice(chunks[index].length));
        if (remaining.some(Boolean)) this.newPage();
      } while (remaining.some(Boolean));
    }
    this.repeatTable = undefined;
    this.y += 8;
  }

  footers() {
    const pages = this.doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index++) {
      this.doc.switchToPage(index);
      this.doc.strokeColor('#cbd5e1').lineWidth(0.6).moveTo(this.left, 796).lineTo(this.left + this.width, 796).stroke();
      this.draw(`หน้า ${index + 1} / ${pages.count}`, this.left, 803, this.width, 12.5, false, 'right', '#475569');
    }
  }
}
