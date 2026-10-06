import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente Supabase sem tipos gerados. Após `supabase gen types`, troque por SupabaseClient<Database>. */
export type Db = SupabaseClient;

export type Origin = 'source_extracted' | 'ai_inferred' | 'ai_suggested' | 'researcher';
export type ReviewStatus = 'draft' | 'approved' | 'rejected';

export const ORIGIN_LABEL: Record<Origin, string> = {
  source_extracted: 'Extraído da fonte',
  ai_inferred: 'Inferido pela IA',
  ai_suggested: 'Sugestão da IA',
  researcher: 'Pesquisador'
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  rejected: 'Rejeitado'
};

/** Tipos de nó do grafo (espelha node_table() no SQL). */
export const NODE_TYPES = [
  'article', 'passage', 'fichamento', 'knowledge_item', 'claim', 'evidence', 'objective', 'hypothesis',
  'protocol', 'experiment', 'dataset', 'interpretation', 'result', 'notebook_entry', 'reagent', 'task',
  'meeting', 'decision', 'section'
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_LABEL: Record<string, string> = {
  article: 'Artigo', passage: 'Passagem', fichamento: 'Fichamento', knowledge_item: 'Conhecimento',
  claim: 'Afirmação', evidence: 'Evidência', objective: 'Objetivo', hypothesis: 'Hipótese',
  protocol: 'Protocolo', experiment: 'Experimento', dataset: 'Dados', interpretation: 'Interpretação',
  result: 'Resultado', notebook_entry: 'Caderno', reagent: 'Reagente', task: 'Tarefa',
  meeting: 'Reunião', decision: 'Decisão', section: 'Seção'
};

/** Rota de cada tipo de nó dentro de um projeto (para links no rastreio/busca). */
export function nodeHref(projectId: string, type: string, id: string): string {
  const base = `/p/${projectId}`;
  switch (type) {
    case 'article': return `${base}/articles/${id}`;
    case 'experiment': return `${base}/experiments/${id}`;
    case 'section': return `${base}/dissertation#s-${id}`;
    case 'claim': case 'evidence': return `${base}/evidence#c-${id}`;
    case 'knowledge_item': return `${base}/knowledge#k-${id}`;
    case 'task': return `${base}/tasks#t-${id}`;
    default: return `${base}/trace/${type}/${id}`;
  }
}
