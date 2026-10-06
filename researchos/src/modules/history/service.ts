import type { Db } from '@/lib/types';

export interface Change { id: number; table_name: string; row_id: string | null; op: 'INSERT' | 'UPDATE' | 'DELETE'; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; changed_by: string | null; changed_at: string }

export const TABLE_LABEL: Record<string, string> = {
  articles: 'Artigo', passages: 'Passagem', fichamentos: 'Fichamento', fichamento_fields: 'Campo do fichamento', knowledge_items: 'Conhecimento',
  claims: 'Afirmação', evidence: 'Evidência', hypotheses: 'Hipótese', objectives: 'Objetivo', experiments: 'Experimento', datasets: 'Dados',
  interpretations: 'Interpretação', results: 'Resultado', notebook_entries: 'Caderno', protocols: 'Protocolo', protocol_versions: 'Versão de protocolo',
  tasks: 'Tarefa', meetings: 'Reunião', decisions: 'Decisão', sections: 'Seção', citations: 'Citação', links: 'Relação', projects: 'Projeto'
};

export async function listChanges(db: Db, projectId: string, opts: { table?: string; rowId?: string; limit?: number } = {}): Promise<Change[]> {
  let q = db.from('change_log').select('*').eq('project_id', projectId).order('changed_at', { ascending: false }).limit(opts.limit ?? 100);
  if (opts.table) q = q.eq('table_name', opts.table);
  if (opts.rowId) q = q.eq('row_id', opts.rowId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Change[];
}

const NOISE = new Set(['updated_at', 'created_at']);

/** Campos que mudaram entre dois estados (ignora carimbos automáticos). */
export function diffFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  const out: { field: string; before: unknown; after: unknown }[] = [];
  for (const k of keys) {
    if (NOISE.has(k)) continue;
    const a = oldData?.[k], b = newData?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, before: a ?? null, after: b ?? null });
  }
  return out;
}

/** Título legível de um registro para o feed de atividade. */
export function describeChange(c: Change): string {
  const row = c.new_data ?? c.old_data ?? {};
  const name = (row.title ?? row.name ?? row.statement ?? row.text ?? row.field_key ?? row.quote ?? '') as string;
  const verb = c.op === 'INSERT' ? 'criou' : c.op === 'DELETE' ? 'removeu' : 'alterou';
  return `${verb} ${TABLE_LABEL[c.table_name] ?? c.table_name}${name ? `: ${String(name).slice(0, 70)}` : ''}`;
}
