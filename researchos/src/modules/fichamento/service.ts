import type { Db, Origin, ReviewStatus } from '@/lib/types';
import { parseJsonLoose } from '@/modules/ai/guardrails';
import { finishGeneration, reviewGeneration, startGeneration } from '@/modules/ai/generations';
import { getProvider } from '@/modules/ai/provider';
import { formatAbntReference } from '@/modules/references/abnt';
import { buildFichamentoUser, FICHAMENTO_SYSTEM } from './prompt';
import { verifyField, verifyMetadata, type RawField, type RawMetadata, type VerifiedField } from './verify';

const MAX_DOC_CHARS = 400_000;

export interface FichamentoFieldRow {
  id: string;
  fichamento_id: string;
  field_key: string;
  position: number;
  content: string;
  origin: Origin;
  review_status: ReviewStatus;
  passage_id: string | null;
  ai_generation_id: string | null;
  passages?: { page_number: number | null; quote: string; verified_in_source: boolean } | null;
}

export interface FichamentoWithFields { id: string; article_id: string; status: 'draft' | 'in_review' | 'approved'; ai_generation_id: string | null; fields: FichamentoFieldRow[] }

export async function getFichamento(db: Db, articleId: string): Promise<FichamentoWithFields | null> {
  const { data: f } = await db.from('fichamentos').select('*').eq('article_id', articleId).maybeSingle();
  if (!f) return null;
  const { data: fields, error } = await db
    .from('fichamento_fields')
    .select('*, passages(page_number, quote, verified_in_source)')
    .eq('fichamento_id', f.id)
    .order('field_key')
    .order('position');
  if (error) throw new Error(error.message);
  return { ...(f as Omit<FichamentoWithFields, 'fields'>), fields: (fields ?? []) as FichamentoFieldRow[] };
}

/** Gera o RASCUNHO do fichamento. Nada fica aprovado: o pesquisador revisa cada campo. */
export async function generateFichamento(db: Db, projectId: string, articleId: string) {
  const { data: pageRows } = await db.from('article_pages').select('page_number, text').eq('article_id', articleId).order('page_number');
  const pages = (pageRows ?? []).map((p: { text: string }) => p.text);
  if (pages.length === 0) throw new Error('Este artigo não tem texto extraído (PDF ausente ou escaneado). Faça upload de um PDF com camada de texto.');

  let total = 0;
  let truncated = false;
  const sent: string[] = [];
  for (const p of pages) {
    if (total + p.length > MAX_DOC_CHARS) { truncated = true; break; }
    sent.push(p);
    total += p.length;
  }

  const [{ data: objs }, { data: hyps }] = await Promise.all([
    db.from('objectives').select('title').eq('project_id', projectId),
    db.from('hypotheses').select('statement').eq('project_id', projectId)
  ]);
  const user = buildFichamentoUser({
    pages: sent,
    objectives: (objs ?? []).map((o: { title: string }) => o.title),
    hypotheses: (hyps ?? []).map((h: { statement: string }) => h.statement),
    truncated
  });

  const provider = getProvider();
  const genId = await startGeneration(db, {
    projectId, purpose: 'fichamento', scope: 'source', provider,
    contextRefs: { article_id: articleId, pages_sent: sent.length, truncated },
    prompt: `${FICHAMENTO_SYSTEM}\n\n[usuário: ${user.length} caracteres, ${sent.length} páginas]`
  });

  let parsed: { metadata?: RawMetadata; fields?: RawField[]; not_found?: string[] };
  let usage = { in: 0, out: 0 };
  try {
    const res = await provider.complete({ system: FICHAMENTO_SYSTEM, user, maxTokens: 8000 });
    usage = { in: res.tokensIn, out: res.tokensOut };
    parsed = parseJsonLoose(res.text);
  } catch (e) {
    await finishGeneration(db, genId, { status: 'failed', error: e instanceof Error ? e.message : String(e) });
    throw new Error(`A IA não retornou um fichamento válido: ${e instanceof Error ? e.message : e}`);
  }

  const verified = (parsed.fields ?? []).map((f) => verifyField(f, sent)).filter((v): v is VerifiedField => v !== null);
  const meta = verifyMetadata(parsed.metadata, sent);

  // metadados: só preenche o que a IA conseguiu verificar no PDF; nunca sobrescreve dado confirmado pelo pesquisador
  const { data: art } = await db.from('articles').select('*').eq('id', articleId).single();
  if (art && !art.metadata_verified) {
    const patch: Record<string, unknown> = {};
    if (meta.title) patch.title = meta.title;
    if (meta.year && !art.year) patch.year = meta.year;
    if (meta.journal && !art.journal) patch.journal = meta.journal;
    if (meta.authors && (!art.authors || art.authors.length === 0)) patch.authors = meta.authors;
    if (Object.keys(patch).length) await db.from('articles').update({ ...patch, metadata_origin: 'ai_inferred' }).eq('id', articleId);
  }

  const { data: fich, error: fErr } = await db
    .from('fichamentos')
    .upsert({ project_id: projectId, article_id: articleId, status: 'draft', ai_generation_id: genId, approved_by: null, approved_at: null }, { onConflict: 'article_id' })
    .select('id')
    .single();
  if (fErr) throw new Error(fErr.message);

  // substitui apenas rascunhos anteriores da IA; preserva campos do pesquisador e aprovados
  await db.from('fichamento_fields').delete().eq('fichamento_id', fich.id).eq('review_status', 'draft').neq('origin', 'researcher');
  const { data: kept } = await db.from('fichamento_fields').select('field_key, position').eq('fichamento_id', fich.id);
  const nextPos = new Map<string, number>();
  for (const k of (kept ?? []) as { field_key: string; position: number }[]) nextPos.set(k.field_key, Math.max(nextPos.get(k.field_key) ?? 0, k.position + 1));

  const passageCache = new Map<string, string>();
  for (const v of verified) {
    let passageId: string | null = null;
    if (v.passage) {
      const key = `${v.passage.page}|${v.passage.quote}`;
      if (!passageCache.has(key)) {
        const { data: p, error } = await db
          .from('passages')
          .insert({ project_id: projectId, article_id: articleId, page_number: v.passage.page, quote: v.passage.quote, verified_in_source: true, origin: 'source_extracted' })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        passageCache.set(key, p.id);
      }
      passageId = passageCache.get(key)!;
    }
    const position = nextPos.get(v.field_key) ?? 0;
    nextPos.set(v.field_key, position + 1);
    const { error } = await db.from('fichamento_fields').insert({
      project_id: projectId, fichamento_id: fich.id, field_key: v.field_key, position, content: v.content,
      origin: v.origin, review_status: 'draft', passage_id: passageId, ai_generation_id: genId
    });
    if (error) throw new Error(error.message);
  }

  // Referência: montada por código a partir dos metadados — a IA não escreve referência.
  const { data: art2 } = await db.from('articles').select('*').eq('id', articleId).single();
  if (art2) {
    await db.from('fichamento_fields').delete().eq('fichamento_id', fich.id).eq('field_key', 'reference');
    await db.from('fichamento_fields').insert({
      project_id: projectId, fichamento_id: fich.id, field_key: 'reference', position: 0,
      content: formatAbntReference(art2), origin: art2.metadata_verified ? 'researcher' : 'ai_inferred', review_status: art2.metadata_verified ? 'approved' : 'draft'
    });
  }

  const report = {
    fields_returned: parsed.fields?.length ?? 0,
    fields_kept: verified.length,
    downgraded: verified.filter((v) => v.warnings.length).map((v) => ({ field: v.field_key, warnings: v.warnings })),
    not_found: parsed.not_found ?? [],
    metadata_verified: Object.keys(meta)
  };
  await finishGeneration(db, genId, { status: 'completed', output: report, tokensIn: usage.in, tokensOut: usage.out });
  return { fichamentoId: fich.id as string, report };
}

