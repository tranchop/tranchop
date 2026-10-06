import { formatAbntInText, formatAbntReference, type RefArticle } from '@/modules/references/abnt';

export interface CitationRef { id: string; article: RefArticle & { id: string; metadata_verified?: boolean }; locator: string | null }

const CITE = /\[@cite:([0-9a-f-]{36})\]/g;

/** Substitui [@cite:<id>] pela citação ABNT autor-data. Marcadores órfãos viram [CITAÇÃO NÃO ENCONTRADA]. */
export function renderCitations(content: string, citations: Map<string, CitationRef>): string {
  return content.replace(CITE, (_, id: string) => {
    const c = citations.get(id);
    return c ? formatAbntInText(c.article, c.locator) : '[CITAÇÃO NÃO ENCONTRADA]';
  });
}

export function citationIdsIn(content: string): string[] {
  return [...content.matchAll(CITE)].map((m) => m[1]);
}

/** Lista de referências (únicas, ordem alfabética) dos artigos efetivamente citados. */
export function buildBibliography(citations: CitationRef[]): string[] {
  const byArticle = new Map<string, RefArticle>();
  for (const c of citations) byArticle.set(c.article.id, c.article);
  return [...byArticle.values()].map(formatAbntReference).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export interface RigorWarning { level: 'error' | 'warn'; message: string }

/** Alertas de rigor de uma seção: citações órfãs, metadados não confirmados, afirmações sem evidência. */
export function sectionWarnings(args: {
  content: string;
  citations: Map<string, CitationRef>;
  claims: { text: string; status: string }[];
}): RigorWarning[] {
  const out: RigorWarning[] = [];
  for (const id of citationIdsIn(args.content)) {
    const c = args.citations.get(id);
    if (!c) out.push({ level: 'error', message: `Citação ${id.slice(0, 8)} não existe mais.` });
    else if (c.article.metadata_verified === false) out.push({ level: 'warn', message: `Metadados de "${c.article.title}" ainda não foram confirmados — confira a referência.` });
  }
  for (const cl of args.claims) {
    if (cl.status === 'unsupported') out.push({ level: 'warn', message: `Afirmação sem evidência aprovada: "${cl.text.slice(0, 80)}"` });
    if (cl.status === 'contested') out.push({ level: 'warn', message: `Afirmação contestada (há evidência contra): "${cl.text.slice(0, 80)}"` });
  }
  return out;
}
