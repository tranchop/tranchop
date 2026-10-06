import type { Db } from '@/lib/types';
import { embed, toPgVector } from '@/modules/ai/embeddings';
import { NO_INFO_MESSAGE, parseJsonLoose, unsupportedNumbers } from '@/modules/ai/guardrails';
import { finishGeneration, startGeneration, type ContextScope } from '@/modules/ai/generations';
import { getProvider } from '@/modules/ai/provider';
import { rrf } from '@/modules/search/service';

export interface Scope { type: ContextScope; articleId?: string }

export interface ContextBlock {
  ref: string;                    // C1, C2…  (o modelo só pode citar estes)
  kind: 'pdf' | 'note';
  label: string;                  // "Silva (2020), p. 4" ou "Afirmação"
  text: string;
  chunkId?: string;
  articleId?: string;
  page?: number;
  entity?: { type: string; id: string };
  projectId: string;
}

export const ASSISTANT_SYSTEM = `Você é o assistente científico de um pesquisador. Responda SOMENTE com base nos blocos de contexto [C#] fornecidos.

REGRAS INEGOCIÁVEIS
1. Nunca use conhecimento externo. Nunca invente referências, DOI, autores, números, resultados, experimentos, conclusões ou evidências.
2. Cada afirmação da resposta deve terminar com a(s) citação(ões) do bloco que a sustenta, no formato [C#].
3. Números só podem aparecer se estiverem nos blocos citados.
4. Se os blocos não bastarem para responder, devolva sufficient=false. Se bastarem só em parte, responda a parte suportada e diga explicitamente o que falta.
5. Diferencie o que os artigos dizem do que são anotações/hipóteses do próprio pesquisador.

SAÍDA: somente JSON: {"sufficient": boolean, "answer": string, "citations": ["C1", ...], "missing": string|null}`;

/** Recupera contexto do escopo escolhido: PDF (texto+semântico) e, fora do escopo "source", notas/afirmações/resultados do índice. */
export async function retrieveContext(db: Db, projectIds: string[], question: string, scope: Scope, limit = 10): Promise<ContextBlock[]> {
  let vec: number[] | null = null;
  try { vec = (await embed([question]))?.[0] ?? null; } catch { vec = null; }
  const blocks: ContextBlock[] = [];

  for (const projectId of projectIds) {
    let articleIds: string[] | null = scope.type === 'source' && scope.articleId ? [scope.articleId] : null;
    if (scope.type === 'dissertation') {
      const { data } = await db.from('citations').select('article_id').eq('project_id', projectId);
      const ids = [...new Set((data ?? []).map((c: { article_id: string }) => c.article_id))];
      articleIds = ids.length ? ids : null; // sem citações ainda: usa a biblioteca
    }
    const [t, s] = await Promise.all([
      db.rpc('search_chunks', { p_project: projectId, p_query: question, p_limit: limit, p_article_ids: articleIds }),
      vec ? db.rpc('match_chunks', { p_project: projectId, p_embedding: toPgVector(vec), p_limit: limit, p_article_ids: articleIds }) : Promise.resolve({ data: [] })
    ]);
    const fused = rrf<any>([t.data ?? [], (s.data as any[]) ?? []], (r) => r.id).slice(0, limit);
    const artIds = [...new Set(fused.map((f) => f.item.article_id))];
    const { data: arts } = artIds.length ? await db.from('articles').select('id, title, year, authors').in('id', artIds) : { data: [] };
    const artMap = new Map((arts ?? []).map((a: any) => [a.id, a]));
    for (const { item } of fused) {
      const a: any = artMap.get(item.article_id);
      const who = a?.authors?.[0]?.family ? `${a.authors[0].family}${a.authors.length > 1 ? ' et al.' : ''}` : a?.title;
      blocks.push({ ref: '', kind: 'pdf', label: `${who ?? 'Artigo'} (${a?.year ?? 's.d.'}), p. ${item.page_number}`, text: item.content, chunkId: item.id, articleId: item.article_id, page: item.page_number, projectId });
    }

    if (scope.type !== 'source') {
      const types = scope.type === 'library' ? ['fichamento_field', 'passage', 'knowledge_item'] : undefined;
      const [it, is] = await Promise.all([
        db.rpc('search_project', { p_project: projectId, p_query: question, p_types: types ?? null, p_limit: 6 }),
        vec ? db.rpc('match_index', { p_project: projectId, p_embedding: toPgVector(vec), p_limit: 6 }) : Promise.resolve({ data: [] })
      ]);
      const ents = rrf<any>([it.data ?? [], (is.data as any[]) ?? []], (r) => `${r.entity_type}:${r.entity_id}`).slice(0, 6);
      for (const { item } of ents) {
        blocks.push({ ref: '', kind: 'note', label: `${item.entity_type}: ${item.title ?? ''}`.trim(), text: `${item.title ?? ''}\n${item.snippet ?? ''}`.trim(), entity: { type: item.entity_type, id: item.entity_id }, projectId });
      }
    }
  }
  return blocks.slice(0, limit * 2).map((b, i) => ({ ...b, ref: `C${i + 1}` }));
}

