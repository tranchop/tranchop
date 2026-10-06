import { createHash } from 'node:crypto';
import type { Db } from '@/lib/types';

// ---- protocolos (versões imutáveis) ------------------------------------------
export async function listProtocols(db: Db, projectId: string) {
  const { data } = await db.from('protocols').select('*, protocol_versions(id, version, change_note, created_at)').eq('project_id', projectId).order('created_at', { ascending: false });
  return (data ?? []) as { id: string; title: string; objective: string | null; current_version: number; protocol_versions: { id: string; version: number; change_note: string | null; created_at: string }[] }[];
}
export async function createProtocol(db: Db, projectId: string, input: { title: string; objective?: string | null; body: string }) {
  const { data, error } = await db.from('protocols').insert({ project_id: projectId, title: input.title, objective: input.objective ?? null }).select('id').single();
  if (error) throw new Error(error.message);
  await addProtocolVersion(db, projectId, data.id, input.body, 'Versão inicial');
}
export async function addProtocolVersion(db: Db, projectId: string, protocolId: string, body: string, changeNote?: string | null) {
  const { error } = await db.from('protocol_versions').insert({ project_id: projectId, protocol_id: protocolId, body, change_note: changeNote ?? null, version: 0 });
  if (error) throw new Error(error.message);
}
export async function getProtocolVersion(db: Db, id: string) {
  const { data } = await db.from('protocol_versions').select('*, protocols(title)').eq('id', id).maybeSingle();
  return data as { id: string; version: number; body: string; protocols: { title: string } } | null;
}

