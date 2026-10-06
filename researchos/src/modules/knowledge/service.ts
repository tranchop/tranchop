import type { Db, Origin, ReviewStatus } from '@/lib/types';

export type KnowledgeKind = 'concept' | 'idea' | 'question' | 'quote' | 'gap' | 'contradiction';
export const KIND_LABEL: Record<KnowledgeKind, string> = {
  concept: 'Conceito', idea: 'Ideia', question: 'Pergunta', quote: 'Citação', gap: 'Lacuna', contradiction: 'Contradição'
};

export interface KnowledgeItem {
  id: string; kind: KnowledgeKind; title: string; body: string | null; status: string; tags: string[];
  passage_id: string | null; origin: Origin; review_status: ReviewStatus; created_at: string;
  passages?: { quote: string; page_number: number | null; article_id: string; articles: { title: string } } | null;
}

export async function listKnowledge(db: Db, projectId: string, kind?: string): Promise<KnowledgeItem[]> {
  let q = db.from('knowledge_items').select('*, passages(quote, page_number, article_id, articles(title))').eq('project_id', projectId).neq('status', 'archived').order('created_at', { ascending: false });
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as KnowledgeItem[];
}

export async function createKnowledge(
  db: Db, projectId: string,
  input: { kind: KnowledgeKind; title: string; body?: string | null; tags?: string[]; passage_id?: string | null }
): Promise<string> {
  if (input.kind === 'quote' && !input.passage_id) throw new Error('Uma citação precisa estar ligada a uma passagem do artigo (artigo + página).');
  const { data, error } = await db.from('knowledge_items').insert({ project_id: projectId, ...input, origin: 'researcher', review_status: 'approved' }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function setKnowledgeStatus(db: Db, id: string, status: 'open' | 'active' | 'resolved' | 'archived') {
  const { error } = await db.from('knowledge_items').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- relações livres (links) ------------------------------------------------
export type Relation = 'inspired_by' | 'derived_from' | 'supports' | 'contradicts' | 'tests' | 'explains' | 'answers' | 'cites' | 'used_in' | 'related_to';
export const RELATION_LABEL: Record<Relation, string> = {
  inspired_by: 'inspirado por', derived_from: 'derivado de', supports: 'sustenta', contradicts: 'contradiz', tests: 'testa',
  explains: 'explica', answers: 'responde', cites: 'cita', used_in: 'usado em', related_to: 'relacionado a'
};

export async function createLink(
  db: Db, projectId: string,
  input: { src_type: string; src_id: string; dst_type: string; dst_id: string; relation: Relation; note?: string | null }
) {
  const { error } = await db.from('links').insert({ project_id: projectId, ...input, origin: 'researcher', review_status: 'approved' });
  if (error) throw new Error(error.code === '23505' ? 'Essa relação já existe.' : error.message);
}

export async function deleteLink(db: Db, id: string) {
  const { error } = await db.from('links').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function linksOf(db: Db, type: string, id: string) {
  const [out, inn] = await Promise.all([
    db.from('links').select('*').eq('src_type', type).eq('src_id', id),
    db.from('links').select('*').eq('dst_type', type).eq('dst_id', id)
  ]);
  return { outgoing: out.data ?? [], incoming: inn.data ?? [] };
}

/** Rótulos de nós (para exibir links). */
export async function nodeLabels(db: Db, nodes: { type: string; id: string }[]): Promise<Map<string, string>> {
  const ids = [...new Set(nodes.map((n) => n.id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from('v_nodes').select('node_type, node_id, label').in('node_id', ids);
  return new Map((data ?? []).map((r: { node_type: string; node_id: string; label: string }) => [`${r.node_type}:${r.node_id}`, r.label]));
}
