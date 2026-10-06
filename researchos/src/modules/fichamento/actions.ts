'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, str } from '@/lib/guard';
import * as svc from './service';

const back = (p: string, a: string) => `/p/${p}/articles/${a}`;

export async function generateFichamentoAction(projectId: string, articleId: string) {
  await guard(back(projectId, articleId), async () => {
    const { db } = await requireUser();
    await svc.generateFichamento(db, projectId, articleId);
    revalidatePath(back(projectId, articleId));
  });
}

export async function reviewFieldAction(projectId: string, articleId: string, fieldId: string, decision: 'approved' | 'rejected') {
  await guard(back(projectId, articleId), async () => {
    const { db } = await requireUser();
    await svc.setFieldReview(db, fieldId, decision);
    revalidatePath(back(projectId, articleId));
  });
}

export async function editFieldAction(projectId: string, articleId: string, fieldId: string, fd: FormData) {
  await guard(back(projectId, articleId), async () => {
    const { db } = await requireUser();
    const content = str(fd, 'content');
    if (!content) throw new Error('O conteúdo não pode ficar vazio.');
    await svc.editField(db, fieldId, content);
    revalidatePath(back(projectId, articleId));
  });
}

export async function addFieldAction(projectId: string, articleId: string, fichamentoId: string, fd: FormData) {
  await guard(back(projectId, articleId), async () => {
    const { db } = await requireUser();
    await svc.addResearcherField(db, projectId, fichamentoId, str(fd, 'field_key'), str(fd, 'content'));
    revalidatePath(back(projectId, articleId));
  });
}

export async function approveAllAction(projectId: string, articleId: string, fichamentoId: string) {
  await guard(back(projectId, articleId), async () => {
    const { db } = await requireUser();
    await svc.approveAllDrafts(db, fichamentoId);
    revalidatePath(back(projectId, articleId));
  });
}

export async function approveFichamentoAction(projectId: string, articleId: string, fichamentoId: string) {
  await guard(back(projectId, articleId), async () => {
    const { db, user } = await requireUser();
    await svc.approveFichamento(db, fichamentoId, user.id);
    revalidatePath(back(projectId, articleId));
  });
}
