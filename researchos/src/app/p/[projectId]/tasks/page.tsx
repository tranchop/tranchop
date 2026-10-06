import { Badge, Card, Empty, Field, fmtDate, fmtDateTime, PageHeader, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { createDecisionAction, createMeetingAction, createTaskAction, setTaskStatusAction } from '@/modules/tasks/actions';
import { listMeetings, listTasks } from '@/modules/tasks/service';

const COLS: [string, string][] = [['todo', 'A fazer'], ['doing', 'Fazendo'], ['done', 'Feito']];

export default async function TasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const [tasks, meetings] = await Promise.all([listTasks(db, projectId), listMeetings(db, projectId)]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Tarefas, reuniões e decisões" />
      <Card title="Nova tarefa">
        <form className="row" action={createTaskAction.bind(null, projectId)} style={{ alignItems: 'end' }}>
          <Field label="Tarefa" name="title" required /><Field label="Prazo" name="due_date" type="date" />
          <Field label="Prioridade" name="priority"><Select name="priority" defaultValue="normal" options={['low', 'normal', 'high'].map((v) => ({ value: v, label: v }))} /></Field>
          <Submit>Adicionar</Submit>
        </form>
      </Card>
      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        {COLS.map(([status, label]) => (
          <Card key={status} title={label}>
            {tasks.filter((t) => t.status === status).length === 0 ? <Empty>—</Empty> : (
              <ul className="list">{tasks.filter((t) => t.status === status).map((t) => (
                <li key={t.id} id={`t-${t.id}`}><div>{t.title}</div>
                  <div className="row small">{t.due_date && <Badge tone={t.due_date < today && status !== 'done' ? 'bad' : 'neutral'}>{fmtDate(t.due_date)}</Badge>}{t.priority === 'high' && <Badge tone="warn">alta</Badge>}</div>
                  <div className="row">{COLS.filter(([s]) => s !== status).map(([s, l]) => (
                    <form key={s} action={setTaskStatusAction.bind(null, projectId, t.id, s as 'todo')}><button className="btn btn-ghost small">→ {l}</button></form>))}</div>
                </li>))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      <Card title="Reuniões e decisões">
        <details><summary>Nova reunião</summary>
          <form action={createMeetingAction.bind(null, projectId)}>
            <Field label="Título" name="title" required /><Field label="Data e hora" name="starts_at" type="datetime-local" required />
            <Field label="Pauta" name="agenda" rows={2} /><Field label="Ata / notas" name="notes" rows={3} /><Submit>Salvar</Submit>
          </form>
        </details>
        {meetings.length === 0 ? <Empty>Nenhuma reunião registrada.</Empty> : (
          <ul className="list">{meetings.map((m) => (
            <li key={m.id}><strong>{m.title}</strong> <span className="muted small">{fmtDateTime(m.starts_at)}</span>
              {m.notes && <div className="prose">{m.notes}</div>}
              {m.decisions.map((d) => <div key={d.id}>✔ <strong>{d.title}</strong> {d.rationale && <span className="muted">— {d.rationale}</span>}</div>)}
              <details><summary className="small">Registrar decisão</summary>
                <form action={createDecisionAction.bind(null, projectId)}><input type="hidden" name="meeting_id" value={m.id} /><Field label="Decisão" name="title" required /><Field label="Justificativa" name="rationale" rows={2} /><Submit>Registrar</Submit></form>
              </details>
            </li>))}
          </ul>
        )}
      </Card>
    </>
  );
}
