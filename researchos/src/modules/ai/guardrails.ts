/**
 * Guardrails anti-alucinação. Funções puras (testáveis) que checam a saída da IA contra o texto-fonte.
 * Regra de ouro: o que não pode ser verificado nunca é apresentado como "extraído da fonte".
 */

export const NO_INFO_MESSAGE = 'Não há informação suficiente na base de conhecimento para responder a isso.';

/** Normaliza para comparação: minúsculas, sem acentos, sem hifenização de quebra de linha, espaços colapsados. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-\s*\n\s*/g, '') // palavra hifenizada na quebra de linha
    .replace(/[“”„"«»]/g, '"')
    .replace(/[‘’`´']/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** O trecho citado existe literalmente (após normalização) no texto da página? */
export function quoteInSource(quote: string, sourceText: string): boolean {
  const q = normalize(quote).replace(/\.\.\.|…/g, ' ').trim();
  if (q.length < 12) return false; // trechos curtos demais não provam nada
  // aceita elipses: cada fragmento entre "..." precisa existir, em ordem
  const parts = normalize(quote).split(/\.\.\.|…/).map((p) => p.trim()).filter((p) => p.length >= 8);
  if (parts.length === 0) return false;
  const hay = normalize(sourceText);
  let from = 0;
  for (const part of parts) {
    const idx = hay.indexOf(part, from);
    if (idx === -1) return false;
    from = idx + part.length;
  }
  return true;
}

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g;

/** Extrai DOIs literalmente presentes no texto. DOI nunca vem do modelo. */
export function extractDois(text: string): string[] {
  const found = (text.match(DOI_RE) ?? []).map((d) => d.replace(/[.,;:)\]]+$/, '').toLowerCase());
  return [...new Set(found)];
}

/** Números (inclui decimais com vírgula/ponto e porcentagens) presentes no texto. */
export function numbersIn(text: string): string[] {
  const m = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return [...new Set(m.map((n) => n.replace(/,/g, '.')))];
}

/** Números do texto gerado que NÃO aparecem em nenhuma das fontes. */
export function unsupportedNumbers(generated: string, sources: string[]): string[] {
  const known = new Set(sources.flatMap(numbersIn));
  return numbersIn(generated).filter((n) => !known.has(n));
}

/** Extrai o primeiro objeto JSON de uma resposta de modelo (tolera cercas ```json). */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('Resposta da IA não contém JSON.');
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}
