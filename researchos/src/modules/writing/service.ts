import type { Db } from '@/lib/types';
import { formatAbntInText } from '@/modules/references/abnt';
import { buildBibliography, citationIdsIn, renderCitations, sectionWarnings, type CitationRef } from './render';

const DEFAULT_OUTLINE = ['Introdução', 'Revisão da Literatura', 'Objetivos', 'Material e Métodos', 'Resultados', 'Discussão', 'Conclusão'];

export interface Section { id: string; document_id: string; parent_id: string | null; position: number; title: string; content: string; status: 'outline' | 'drafting' | 'review' | 'final'; word_target: number | null }

/** Cria a dissertação (com estrutura padrão) na primeira visita. */
export async function ensureDissertation(db: Db, projectId: string): Promise<string> {
  const { data: existing } = await db.from('documents').select('id').eq('project_id', projectId).eq('kind', 'dissertation').limit(1);
  if (existing?.[0]) return existing[0].id as string;
  const { data: doc, error } = await db.from('documents').insert({ project_id: projectId, title: 'Dissertação', kind: 'dissertation' }).select('id').single();
  if (error) throw new Error(error.message);
  await db.from('sections').insert(DEFAULT_OUTLINE.map((title, position) => ({ project_id: projectId, document_id: doc.id, title, position })));
  return doc.id as string;
}

export async function listSections(db: Db, documentId: string): Promise<Section[]> {
  const { data, error } = await db.from('sections').select('*').eq('document_id', documentId).order('position');
  if (error) throw new Error(error.message);
  return (data ?? []) as Section[];
}

export async function addSection(db: Db, projectId: string, documentId: string, input: { title: string; parent_id?: string | null }) {
  const { data: last } = await db.from('sections').select('position').eq('document_id', documentId).order('position', { ascending: false }).limit(1);
  const { error } = await db.from('sections').insert({ project_id: projectId, document_id: documentId, title: input.title, parent_id: input.parent_id ?? null, position: (last?.[0]?.position ?? -1) + 1 });
  if (error) throw new Error(error.message);
}

export async function saveSection(db: Db, id: string, patch: { title?: string; content?: string; status?: Section['status']; word_target?: number | null }) {
  const { error } = await db.from('sections').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function addCitation(db: Db, projectId: string, input: { section_id: string; article_id: string; passage_id?: string | null; claim_id?: string | null; locator?: string | null }) {
  const { data, error } = await db.from('citations').insert({ project_id: projectId, ...input }).select('id').single();
  if (error) throw new Error(error.message);
  // marcador no fim do texto; o pesquisador pode movê-lo para o ponto certo
  const { data: s } = await db.from('sections').select('content').eq('id', input.section_id).single();
  await db.from('sections').update({ content: `${(s?.content ?? '').trimEnd()} [@cite:${data.id}]` }).eq('id', input.section_id);
  return data.id as string;
}

export async function attachClaim(db: Db, projectId: string, sectionId: string, claimId: string) {
  const { error } = await db.from('section_claims').upsert({ project_id: projectId, section_id: sectionId, claim_id: claimId });
  if (error) throw new Error(error.message);
}

async function loadCitations(db: Db, sectionIds: string[]): Promise<Map<string, CitationRef>> {
  if (sectionIds.length === 0) return new Map();
  const { data } = await db.from('citations').select('id, locator, articles(id, title, authors, year, journal, volume, issue, pages, doi, metadata_verified)').in('section_id', sectionIds);
  const map = new Map<string, CitationRef>();
  for (const c of (data ?? []) as unknown as { id: string; locator: string | null; articles: CitationRef['article'] }[]) map.set(c.id, { id: c.id, article: c.articles, locator: c.locator });
  return map;
}

/** Seção com citações resolvidas, afirmações ligadas e alertas de rigor. */
export async function getSectionView(db: Db, sectionId: string) {
  const { data: section } = await db.from('sections').select('*').eq('id', sectionId).single();
  const [citations, claims] = await Promise.all([
    loadCitations(db, [sectionId]),
    db.from('section_claims').select('claims(id, text, status)').eq('section_id', sectionId)
  ]);
  const claimRows = ((claims.data ?? []) as unknown as { claims: { id: string; text: string; status: string } }[]).map((c) => c.claims);
  return {
    section: section as Section,
    rendered: renderCitations(section.content, citations),
    claims: claimRows,
    citations: [...citations.values()],
    warnings: sectionWarnings({ content: section.content, citations, claims: claimRows })
  };
}

/** Exporta o documento em Markdown com citações resolvidas e lista de referências. */
export async function exportMarkdown(db: Db, documentId: string): Promise<string> {
  const { data: doc } = await db.from('documents').select('title').eq('id', documentId).single();
  const sections = await listSections(db, documentId);
  const citations = await loadCitations(db, sections.map((s) => s.id));
  const depth = (s: Section): number => (s.parent_id ? 1 + depth(sections.find((p) => p.id === s.parent_id) ?? ({ parent_id: null } as Section)) : 0);
  const used = new Set(sections.flatMap((s) => citationIdsIn(s.content)));
  const body = sections.map((s) => `${'#'.repeat(Math.min(depth(s) + 2, 6))} ${s.title}\n\n${renderCitations(s.content, citations)}`).join('\n\n');
  const refs = buildBibliography([...citations.values()].filter((c) => used.has(c.id)));
  return `# ${doc?.title ?? 'Documento'}\n\n${body}\n\n## Referências\n\n${refs.map((r) => `${r}\n`).join('\n')}`;
}

export const previewInText = formatAbntInText;