export async function setFieldReview(db: Db, fieldId: string, status: 'approved' | 'rejected') {
  const { error } = await db.from('fichamento_fields').update({ review_status: status }).eq('id', fieldId);
  if (error) throw new Error(error.message);
}

/** Editar um campo = o texto passa a ser do pesquisador; a geração de origem continua registrada. */
export async function editField(db: Db, fieldId: string, content: string) {
  const { error } = await db.from('fichamento_fields').update({ content, origin: 'researcher', review_status: 'approved', passage_id: null }).eq('id', fieldId);
  if (error) throw new Error(error.message);
}

export async function addResearcherField(db: Db, projectId: string, fichamentoId: string, fieldKey: string, content: string) {
  const { data: last } = await db.from('fichamento_fields').select('position').eq('fichamento_id', fichamentoId).eq('field_key', fieldKey).order('position', { ascending: false }).limit(1);
  const position = last?.[0] ? last[0].position + 1 : 0;
  const { error } = await db.from('fichamento_fields').insert({
    project_id: projectId, fichamento_id: fichamentoId, field_key: fieldKey, position, content, origin: 'researcher', review_status: 'approved'
  });
  if (error) throw new Error(error.message);
}

export async function approveAllDrafts(db: Db, fichamentoId: string) {
  const { error } = await db.from('fichamento_fields').update({ review_status: 'approved' }).eq('fichamento_id', fichamentoId).eq('review_status', 'draft');
  if (error) throw new Error(error.message);
}

/** Aprovação final: o banco recusa se ainda houver campo em rascunho. Registra a revisão humana da geração. */
export async function approveFichamento(db: Db, fichamentoId: string, userId: string) {
  const { data: f, error } = await db.from('fichamentos').update({ status: 'approved' }).eq('id', fichamentoId).select('ai_generation_id, article_id').single();
  if (error) throw new Error(error.message);
  if (f.ai_generation_id) await reviewGeneration(db, f.ai_generation_id, userId, 'approved');
  await db.from('articles').update({ reading_status: 'fichado' }).eq('id', f.article_id);
}
