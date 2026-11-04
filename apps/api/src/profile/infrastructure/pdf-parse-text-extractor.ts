import { PDFParse } from "pdf-parse";
import {
  MAX_CV_PAGES,
  NoTextError,
  NotAPdfError,
  TooManyPagesError,
  type CvTextExtractor,
} from "../domain/cv-text-extractor.js";

const PDF_MAGIC = "%PDF-";

/** Reads the text layer of a PDF with `pdf-parse`. Scanned PDFs have none and are refused (no OCR). */
export class PdfParseTextExtractor implements CvTextExtractor {
  async extract(file: Buffer): Promise<string> {
    // Checked by content: the client-declared type and file name cannot be trusted.
    if (file.subarray(0, 1024).toString("latin1").indexOf(PDF_MAGIC) === -1) throw new NotAPdfError();

    const parser = new PDFParse({ data: new Uint8Array(file) });
    try {
      const info = await parser.getInfo().catch(() => {
        throw new NotAPdfError();
      });
      if (info.total > MAX_CV_PAGES) throw new TooManyPagesError(info.total);
      // Join the pages ourselves: the library's own joiner inserts "-- 1 of 2 --" markers.
      const { pages } = await parser.getText();
      const text = pages.map((page) => page.text).join("\n\n");
      const clean = text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      if (clean.length === 0) throw new NoTextError();
      return clean;
    } finally {
      await parser.destroy();
    }
  }
}
