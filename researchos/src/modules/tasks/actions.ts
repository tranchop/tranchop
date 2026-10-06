'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { guard, optStr, str } from '@/lib/guard';
import * as svc from './service';

const back = (p: string) => `/p/${p}/tasks`;

export async function createTaskAction(projectId: string, fd: FormData) {
  await guard(back(projectId), async () => {
    const { db } = await requireUser();
    await svc.createTask(db, projectId, { title: str(fd, 'title'), description: optStr(fd, 'description'), due_date: optStr(fd, 'due_date'), priority: str(fd, 'priority') || 'normal' });
    revalidatePath(back(projectId));
  });
}
export async function setTaskStatusAction(projectId: string, id: string, status: svc.Task['status']) {
  await guard(back(projectId), async () => {
    const { db } = await requireUser();
    await svc.setTaskStatus(db, id, status);
    revalidatePath(back(projectId));
  });
}
export async function createMeetingAction(projectId: string, fd: FormData) {
  await guard(back(projectId), async () => {
    const { db } = await requireUser();
    await svc.createMeeting(db, projectId, { title: str(fd, 'title'), starts_at: new Date(str(fd, 'starts_at')).toISOString(), agenda: optStr(fd, 'agenda'), notes: optStr(fd, 'notes') });
    revalidatePath(back(projectId));
  });
}
export async function createDecisionAction(projectId: string, fd: FormData) {
  await guard(back(projectId), async () => {
    const { db } = await requireUser();
    await svc.createDecision(db, projectId, { title: str(fd, 'title'), rationale: optStr(fd, 'rationale'), meeting_id: optStr(fd, 'meeting_id') });
    revalidatePath(back(projectId));
  });
}
