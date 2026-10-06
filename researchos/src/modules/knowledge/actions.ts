'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, optStr, str } from '@/lib/guard';
import * as svc from './service';

export async function createKnowledgeAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/knowledge`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.createKnowledge(db, projectId, {
      kind: str(fd, 'kind') as svc.KnowledgeKind, title: str(fd, 'title'), body: optStr(fd, 'body'),
      tags: str(fd, 'tags').split(',').map((t) => t.trim()).filter(Boolean), passage_id: optStr(fd, 'passage_id')
    });
    revalidatePath(back);
  });
}

export async function setKnowledgeStatusAction(projectId: string, id: string, status: 'open' | 'active' | 'resolved' | 'archived') {
  const back = `/p/${projectId}/knowledge`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.setKnowledgeStatus(db, id, status);
    revalidatePath(back);
  });
}

export async function createLinkAction(projectId: string, backTo: string, fd: FormData) {
  await guard(backTo, async () => {
    const { db } = await requireUser();
    const [dstType, dstId] = str(fd, 'target').split(':');
    if (!dstType || !dstId) throw new Error('Escolha o item de destino.');
    await svc.createLink(db, projectId, { src_type: str(fd, 'src_type'), src_id: str(fd, 'src_id'), dst_type: dstType, dst_id: dstId, relation: str(fd, 'relation') as svc.Relation, note: optStr(fd, 'note') });
    revalidatePath(backTo);
  });
}

export async function deleteLinkAction(backTo: string, id: string) {
  await guard(backTo, async () => {
    const { db } = await requireUser();
    await svc.deleteLink(db, id);
    revalidatePath(backTo);
  });
}
