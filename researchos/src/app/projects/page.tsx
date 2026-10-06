import Link from 'next/link';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Card, Empty, Field, PageHeader, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { createProjectAction } from '@/modules/projects/actions';
import { listProjects } from '@/modules/projects/service';

export default async function ProjectsPage() {
  const { db } = await requireUser();
  const projects = await listProjects(db);
  return (
    <main className="content" style={{ margin: '0 auto' }}>
      <PageHeader title="Seus projetos" subtitle="Cada projeto (ex.: seu mestrado) reúne biblioteca, experimentos e escrita." actions={
        <form action="/auth/signout" method="post"><button className="btn btn-ghost small">Sair</button></form>
      } />
      <ErrorBanner />
      <Card title="Projetos">
        {projects.length === 0 ? <Empty>Nenhum projeto ainda. Crie o primeiro abaixo.</Empty> : (
          <ul className="list">
            {projects.map((p) => (
              <li key={p.id}><Link className="link" href={`/p/${p.id}`}><strong>{p.name}</strong></Link>{p.program && <span className="muted"> — {p.program}</span>}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Novo projeto">
        <form action={createProjectAction}>
          <Field label="Título / nome do projeto" name="name" required placeholder="Mestrado em …" />
          <Field label="Descrição" name="description" rows={2} />
          <div className="grid cols-2">
            <Field label="Instituição" name="institution" />
            <Field label="Programa" name="program" />
          </div>
          <Field label="Orientador(a)" name="advisor" />
          <Submit>Criar projeto</Submit>
        </form>
      </Card>
    </main>
  );
}
