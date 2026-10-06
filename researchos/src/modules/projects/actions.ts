'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, num, optStr, str } from '@/lib/guard';
import * as svc from './service';

export async function createProjectAction(fd: FormData) {
  await guard('/projects', async () => {
    const { db } = await requireUser();
    const id = await svc.createProject(db, { name: str(fd, 'name'), description: optStr(fd, 'description'), institution: optStr(fd, 'institution'), program: optStr(fd, 'program'), advisor: optStr(fd, 'advisor') });
    return `/p/${id}`;
  });
}

export async function addObjectiveAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/project`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.addObjective(db, projectId, { kind: str(fd, 'kind') === 'general' ? 'general' : 'specific', title: str(fd, 'title'), description: optStr(fd, 'description') });
    revalidatePath(back);
  });
}

export async function addHypothesisAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/project`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.addHypothesis(db, projectId, { statement: str(fd, 'statement'), rationale: optStr(fd, 'rationale'), objective_id: optStr(fd, 'objective_id') });
    revalidatePath(back);
  });
}

export async function setHypothesisStatusAction(projectId: string, id: string, fd: FormData) {
  const back = `/p/${projectId}/project`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.setHypothesisStatus(db, id, str(fd, 'status'));
    revalidatePath(back);
  });
}

export async function addMemberAction(projectId: string, fd: FormData) {
  const back = `/p/${projectId}/project`;
  await guard(back, async () => {
    const { db } = await requireUser();
    await svc.addMember(db, projectId, str(fd, 'email'), str(fd, 'role') === 'viewer' ? 'viewer' : 'editor');
    revalidatePath(back);
  });
}
void num;