// ---- experimentos ------------------------------------------------------------
export async function listExperiments(db: Db, projectId: string) {
  const { data, error } = await db.from('experiments').select('*, hypotheses(statement)').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; code: string | null; title: string; status: string; started_on: string | null; hypotheses: { statement: string } | null }[];
}
export async function createExperiment(db: Db, projectId: string, input: { title: string; code?: string | null; hypothesis_id?: string | null; protocol_version_id?: string | null; design?: string | null }): Promise<string> {
  const { data, error } = await db.from('experiments').insert({ project_id: projectId, ...input }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
export async function setExperimentStatus(db: Db, id: string, status: string) {
  const patch: Record<string, unknown> = { status };
  if (status === 'running') patch.started_on = new Date().toISOString().slice(0, 10);
  if (status === 'done') patch.ended_on = new Date().toISOString().slice(0, 10);
  const { error } = await db.from('experiments').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface Dataset {
  id: string; layer: 'raw' | 'processed'; name: string; storage_path: string; sha256: string; size_bytes: number | null;
  derived_from: string | null; processing_method: string | null; group_id: string | null; archived_at: string | null; created_at: string;
}

export async function getExperiment(db: Db, id: string) {
  const [exp, groups, datasets, interps, results, notebook, reagents] = await Promise.all([
    db.from('experiments').select('*, hypotheses(id, statement), protocol_versions(id, version, protocols(id, title))').eq('id', id).single(),
    db.from('experiment_groups').select('*').eq('experiment_id', id).order('position'),
    db.from('datasets').select('*').eq('experiment_id', id).order('created_at'),
    db.from('interpretations').select('*').eq('experiment_id', id).order('created_at'),
    db.from('results').select('*').eq('experiment_id', id).order('created_at'),
    db.from('notebook_entries').select('*').eq('experiment_id', id).order('entry_date').order('created_at'),
    db.from('experiment_reagents').select('*, reagents(name, supplier), reagent_lots(lot_number, expires_on)').eq('experiment_id', id)
  ]);
  if (exp.error) throw new Error(exp.error.message);
  return {
    experiment: exp.data as Record<string, any>,
    groups: (groups.data ?? []) as { id: string; name: string; treatment: string | null; n: number | null; description: string | null }[],
    datasets: (datasets.data ?? []) as Dataset[],
    interpretations: (interps.data ?? []) as Record<string, any>[],
    results: (results.data ?? []) as Record<string, any>[],
    notebook: (notebook.data ?? []) as Record<string, any>[],
    reagents: (reagents.data ?? []) as Record<string, any>[]
  };
}

export async function addGroup(db: Db, projectId: string, experimentId: string, input: { name: string; treatment?: string | null; n?: number | null; description?: string | null }) {
  const { error } = await db.from('experiment_groups').insert({ project_id: projectId, experiment_id: experimentId, ...input });
  if (error) throw new Error(error.message);
}

// ---- dados: raw → processed (raw nunca é sobrescrito) --------------------------
export async function uploadDataset(
  db: Db, projectId: string, experimentId: string,
  input: { layer: 'raw' | 'processed'; name: string; bytes: Uint8Array; groupId?: string | null; derivedFrom?: string | null; method?: string | null; params?: unknown; notes?: string | null }
) {
  if (input.layer === 'processed' && !input.derivedFrom) throw new Error('Dado processado precisa indicar de qual dado bruto/processado deriva.');
  if (input.layer === 'processed' && !input.method) throw new Error('Descreva o método/script usado no processamento (reprodutibilidade).');
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const safe = input.name.replace(/[^\w.\-]+/g, '_');
  const path = `${projectId}/${experimentId}/${input.layer}/${crypto.randomUUID()}-${safe}`;
  const up = await db.storage.from('lab-data').upload(path, input.bytes, { upsert: false }); // upsert:false => nunca sobrescreve
  if (up.error) throw new Error(`Falha no upload: ${up.error.message}`);
  const { error } = await db.from('datasets').insert({
    project_id: projectId, experiment_id: experimentId, group_id: input.groupId ?? null, layer: input.layer, name: input.name,
    storage_path: path, sha256, size_bytes: input.bytes.byteLength, derived_from: input.layer === 'processed' ? input.derivedFrom : null,
    processing_method: input.method ?? null, processing_params: input.params ?? null, notes: input.notes ?? null
  });
  if (error) throw new Error(error.message);
}

export async function signedDatasetUrl(db: Db, storagePath: string) {
  const { data, error } = await db.storage.from('lab-data').createSignedUrl(storagePath, 600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function archiveDataset(db: Db, id: string) {
  const { error } = await db.from('datasets').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- interpretação → resultado --------------------------------------------------
export async function addInterpretation(db: Db, projectId: string, experimentId: string, input: { body: string; dataset_id?: string | null }) {
  const { error } = await db.from('interpretations').insert({ project_id: projectId, experiment_id: experimentId, ...input, origin: 'researcher', review_status: 'approved' });
  if (error) throw new Error(error.message);
}

export async function addResult(
  db: Db, projectId: string, experimentId: string,
  input: { statement: string; interpretation_id?: string | null; group_id?: string | null; metric?: string | null; value?: number | null; unit?: string | null; stat_test?: string | null; p_value?: number | null }
) {
  const { error } = await db.from('results').insert({ project_id: projectId, experiment_id: experimentId, ...input, origin: 'researcher', status: 'preliminary', review_status: 'draft' });
  if (error) throw new Error(error.message);
}

/** Resultado final = interpretado + aprovado por humano (também imposto por CHECK no banco). */
export async function finalizeResult(db: Db, id: string) {
  const { error } = await db.from('results').update({ status: 'final', review_status: 'approved' }).eq('id', id);
  if (error) throw new Error(error.code === '23514' ? 'Ligue o resultado a uma interpretação antes de torná-lo final.' : error.message);
}

/** Linhagem de um resultado: resultado → interpretação → dado processado → dado bruto. */
export async function resultLineage(db: Db, resultId: string) {
  const { data: r } = await db.from('results').select('*, experiments(id, title), interpretations(*)').eq('id', resultId).single();
  if (!r) return null;
  const chain: Dataset[] = [];
  let cur: string | null = r.interpretations?.dataset_id ?? null;
  for (let i = 0; cur && i < 10; i++) {
    const { data: d } = await db.from('datasets').select('*').eq('id', cur).single();
    if (!d) break;
    chain.push(d as Dataset);
    cur = (d as Dataset).derived_from;
  }
  return { result: r as Record<string, any>, datasets: chain };
}

// ---- caderno de laboratório ----------------------------------------------------
export async function addNotebookEntry(db: Db, projectId: string, input: { experiment_id?: string | null; title: string; body: string; entry_date?: string | null; amends_id?: string | null }) {
  const { error } = await db.from('notebook_entries').insert({ project_id: projectId, ...input, entry_date: input.entry_date || undefined });
  if (error) throw new Error(error.message);
}
export async function updateNotebookEntry(db: Db, id: string, body: string) {
  const { error } = await db.from('notebook_entries').update({ body }).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function signNotebookEntry(db: Db, id: string, userId: string) {
  const { error } = await db.from('notebook_entries').update({ signed_at: new Date().toISOString(), signed_by: userId }).eq('id', id).is('signed_at', null);
  if (error) throw new Error(error.message);
}
export async function listNotebook(db: Db, projectId: string) {
  const { data } = await db.from('notebook_entries').select('*, experiments(title)').eq('project_id', projectId).order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  return (data ?? []) as Record<string, any>[];
}

// ---- reagentes -------------------------------------------------------------------
export async function listReagents(db: Db, projectId: string) {
  const { data } = await db.from('reagents').select('*, reagent_lots(*)').eq('project_id', projectId).order('name');
  return (data ?? []) as { id: string; name: string; supplier: string | null; catalog_number: string | null; storage_conditions: string | null; reagent_lots: { id: string; lot_number: string; expires_on: string | null; quantity: number | null; unit: string | null }[] }[];
}
export async function createReagent(db: Db, projectId: string, input: { name: string; supplier?: string | null; catalog_number?: string | null; storage_conditions?: string | null }) {
  const { error } = await db.from('reagents').insert({ project_id: projectId, ...input });
  if (error) throw new Error(error.message);
}
export async function addLot(db: Db, projectId: string, input: { reagent_id: string; lot_number: string; expires_on?: string | null; quantity?: number | null; unit?: string | null }) {
  const { error } = await db.from('reagent_lots').insert({ project_id: projectId, ...input });
  if (error) throw new Error(error.message);
}
export async function useReagent(db: Db, projectId: string, experimentId: string, input: { reagent_id: string; lot_id?: string | null; amount?: number | null; unit?: string | null }) {
  const { error } = await db.from('experiment_reagents').insert({ project_id: projectId, experiment_id: experimentId, ...input });
  if (error) throw new Error(error.message);
}
