import type { Db } from '@/lib/types';
import { embed, toPgVector } from '@/modules/ai/embeddings';

export interface SearchHit { kind: 'entity' | 'chunk'; entityType: string; entityId: string; title: string; snippet: string; score: number; page?: number; articleId?: string }

/** Reciprocal Rank Fusion: combina rankings (texto + semântico) sem depender de escalas de score. */
export function rrf<T>(lists: T[][], key: (t: T) => string, k = 60): { item: T; score: number }[] {
  const acc = new Map<string, { item: T; score: number }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const id = key(item);
      const cur = acc.get(id) ?? { item, score: 0 };
      cur.score += 1 / (k + rank + 1);
      acc.set(id, cur);
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score);
}

export async function searchProject(db: Db, projectId: string, query: string, opts: { types?: string[]; limit?: number } = {}): Promise<{ hits: SearchHit[]; semantic: boolean }> {
  const q = query.trim();
  if (!q) return { hits: [], semantic: false };
  const limit = opts.limit ?? 30;

  let vector: number[] | null = null;
  try { vector = (await embed([q]))?.[0] ?? null; } catch { vector = null; }

  const [entText, chunkText, entSem, chunkSem] = await Promise.all([
    db.rpc('search_project', { p_project: projectId, p_query: q, p_types: opts.types ?? null, p_limit: limit }),
    db.rpc('search_chunks', { p_project: projectId, p_query: q, p_limit: limit }),
    vector ? db.rpc('match_index', { p_project: projectId, p_embedding: toPgVector(vector), p_limit: limit }) : Promise.resolve({ data: [] }),
    vector ? db.rpc('match_chunks', { p_project: projectId, p_embedding: toPgVector(vector), p_limit: limit }) : Promise.resolve({ data: [] })
  ]);

  const ent = (rows: any[] | null): SearchHit[] => (rows ?? []).map((r) => ({ kind: 'entity', entityType: r.entity_type, entityId: r.entity_id, title: r.title ?? '(sem título)', snippet: r.snippet ?? '', score: 0 }));
  const chk = (rows: any[] | null): SearchHit[] => (rows ?? []).map((r) => ({ kind: 'chunk', entityType: 'article', entityId: r.article_id, articleId: r.article_id, page: r.page_number, title: `Trecho do PDF — p. ${r.page_number}`, snippet: String(r.content).slice(0, 240), score: 0, ...{ chunkId: r.id } }));

  const key = (h: SearchHit & { chunkId?: string }) => (h.kind === 'chunk' ? `c:${h.chunkId}` : `e:${h.entityType}:${h.entityId}`);
  const fused = rrf<SearchHit>([ent(entText.data), chk(chunkText.data), ent(entSem.data as any[]), chk(chunkSem.data as any[])].filter((l) => l.length), key as any);
  let hits = fused.map((f) => ({ ...f.item, score: f.score })).slice(0, limit);
  if (opts.types) hits = hits.filter((h) => h.kind === 'entity' || opts.types!.includes('article'));
  return { hits, semantic: Boolean(vector) };
}
