export interface Chunk {
  pageNumber: number;
  chunkIndex: number;
  content: string;
}

/** Divide o texto de cada página em trechos (~maxChars) preservando a página de origem como localizador. */
export function chunkPages(pages: string[], maxChars = 1200, overlap = 150): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  pages.forEach((raw, i) => {
    const text = raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 40) return;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxChars, text.length);
      if (end < text.length) {
        // prefere cortar em fim de frase/parágrafo
        const cut = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf('\n', end));
        if (cut > start + maxChars * 0.5) end = cut + 1;
      }
      chunks.push({ pageNumber: i + 1, chunkIndex: index++, content: text.slice(start, end).trim() });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  });
  return chunks;
}
