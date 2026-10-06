import type { Db } from '@/lib/types';
import type { LlmProvider } from './provider';

export type ContextScope = 'source' | 'library' | 'project' | 'dissertation' | 'system';
export type Purpose = 'fichamento' | 'assistant_answer' | 'link_suggestion' | 'section_assist' | 'other';

/** Toda chamada de IA abre um registro ANTES de executar e o fecha depois. */
export async function startGeneration(
  db: Db,
  input: { projectId: string; purpose: Purpose; scope: ContextScope; provider: LlmProvider; contextRefs: Record<string, unknown>; prompt: string }
): Promise<string> {
  const { data, error } = await db
    .from('ai_generations')
    .insert({
      project_id: input.projectId,
      purpose: input.purpose,
      provider: input.provider.name,
      model: input.provider.model,
      model_params: input.provider.params,
      context_scope: input.scope,
      context_refs: input.contextRefs,
      prompt: input.prompt.slice(0, 20000)
    })
    .select('id')
    .single();
  if (error) throw new Error(`Não foi possível registrar a geração de IA: ${error.message}`);
  return data.id as string;
}

export async function finishGeneration(
  db: Db,
  id: string,
  result: { status: 'completed' | 'failed' | 'insufficient_context'; output?: unknown; error?: string; tokensIn?: number; tokensOut?: number; chunkIds?: string[] }
) {
  const { error } = await db
    .from('ai_generations')
    .update({
      status: result.status,
      output: result.output ?? null,
      error: result.error ?? null,
      tokens_in: result.tokensIn ?? null,
      tokens_out: result.tokensOut ?? null,
      retrieved_chunk_ids: result.chunkIds ?? []
    })
    .eq('id', id);
  if (error) throw new Error(`Falha ao fechar registro de IA: ${error.message}`);
}

/** Revisão humana da geração (registrada quando o pesquisador aprova/rejeita o resultado). */
export async function reviewGeneration(db: Db, id: string, userId: string, status: 'approved' | 'rejected') {
  await db.from('ai_generations').update({ review_status: status, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', id);
}
