'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, num, optStr, str } from '@/lib/guard';
import * as svc from './service';

const page = (p: string, s?: string) => `/p/${p}/dissertation${s ? `?s=${s}` : ''}`;

export async function addSectionAction(projectId: string, documentId: string, fd: FormData) {
  await guard(page(projectId), async () => {
    const { db } = await requireUser();
    await svc.addSection(db, projectId, documentId, { title: str(fd, 'title'), parent_id: optStr(fd, 'parent_id') });
    revalidatePath(page(projectId));
  });
}
export async function saveSectionAction(projectId: string, sectionId: string, fd: FormData) {
  await guard(page(projectId, sectionId), async () => {
    const { db } = await requireUser();
    await svc.saveSection(db, sectionId, { title: str(fd, 'title'), content: String(fd.get('content') ?? ''), status: str(fd, 'status') as svc.Section['status'], word_target: num(fd, 'word_target') });
    revalidatePath(page(projectId, sectionId));
  });
}
export async function addCitationAction(projectId: string, sectionId: string, fd: FormData) {
  await guard(page(projectId, sectionId), async () => {
    const { db } = await requireUser();
    const [articleId, passageId] = str(fd, 'source').split('|');
    if (!articleId) throw new Error('Escolha o artigo citado.');
    await svc.addCitation(db, projectId, { section_id: sectionId, article_id: articleId, passage_id: passageId || null, locator: optStr(fd, 'locator') });
    revalidatePath(page(projectId, sectionId));
  });
}
export async function attachClaimAction(projectId: string, sectionId: string, fd: FormData) {
  await guard(page(projectId, sectionId), async () => {
    const { db } = await requireUser();
    await svc.attachClaim(db, projectId, sectionId, str(fd, 'claim_id'));
    revalidatePath(page(projectId, sectionId));
  });
}
