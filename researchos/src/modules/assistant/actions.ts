'use server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { guard, optStr, str } from '@/lib/guard';
import { aiConfigured } from '@/lib/env';
import { askAssistant } from './service';

/** Pergunta → resposta guardada na própria URL do histórico de gerações (ai_generations.output). */
export async function askAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/assistant`;
  await guard(back, async () => {
    if (!aiConfigured()) throw new Error('IA não configurada: defina ANTHROPIC_API_KEY no servidor.');
    const { db } = await requireUser();
    const question = str(fd, 'question');
    if (question.length < 5) throw new Error('Escreva uma pergunta mais completa.');
    const scopeType = str(fd, 'scope') as 'source' | 'library' | 'project' | 'dissertation' | 'system';
    const res = await askAssistant(db, projectId, question, { type: scopeType, articleId: optStr(fd, 'article_id') ?? undefined });
    return `${back}?g=${res.generationId}`;
  });
  redirect(back);
}
