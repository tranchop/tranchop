import { createHash } from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';

export interface ExtractedPdf {
  sha256: string;
  pageCount: number;
  pages: string[];
}

/** Extrai texto página a página. PDFs escaneados (sem camada de texto) retornam páginas vazias — OCR está fora do MVP. */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedPdf> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { sha256, pageCount: totalPages, pages: text };
}
