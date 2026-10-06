import type { Db } from '@/lib/types';

export interface TraceNode { node_type: string; node_id: string; label: string; depth: number }
export interface TraceEdge { src_type: string; src_id: string; dst_type: string; dst_id: string; relation: string; origin: string; review_status: string }

export const EDGE_LABEL: Record<string, string> = {
  belongs_to: 'pertence a', summarizes: 'resume', quotes: 'cita trecho de', refines: 'detalha', about: 'trata de', measured_in: 'medido em',
  tests: 'testa', follows: 'segue', derived_from: 'derivado de', analyzes: 'analisa', based_on: 'baseado em', made_in: 'decidido em',
  uses_claim: 'usa afirmação', cites: 'cita', inspired_by: 'inspirado por', supports: 'sustenta', contradicts: 'contradiz',
  explains: 'explica', answers: 'responde', used_in: 'usado em', related_to: 'relacionado a'
};

/** Vizinhança do nó no grafo de conhecimento (FKs tipadas + links), até `depth` saltos. */
export async function traceNode(db: Db, type: string, id: string, depth = 4) {
  const [n, e] = await Promise.all([
    db.rpc('trace_nodes', { p_type: type, p_id: id, p_depth: depth }),
    db.rpc('trace_edges', { p_type: type, p_id: id, p_depth: depth })
  ]);
  if (n.error) throw new Error(n.error.message);
  return { nodes: (n.data ?? []) as TraceNode[], edges: (e.data ?? []) as TraceEdge[] };
}

/** Agrupa nós por profundidade para exibir a cadeia como camadas legíveis. */
export function groupByDepth(nodes: TraceNode[]): Map<number, TraceNode[]> {
  const m = new Map<number, TraceNode[]>();
  for (const n of nodes) m.set(n.depth, [...(m.get(n.depth) ?? []), n]);
  return m;
}
