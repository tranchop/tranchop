import { Badge, Card, Empty, Field, PageHeader, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { addHypothesisAction, addMemberAction, addObjectiveAction, setHypothesisStatusAction } from '@/modules/projects/actions';
import { listFrame, listMembers } from '@/modules/projects/service';

const STATUS = ['proposed', 'testing', 'supported', 'refuted', 'inconclusive'].map((s) => ({ value: s, label: s }));

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const [{ objectives, hypotheses }, members] = await Promise.all([listFrame(db, projectId), listMembers(db, projectId)]);
  return (
    <>
      <PageHeader title="Projeto" subtitle="Objetivos e hipóteses orientam fichamentos, experimentos e a escrita." />
      <div className="grid cols-2">
        <Card title="Objetivos">
          {objectives.length === 0 ? <Empty>Nenhum objetivo.</Empty> : <ul className="list">{objectives.map((o: any) => <li key={o.id}><Badge>{o.kind === 'general' ? 'geral' : 'específico'}</Badge> <strong>{o.title}</strong>{o.description && <div className="muted">{o.description}</div>}</li>)}</ul>}
          <details><summary>Adicionar objetivo</summary>
            <form action={addObjectiveAction.bind(null, projectId)}>
              <Field label="Tipo" name="kind"><Select name="kind" options={[{ value: 'general', label: 'Geral' }, { value: 'specific', label: 'Específico' }]} defaultValue="specific" /></Field>
              <Field label="Título" name="title" required /><Field label="Descrição" name="description" rows={2} /><Submit>Adicionar</Submit>
            </form>
          </details>
        </Card>
        <Card title="Hipóteses">
          {hypotheses.length === 0 ? <Empty>Nenhuma hipótese.</Empty> : (
            <ul className="list">{hypotheses.map((h: any) => (
              <li key={h.id}>{h.statement}{h.rationale && <div className="muted">{h.rationale}</div>}
                <form className="row" action={setHypothesisStatusAction.bind(null, projectId, h.id)}>
                  <Select name="status" options={STATUS} defaultValue={h.status} /><button className="btn small">Atualizar</button>
                </form>
              </li>))}
            </ul>
          )}
          <details><summary>Adicionar hipótese</summary>
            <form action={addHypothesisAction.bind(null, projectId)}>
              <Field label="Enunciado (testável)" name="statement" rows={2} required /><Field label="Justificativa" name="rationale" rows={2} />
              <Field label="Objetivo relacionado" name="objective_id"><Select name="objective_id" empty="—" options={objectives.map((o: any) => ({ value: o.id, label: o.title }))} /></Field>
              <Submit>Adicionar</Submit>
            </form>
          </details>
        </Card>
      </div>
      <Card title="Equipe">
        <ul className="list">{members.map((m) => <li key={m.user_id}>{m.profiles?.display_name ?? m.user_id.slice(0, 8)} <Badge>{m.role}</Badge></li>)}</ul>
        <details><summary>Convidar (a pessoa precisa já ter conta)</summary>
          <form className="row" action={addMemberAction.bind(null, projectId)}>
            <input name="email" type="email" placeholder="email@exemplo.com" required />
            <Select name="role" options={[{ value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Leitor' }]} /><Submit>Convidar</Submit>
          </form>
        </details>
      </Card>
    </>
  );
}
