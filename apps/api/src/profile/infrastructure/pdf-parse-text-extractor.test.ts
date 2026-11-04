import { describe, expect, it } from "vitest";
import { makePdf } from "../../../test/helpers/make-pdf.js";
import { MAX_CV_PAGES, NoTextError, NotAPdfError, TooManyPagesError } from "../domain/cv-text-extractor.js";
import { PdfParseTextExtractor } from "./pdf-parse-text-extractor.js";

const extractor = new PdfParseTextExtractor();

describe("PdfParseTextExtractor", () => {
  it("returns the text of every page", async () => {
    const pdf = makePdf([["Jane Doe", "Backend developer (Node.js)"], ["Education", "BSc Informatics 2013"]]);
    const text = await extractor.extract(pdf);
    expect(text).toContain("Backend developer (Node.js)");
    expect(text).toContain("BSc Informatics 2013");
  });

  it("refuses a file that is not a PDF, whatever its name says", async () => {
    await expect(extractor.extract(Buffer.from("just some text, not a pdf"))).rejects.toBeInstanceOf(NotAPdfError);
    await expect(extractor.extract(Buffer.alloc(0))).rejects.toBeInstanceOf(NotAPdfError);
  });

  it("refuses a corrupt PDF", async () => {
    await expect(extractor.extract(Buffer.from("%PDF-1.4\nthis is broken"))).rejects.toBeInstanceOf(NotAPdfError);
  });

  it("refuses a PDF without a text layer (a scan)", async () => {
    await expect(extractor.extract(makePdf([[]]))).rejects.toBeInstanceOf(NoTextError);
  });

  it("refuses a PDF with too many pages before reading it", async () => {
    const pages = Array.from({ length: MAX_CV_PAGES + 1 }, (_, index) => [`Page ${index + 1}`]);
    await expect(extractor.extract(makePdf(pages))).rejects.toBeInstanceOf(TooManyPagesError);
  });
});
