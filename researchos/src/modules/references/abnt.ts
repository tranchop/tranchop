/** Formatação ABNT (NBR 6023 / 10520) a partir de metadados do banco. Nunca preenche lacunas com suposições. */
export interface RefArticle {
  title: string;
  authors: { family: string; given?: string }[];
  year: number | null;
  journal?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
}

const upper = (s: string) => s.toLocaleUpperCase('pt-BR');

function authorList(authors: RefArticle['authors']): string {
  const fmt = (a: RefArticle['authors'][number]) => (a.given ? `${upper(a.family)}, ${a.given}` : upper(a.family));
  if (authors.length === 0) return '';
  if (authors.length > 3) return `${fmt(authors[0])} et al.`;
  return authors.map(fmt).join('; ');
}

/** Referência completa (lista de referências). */
export function formatAbntReference(a: RefArticle): string {
  const parts: string[] = [];
  const auth = authorList(a.authors);
  parts.push(auth ? `${auth}.` : '');
  parts.push(`${a.title.replace(/\.$/, '')}.`);
  if (a.journal) {
    const bits = [a.journal];
    if (a.volume) bits.push(`v. ${a.volume}`);
    if (a.issue) bits.push(`n. ${a.issue}`);
    if (a.pages) bits.push(`p. ${a.pages}`);
    bits.push(a.year ? String(a.year) : '[s.d.]');
    parts.push(`${bits.join(', ')}.`);
  } else {
    parts.push(`${a.year ?? '[s.d.]'}.`);
  }
  if (a.doi) parts.push(`DOI: ${a.doi}.`);
  return parts.filter(Boolean).join(' ');
}

/** Citação no texto (autor-data). */
export function formatAbntInText(a: RefArticle, locator?: string | null): string {
  const names = a.authors.map((x) => upper(x.family));
  let who: string;
  if (names.length === 0) who = upper(a.title.split(' ')[0] ?? '');
  else if (names.length === 1) who = names[0];
  else if (names.length === 2 || names.length === 3) who = names.join('; ');
  else who = `${names[0]} et al.`;
  const year = a.year ?? 's.d.';
  return `(${who}, ${year}${locator ? `, ${locator}` : ''})`;
}