export function buildAssistantPrompt(question: string, blocks: ContextBlock[]): string {
  const ctx = blocks.map((b) => `[${b.ref}] (${b.kind === 'pdf' ? 'PDF' : 'anotação do pesquisador'} — ${b.label})\n${b.text}`).join('\n\n');
  return `CONTEXTO\n${ctx}\n\nPERGUNTA\n${question}`;
}

export interface AssistantAnswer {
  status: 'answered' | 'insufficient';
  answer: string;
  sources: ContextBlock[];
  missing?: string | null;
  warnings: string[];
  generationId: string;
}

/** Valida a resposta do modelo contra os blocos fornecidos. Pura (testável). */
export function validateAnswer(raw: { sufficient?: boolean; answer?: string; citations?: string[]; missing?: string | null }, blocks: ContextBlock[]) {
  const valid = new Set(blocks.map((b) => b.ref));
  const cited = (raw.citations ?? []).filter((c) => valid.has(c));
  const inText = [...(raw.answer ?? '').matchAll(/\[(C\d+)\]/g)].map((m) => m[1]);
  const invalidInText = inText.filter((c) => !valid.has(c));
  const usedRefs = [...new Set([...cited, ...inText.filter((c) => valid.has(c))])];
  const warnings: string[] = [];
  if (invalidInText.length) warnings.push(`A resposta citou blocos inexistentes: ${invalidInText.join(', ')}.`);
  const usedText = blocks.filter((b) => usedRefs.includes(b.ref)).map((b) => b.text);
  const badNums = unsupportedNumbers((raw.answer ?? '').replace(/\[C\d+\]/g, ''), usedText);
  if (badNums.length) warnings.push(`Números sem suporte nos trechos citados: ${badNums.join(', ')}. Confira antes de usar.`);
  const ok = raw.sufficient !== false && !!raw.answer?.trim() && usedRefs.length > 0 && invalidInText.length === 0 && badNums.length === 0;
  return { ok, usedRefs, warnings };
}

export async function askAssistant(db: Db, projectId: string, question: string, scope: Scope): Promise<AssistantAnswer> {
  const provider = getProvider();
  let projectIds = [projectId];
  if (scope.type === 'system') {
    const { data } = await db.from('projects').select('id').limit(10);
    projectIds = (data ?? []).map((p: { id: string }) => p.id);
  }
  const blocks = await retrieveContext(db, projectIds, question, scope);
  const genId = await startGeneration(db, {
    projectId, purpose: 'assistant_answer', scope: scope.type, provider,
    contextRefs: { question, article_id: scope.articleId ?? null, projects: projectIds },
    prompt: `${ASSISTANT_SYSTEM}\n\n${buildAssistantPrompt(question, blocks)}`
  });
  const chunkIds = blocks.filter((b) => b.chunkId).map((b) => b.chunkId!);

  // Sem contexto recuperado: nem chama o modelo.
  if (blocks.length === 0) {
    await finishGeneration(db, genId, { status: 'insufficient_context', output: { insufficient: true, warnings: [], missing: 'nenhum trecho recuperado na base' } });
    return { status: 'insufficient', answer: NO_INFO_MESSAGE, sources: [], warnings: [], generationId: genId };
  }

  try {
    const res = await provider.complete({ system: ASSISTANT_SYSTEM, user: buildAssistantPrompt(question, blocks), maxTokens: 2000 });
    const raw = parseJsonLoose<{ sufficient?: boolean; answer?: string; citations?: string[]; missing?: string | null }>(res.text);
    const v = validateAnswer(raw, blocks);
    if (!v.ok) {
      await finishGeneration(db, genId, { status: 'insufficient_context', output: { insufficient: true, missing: raw.missing ?? null, warnings: v.warnings, raw }, tokensIn: res.tokensIn, tokensOut: res.tokensOut, chunkIds });
      return { status: 'insufficient', answer: NO_INFO_MESSAGE, sources: [], missing: raw.missing ?? null, warnings: v.warnings, generationId: genId };
    }
    const sources = blocks.filter((b) => v.usedRefs.includes(b.ref)).map(({ ref, kind, label, text, articleId, page, entity, projectId: pid }) => ({ ref, kind, label, text, articleId, page, entity, projectId: pid }));
    await finishGeneration(db, genId, { status: 'completed', output: { ...raw, sources, warnings: v.warnings }, tokensIn: res.tokensIn, tokensOut: res.tokensOut, chunkIds });
    return { status: 'answered', answer: raw.answer!, sources: blocks.filter((b) => v.usedRefs.includes(b.ref)), missing: raw.missing ?? null, warnings: v.warnings, generationId: genId };
  } catch (e) {
    await finishGeneration(db, genId, { status: 'failed', error: e instanceof Error ? e.message : String(e), chunkIds });
    throw new Error('Falha ao consultar a IA. Tente novamente.');
  }
}
