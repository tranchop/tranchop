'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, optStr, str } from '@/lib/guard';
import * as svc from './service';

export async function createClaimAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/evidence`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.createClaim(db, projectId, { text: str(fd, 'text'), kind: str(fd, 'kind') as 'literature' | 'own_finding' | 'interpretation' });
    revalidatePath(back);
  });
}

export async function addEvidenceAction(projectId: string, claimId: string, fd: FormData) {
  const back = `/p/${projectId}/evidence`;
  await guard(back, async () => {
    const { db } = await requireUser();
    const [type, id] = str(fd, 'source').split(':');
    await svc.addEvidence(db, projectId, {
      claim_id: claimId, stance: str(fd, 'stance') as 'supports' | 'contradicts' | 'context',
      passage_id: type === 'passage' ? id : null, result_id: type === 'result' ? id : null, strength: optStr(fd, 'strength'), note: optStr(fd, 'note')
    });
    revalidatePath(back);
  });
}

export async function removeEvidenceAction(projectId: string, id: string) {
  const back = `/p/${projectId}/evidence`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.removeEvidence(db, id);
    revalidatePath(back);
  });
}
