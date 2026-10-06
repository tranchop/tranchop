import type { Origin } from '@/lib/types';
import { normalize, quoteInSource, unsupportedNumbers } from '@/modules/ai/guardrails';

export const FICHAMENTO_FIELDS = ['objective', 'hypothesis', 'methodology', 'results', 'conclusion', 'limitations', 'relevance', 'key_info'] as const;
export type FichamentoField = (typeof FICHAMENTO_FIELDS)[number];

export const FIELD_LABEL: Record<string, string> = {
  reference: 'Referência', objective: 'Objetivo', hypothesis: 'Hipótese', methodology: 'Metodologia',
  results: 'Resultados', conclusion: 'Conclusão', limitations: 'Limitações', relevance: 'Relevância para o projeto',
  key_info: 'Informações-chave'
};

export interface RawField {
  field_key: string;
  content: string;
  kind: 'extracted' | 'inferred' | 'suggested';
  page?: number | null;
  quote?: string | null;
}
export interface VerifiedField {
  field_key: FichamentoField;
  content: string;
  origin: Origin;
  passage: { page: number; quote: string } | null;
  warnings: string[];
}

function locateQuote(quote: string, pages: string[], hint?: number | null): number | null {
  if (hint && hint >= 1 && hint <= pages.length && quoteInSource(quote, pages[hint - 1])) return hint;
  const i = pages.findIndex((p) => quoteInSource(quote, p));
  return i === -1 ? null : i + 1;
}

/**
 * Converte a saída bruta da IA em um campo com proveniência honesta:
 *  - "source_extracted" só se a citação confere literalmente com a página E todos os números do conteúdo estão na citação;
 *  - caso contrário rebaixa para "ai_inferred" (e avisa);
 *  - relevância é sempre "ai_suggested".
 */
export function verifyField(f: RawField, pages: string[]): VerifiedField | null {
  if (!(FICHAMENTO_FIELDS as readonly string[]).includes(f.field_key)) return null;
  const content = (f.content ?? '').trim();
  if (!content) return null;
  const key = f.field_key as FichamentoField;
  const warnings: string[] = [];

  if (key === 'relevance') {
    return { field_key: key, content, origin: 'ai_suggested', passage: null, warnings };
  }

  let passage: VerifiedField['passage'] = null;
  if (f.quote?.trim()) {
    const page = locateQuote(f.quote, pages, f.page);
    if (page) passage = { page, quote: f.quote.trim() };
    else warnings.push('A citação indicada pela IA não foi encontrada literalmente no PDF.');
  } else if (f.kind === 'extracted') {
    warnings.push('Campo marcado como extraído, mas sem citação literal.');
  }

  const numberSources = passage ? [passage.quote] : [pages.join('\n')];
  const bad = unsupportedNumbers(content, numberSources);
  if (bad.length) warnings.push(`Números sem suporte ${passage ? 'na citação' : 'no documento'}: ${bad.join(', ')}.`);

  const trulyExtracted = f.kind === 'extracted' && passage !== null && bad.length === 0;
  return { field_key: key, content, origin: trulyExtracted ? 'source_extracted' : 'ai_inferred', passage, warnings };
}

export interface RawMetadata {
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  journal?: string | null;
}
export interface VerifiedMetadata {
  title?: string;
  authors?: { family: string; given?: string }[];
  year?: number;
  journal?: string;
}

/** Só aceita metadados que aparecem literalmente nas primeiras páginas. */
export function verifyMetadata(m: RawMetadata | undefined, pages: string[]): VerifiedMetadata {
  const head = normalize(pages.slice(0, 3).join('\n'));
  const out: VerifiedMetadata = {};
  if (!m) return out;
  if (m.title && quoteInSource(m.title, pages.slice(0, 3).join('\n'))) out.title = m.title.trim();
  if (m.year && Number.isInteger(m.year) && new RegExp(`\\b${m.year}\\b`).test(head)) out.year = m.year;
  if (m.journal && normalize(m.journal).length >= 4 && head.includes(normalize(m.journal))) out.journal = m.journal.trim();
  if (m.authors?.length) {
    const ok = m.authors
      .map((a) => {
        const [family, given] = a.includes(',') ? a.split(',').map((x) => x.trim()) : [a.trim().split(/\s+/).slice(-1)[0], a.trim().split(/\s+/).slice(0, -1).join(' ')];
        return { family, given: given || undefined };
      })
      .filter((a) => a.family && head.includes(normalize(a.family)));
    if (ok.length) out.authors = ok;
  }
  return out;
}
