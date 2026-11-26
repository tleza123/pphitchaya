import PDFDocument from 'pdfkit';
import path from 'node:path';

export const THAI_FONT_REGULAR = path.join(process.cwd(), 'src/assets/fonts/THSarabunNew.ttf');
export const THAI_FONT_BOLD = path.join(process.cwd(), 'src/assets/fonts/THSarabunNew-Bold.ttf');

export function createThaiPdfDoc(title?: string) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    font: THAI_FONT_REGULAR,
    ...(title ? { info: { Title: title } } : {})
  });
  doc.registerFont('Regular', THAI_FONT_REGULAR);
  doc.registerFont('Bold', THAI_FONT_BOLD);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  return {
    doc,
    finish: () => {
      doc.end();
      return done;
    }
  };
}
