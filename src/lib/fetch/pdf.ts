/**
 * Thin wrapper around pdf-parse that only loads the core parser and skips the
 * library's debug block (which reads a sample PDF from disk at module load
 * time — that breaks on Vercel serverless because the file isn't bundled).
 *
 * `pdf-parse/lib/pdf-parse.js` is the actual implementation without the debug
 * side-effect.
 */

// eslint-disable-next-line
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  data: Buffer
) => Promise<{ text: string; numpages: number; info: unknown }>;

export interface PdfExtractResult {
  text: string;
  page_count: number;
}

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const result = await pdfParse(buffer);
  const text = (result.text ?? "").trim();
  return { text, page_count: result.numpages ?? 0 };
}
