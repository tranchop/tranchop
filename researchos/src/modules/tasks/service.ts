import type { Db } from '@/lib/types';

export interface Task { id: string; title: string; description: string | null; status: 'todo' | 'doing' | 'done' | 'cancelled'; priority: 'low' | 'normal' | 'high'; due_date: string | null }

export async function listTasks(db: Db, projectId: string): Promise<Task[]> {
  const { data, error } = await db.from('tasks').select('*').eq('project_id', projectId).order('due_date', { nullsFirst: false }).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}
export async function createTask(db: Db, projectId: string, input: { title: string; description?: string | null; due_date?: string | null; priority?: string }) {
  const { error } = await db.from('tasks').insert({ project_id: projectId, ...input });
  if (error) throw new Error(error.message);
}
export async function setTaskStatus(db: Db, id: string, status: Task['status']) {
  const { error } = await db.from('tasks').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listMeetings(db: Db, projectId: string) {
  const { data } = await db.from('meetings').select('*, decisions(*)').eq('project_id', projectId).order('starts_at', { ascending: false });
  return (data ?? []) as { id: string; title: string; starts_at: string; agenda: string | null; notes: string | null; decisions: { id: string; title: string; rationale: string | null; status: string }[] }[];
}
export async function createMeeting(db: Db, projectId: string, input: { title: string; starts_at: string; agenda?: string | null; notes?: string | null }) {
  const { error } = await db.from('meetings').insert({ project_id: projectId, ...input });
  if (error) throw new Error(error.message);
}
export async function createDecision(db: Db, projectId: string, input: { title: string; rationale?: string | null; meeting_id?: string | null }) {
  const { error } = await db.from('decisions').insert({ project_id: projectId, ...input });
  if (error) throw new Error(error.message);
}
