import type { Db } from '@/lib/types';

export interface Project {
  id: string; name: string; description: string | null; institution: string | null;
  program: string | null; advisor: string | null; start_date: string | null; end_date: string | null;
}

export async function listProjects(db: Db): Promise<Project[]> {
  const { data, error } = await db.from('projects').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(db: Db, id: string): Promise<Project | null> {
  const { data } = await db.from('projects').select('*').eq('id', id).maybeSingle();
  return (data as Project) ?? null;
}

export async function createProject(db: Db, input: { name: string; description?: string | null; institution?: string | null; program?: string | null; advisor?: string | null }) {
  const { data, error } = await db.from('projects').insert(input).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function addMember(db: Db, projectId: string, email: string, role: 'editor' | 'viewer') {
  const { error } = await db.rpc('add_member_by_email', { p_project: projectId, p_email: email, p_role: role });
  if (error) throw new Error(error.message);
}

export async function listMembers(db: Db, projectId: string) {
  const { data } = await db.from('project_members').select('user_id, role, profiles:profiles!inner(display_name)').eq('project_id', projectId);
  return (data ?? []) as unknown as { user_id: string; role: string; profiles: { display_name: string | null } }[];
}

// ---- objetivos e hipóteses -------------------------------------------------
export async function listFrame(db: Db, projectId: string) {
  const [o, h] = await Promise.all([
    db.from('objectives').select('*').eq('project_id', projectId).order('kind').order('position'),
    db.from('hypotheses').select('*').eq('project_id', projectId).order('created_at')
  ]);
  return { objectives: o.data ?? [], hypotheses: h.data ?? [] };
}

export async function addObjective(db: Db, projectId: string, input: { kind: 'general' | 'specific'; title: string; description?: string | null }) {
  const { error } = await db.from('objectives').insert({ project_id: projectId, ...input });
  if (error) throw new Error(error.message);
}

export async function addHypothesis(db: Db, projectId: string, input: { statement: string; rationale?: string | null; objective_id?: string | null }) {
  const { error } = await db.from('hypotheses').insert({ project_id: projectId, ...input, origin: 'researcher', review_status: 'approved' });
  if (error) throw new Error(error.message);
}

export async function setHypothesisStatus(db: Db, id: string, status: string) {
  const { error } = await db.from('hypotheses').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---- dashboard -------------------------------------------------------------
const count = async (db: Db, table: string, projectId: string, filter?: (q: any) => any) => {
  let q = db.from(table).select('id', { count: 'exact', head: true }).eq('project_id', projectId);
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
};

export async function getDashboard(db: Db, projectId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const [articles, toRead, fichamentosPending, claims, unsupported, experiments, running, openTasks, pendingFields, sectionsTotal, sectionsDone] = await Promise.all([
    count(db, 'articles', projectId),
    count(db, 'articles', projectId, (q) => q.in('reading_status', ['to_read', 'reading'])),
    count(db, 'fichamentos', projectId, (q) => q.neq('status', 'approved')),
    count(db, 'claims', projectId),
    count(db, 'claims', projectId, (q) => q.eq('status', 'unsupported')),
    count(db, 'experiments', projectId),
    count(db, 'experiments', projectId, (q) => q.eq('status', 'running')),
    count(db, 'tasks', projectId, (q) => q.in('status', ['todo', 'doing'])),
    count(db, 'fichamento_fields', projectId, (q) => q.eq('review_status', 'draft')),
    count(db, 'sections', projectId),
    count(db, 'sections', projectId, (q) => q.eq('status', 'final'))
  ]);
  const [tasks, meetings, activity, hypotheses] = await Promise.all([
    db.from('tasks').select('id, title, due_date, status, priority').eq('project_id', projectId).in('status', ['todo', 'doing']).order('due_date', { nullsFirst: false }).limit(6),
    db.from('meetings').select('id, title, starts_at').eq('project_id', projectId).gte('starts_at', today).order('starts_at').limit(3),
    db.from('change_log').select('id, table_name, op, changed_at, new_data').eq('project_id', projectId).order('changed_at', { ascending: false }).limit(8),
    db.from('hypotheses').select('id, statement, status').eq('project_id', projectId).order('created_at')
  ]);
  return {
    counts: { articles, toRead, fichamentosPending, claims, unsupported, experiments, running, openTasks, pendingFields, sectionsTotal, sectionsDone },
    tasks: tasks.data ?? [], meetings: meetings.data ?? [], activity: activity.data ?? [], hypotheses: hypotheses.data ?? []
  };
}
