export const CV_TEXT_EXTRACTOR = Symbol("CV_TEXT_EXTRACTOR");

/** Reads the text of an uploaded CV. The format (PDF today) is the adapter's concern. */
export interface CvTextExtractor {
  extract(file: Buffer): Promise<string>;
}

export const MAX_CV_PAGES = 15;

/** The upload is not a PDF (checked by content, not by file name). */
export class NotAPdfError extends Error {
  constructor() {
    super("The file is not a PDF");
    this.name = "NotAPdfError";
  }
}

export class TooManyPagesError extends Error {
  constructor(
    public readonly pages: number,
    public readonly maxPages: number = MAX_CV_PAGES,
  ) {
    super(`The CV has ${pages} pages; the limit is ${maxPages}`);
    this.name = "TooManyPagesError";
  }
}

/** The PDF has no text layer (scanned image or empty). OCR is out of scope. */
export class NoTextError extends Error {
  constructor() {
    super("The PDF contains no readable text (is it a scan?)");
    this.name = "NoTextError";
  }
}
