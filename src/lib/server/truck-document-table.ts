export interface DocumentColumn { title: string; width: number; align?: 'left' | 'right' | 'center' }

/** Explicit page layout keeps Thai cells, column headers and footers out of PDFKit's implicit pagination. */
export class TruckDocumentTable {
  y = 38;
  readonly left = 40;
  readonly width = 515;
  private readonly bottom = 775;
  private repeatTable?: () => void;
  private headerBottom = 0;
  constructor(private doc: PDFKit.PDFDocument, private pageHeader: (layout: TruckDocumentTable) => void) { pageHeader(this); this.headerBottom = this.y; }

  private height(value: string, width: number, size = 14, bold = false) {
    return this.doc.font(bold ? 'Bold' : 'Regular').fontSize(size).heightOfString(value || ' ', { width, lineGap: 1 });
  }
  private draw(value: string, x: number, y: number, width: number, size = 14, bold = false, align: 'left' | 'right' | 'center' = 'left', color = '#172b43') {
    this.doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(color).text(value, x, y, { width, lineGap: 1, align });
  }
  headerText(value: string, size = 14, bold = false, align: 'left' | 'right' | 'center' = 'left') {
    const height = this.height(value, this.width, size, bold);
    this.draw(value, this.left, this.y, this.width, size, bold, align); this.y += height + 3;
  }
  private newPage() { this.doc.addPage(); this.y = 38; this.pageHeader(this); this.headerBottom = this.y; this.repeatTable?.(); }
  private ensure(height: number) { if (this.y + height > this.bottom) this.newPage(); }
  paragraph(value: string, size = 14, bold = false, align: 'left' | 'right' | 'center' = 'left') {
    this.ensure(this.height(value, this.width, size, bold) + 6); this.headerText(value, size, bold, align);
  }
  section(title: string) { this.repeatTable = undefined; this.ensure(75); this.y += 10; this.headerText(title, 16, true); this.y += 5; }

  table(columns: DocumentColumn[], rows: string[][]) {
    let headerHeight = 25;
    const header = () => {
      const height = Math.max(25, ...columns.map(column => this.height(column.title, column.width - 12, 13, true) + 12));
      headerHeight = height;
      this.doc.rect(this.left, this.y, this.width, height).fill('#edf2f7');
      let x = this.left;
      for (const column of columns) { this.draw(column.title, x + 6, this.y + 6, column.width - 12, 13, true, column.align); x += column.width; }
      this.y += height;
    };
    this.ensure(65); header(); this.repeatTable = header;
    if (!rows.length) this.paragraph('ไม่มีรายการ', 14, false, 'center');
    const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
    for (const row of rows) {
      let remaining = columns.map((_, index) => String(row[index] ?? ''));
      const fullHeight = Math.max(25, ...remaining.map((value, index) => this.height(value, columns[index].width - 12) + 12));
      if (this.y + fullHeight > this.bottom && fullHeight <= this.bottom - this.headerBottom - headerHeight) this.newPage();
      do {
        this.ensure(30);
        const available = this.bottom - this.y - 12;
        const chunks = remaining.map((value, index) => {
          if (!value || this.height(value, columns[index].width - 12) <= available) return value;
          const graphemes = [...segmenter.segment(value)].map(part => part.segment);
          let low = 0, high = graphemes.length;
          while (low < high) { const middle = Math.ceil((low + high) / 2); if (this.height(graphemes.slice(0, middle).join(''), columns[index].width - 12) <= available) low = middle; else high = middle - 1; }
          return graphemes.slice(0, Math.max(1, low)).join('');
        });
        const height = Math.max(25, ...chunks.map((value, index) => this.height(value, columns[index].width - 12) + 12));
        let x = this.left;
        chunks.forEach((value, index) => { if (value) this.draw(value, x + 6, this.y + 6, columns[index].width - 12, 14, false, columns[index].align); x += columns[index].width; });
        this.y += height;
        this.doc.strokeColor('#d7e0ea').lineWidth(.5).moveTo(this.left, this.y).lineTo(this.left + this.width, this.y).stroke();
        remaining = remaining.map((value, index) => value.slice(chunks[index].length));
        if (remaining.some(Boolean)) this.newPage();
      } while (remaining.some(Boolean));
    }
    this.repeatTable = undefined; this.y += 8;
  }
  footers() {
    const pages = this.doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index++) {
      this.doc.switchToPage(index);
      this.draw(`หน้า ${index + 1} / ${pages.count}`, this.left, 808, this.width, 11, false, 'right', '#617084');
    }
  }
}
