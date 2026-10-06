'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, num, optStr, str } from '@/lib/guard';
import * as svc from './service';

export async function importPdfAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/articles`;
  await guard(back, async () => {
    const { db } = await requireUser();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Selecione um arquivo PDF.');
    const { articleId, extraction } = await svc.importPdf(db, projectId, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    revalidatePath(back);
    return `/p/${projectId}/articles/${articleId}${extraction === 'no_text' ? '?error=' + encodeURIComponent('PDF sem camada de texto (provavelmente escaneado): fichamento e busca em texto completo não funcionarão. OCR está fora do MVP.') : ''}`;
  });
}

export async function createArticleAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/articles`;
  await guard(back, async () => {
    const { db } = await requireUser();
    const id = await svc.createArticle(db, projectId, { title: str(fd, 'title'), authors: str(fd, 'authors'), year: num(fd, 'year'), journal: optStr(fd, 'journal'), doi: optStr(fd, 'doi'), abstract: optStr(fd, 'abstract') });
    return `/p/${projectId}/articles/${id}`;
  });
}

export async function attachPdfAction(projectId: string, articleId: string, fd: FormData) {
  const back = `/p/${projectId}/articles/${articleId}`;
  await guard(back, async () => {
    const { db } = await requireUser();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Selecione um arquivo PDF.');
    await svc.importPdf(db, projectId, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, articleId);
    revalidatePath(back);
  });
}

export async function confirmMetadataAction(projectId: string, articleId: string, fd: FormData) {
  const back = `/p/${projectId}/articles/${articleId}`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.confirmMetadata(db, articleId, { title: str(fd, 'title'), authors: str(fd, 'authors'), year: num(fd, 'year'), journal: optStr(fd, 'journal'), doi: optStr(fd, 'doi'), abstract: optStr(fd, 'abstract') });
    revalidatePath(back);
  });
}

export async function addPassageAction(projectId: string, articleId: string, fd: FormData) {
  const back = `/p/${projectId}/articles/${articleId}`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.addPassage(db, projectId, { articleId, pageNumber: num(fd, 'page'), section: optStr(fd, 'section'), quote: str(fd, 'quote'), note: optStr(fd, 'note') });
    revalidatePath(back);
  });
}

export async function setReadingStatusAction(projectId: string, articleId: string, fd: FormData) {
  const back = `/p/${projectId}/articles/${articleId}`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.updateReadingStatus(db, articleId, str(fd, 'status') as svc.Article['reading_status']);
    revalidatePath(back);
  });
}
