import type { Db, Origin, ReviewStatus } from '@/lib/types';

export interface EvidenceRow {
  id: string; claim_id: string; stance: 'supports' | 'contradicts' | 'context'; strength: string | null; note: string | null;
  passage_id: string | null; result_id: string | null; origin: Origin; review_status: ReviewStatus;
  passages?: { quote: string; page_number: number | null; verified_in_source: boolean; article_id: string; articles: { title: string; year: number | null } } | null;
  results?: { statement: string; experiment_id: string } | null;
}
export interface ClaimRow {
  id: string; text: string; kind: string; status: 'unsupported' | 'supported' | 'contested'; origin: Origin; review_status: ReviewStatus;
  evidence: EvidenceRow[];
}

/** Afirmação → Evidências → Passagem (artigo, página) | Resultado (experimento). */
export async function listClaims(db: Db, projectId: string): Promise<ClaimRow[]> {
  const { data, error } = await db
    .from('claims')
    .select('*, evidence(*, passages(quote, page_number, verified_in_source, article_id, articles(title, year)), results(statement, experiment_id))')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ClaimRow[];
}

export async function createClaim(db: Db, projectId: string, input: { text: string; kind: 'literature' | 'own_finding' | 'interpretation' }): Promise<string> {
  const { data, error } = await db.from('claims').insert({ project_id: projectId, ...input, origin: 'researcher', review_status: 'approved' }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function addEvidence(
  db: Db, projectId: string,
  input: { claim_id: string; stance: 'supports' | 'contradicts' | 'context'; passage_id?: string | null; result_id?: string | null; strength?: string | null; note?: string | null }
) {
  if (!input.passage_id === !input.result_id) throw new Error('Informe exatamente uma fonte: uma passagem de artigo OU um resultado experimental.');
  const { error } = await db.from('evidence').insert({ project_id: projectId, ...input, origin: 'researcher', review_status: 'approved' });
  if (error) throw new Error(error.message);
}

export async function removeEvidence(db: Db, id: string) {
  const { error } = await db.from('evidence').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listPassages(db: Db, projectId: string) {
  const { data } = await db.from('passages').select('id, quote, page_number, verified_in_source, articles(title)').eq('project_id', projectId).order('created_at', { ascending: false }).limit(200);
  return (data ?? []) as unknown as { id: string; quote: string; page_number: number | null; verified_in_source: boolean; articles: { title: string } }[];
}

export async function listFinalResults(db: Db, projectId: string) {
  const { data } = await db.from('results').select('id, statement, status, experiments(title)').eq('project_id', projectId).order('created_at', { ascending: false });
  return (data ?? []) as unknown as { id: string; statement: string; status: string; experiments: { title: string } }[];
}
