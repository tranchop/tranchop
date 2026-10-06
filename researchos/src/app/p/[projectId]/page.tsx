import Link from 'next/link';
import { Badge, Card, Empty, fmtDate, fmtDateTime, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { describeChange } from '@/modules/history/service';
import { getDashboard, getProject } from '@/modules/projects/service';

export default async function Dashboard({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const [project, d] = await Promise.all([getProject(db, projectId), getDashboard(db, projectId)]);
  const c = d.counts;
  const p = `/p/${projectId}`;
  const stats: [number, string, string][] = [
    [c.articles, 'artigos na biblioteca', `${p}/articles`], [c.toRead, 'a ler / em leitura', `${p}/articles`],
    [c.pendingFields, 'campos de fichamento a revisar', `${p}/articles`], [c.claims, 'afirmações', `${p}/evidence`],
    [c.unsupported, 'afirmações sem evidência', `${p}/evidence`], [c.experiments, 'experimentos', `${p}/experiments`],
    [c.openTasks, 'tarefas abertas', `${p}/tasks`], [c.sectionsDone, `de ${c.sectionsTotal} seções finalizadas`, `${p}/dissertation`]
  ];
  return (
    <>
      <PageHeader title={project?.name ?? 'Projeto'} subtitle={[project?.program, project?.institution, project?.advisor && `Orientação: ${project.advisor}`].filter(Boolean).join(' · ')} />
      <div className="grid cols-4" style={{ marginBottom: '1rem' }}>
        {stats.map(([n, label, href]) => (
          <Link key={label} href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ marginBottom: 0 }}><div className="stat">{n}</div><div className="stat-label">{label}</div></div>
          </Link>
        ))}
      </div>
      {c.pendingFields > 0 && <div className="notice">Há <strong>{c.pendingFields}</strong> campos de fichamento gerados pela IA aguardando sua revisão.</div>}
      <div className="grid cols-2">
        <Card title="Hipóteses">
          {d.hypotheses.length === 0 ? <Empty>Cadastre objetivos e hipóteses em “Projeto”.</Empty> : (
            <ul className="list">{d.hypotheses.map((h: any) => <li key={h.id}>{h.statement} <Badge tone={h.status === 'supported' ? 'ok' : h.status === 'refuted' ? 'bad' : 'info'}>{h.status}</Badge></li>)}</ul>
          )}
        </Card>
        <Card title="Próximas tarefas">
          {d.tasks.length === 0 ? <Empty>Sem tarefas abertas.</Empty> : (
            <ul className="list">{d.tasks.map((t: any) => <li key={t.id}>{t.title} <span className="muted small">{fmtDate(t.due_date)}</span></li>)}</ul>
          )}
          {d.meetings.length > 0 && <><h3 style={{ marginTop: '1rem' }}>Reuniões</h3><ul className="list">{d.meetings.map((m: any) => <li key={m.id}>{m.title} <span className="muted small">{fmtDateTime(m.starts_at)}</span></li>)}</ul></>}
        </Card>
      </div>
      <Card title="Atividade recente">
        {d.activity.length === 0 ? <Empty>Nada ainda.</Empty> : (
          <ul className="list">{d.activity.map((a: any) => <li key={a.id}>{describeChange(a)} <span className="muted small">{fmtDateTime(a.changed_at)}</span></li>)}</ul>
        )}
        <Link className="link small" href={`${p}/history`}>Ver histórico completo →</Link>
      </Card>
    </>
  );
}
