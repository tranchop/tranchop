import { Badge, Card, Empty, Field, fmtDate, fmtDateTime, PageHeader, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { addLotAction, addNotebookAction, createReagentAction, signNotebookAction, updateNotebookAction } from '@/modules/experiments/actions';
import { listExperiments, listNotebook, listReagents } from '@/modules/experiments/service';

export default async function LabPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const [entries, reagents, exps] = await Promise.all([listNotebook(db, projectId), listReagents(db, projectId), listExperiments(db, projectId)]);
  const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Caderno de laboratório e reagentes" subtitle="Entradas assinadas ficam imutáveis; correções entram como nova entrada." />
      <div className="grid cols-2">
        <Card title="Nova entrada">
          <form action={addNotebookAction.bind(null, projectId)}>
            <div className="grid cols-2"><Field label="Data" name="entry_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /><Field label="Experimento" name="experiment_id"><Select name="experiment_id" empty="—" options={exps.map((e) => ({ value: e.id, label: e.title }))} /></Field></div>
            <Field label="Título" name="title" required /><Field label="Registro" name="body" rows={6} /><Submit>Salvar entrada</Submit>
          </form>
        </Card>
        <Card title="Reagentes">
          {reagents.length === 0 ? <Empty>Nenhum reagente.</Empty> : (
            <ul className="list">{reagents.map((r) => (
              <li key={r.id}><strong>{r.name}</strong> <span className="muted small">{r.supplier} {r.catalog_number}</span>
                {r.reagent_lots.map((l) => <div key={l.id} className="small">lote {l.lot_number} {l.expires_on && <Badge tone={l.expires_on < new Date().toISOString().slice(0, 10) ? 'bad' : l.expires_on < soon ? 'warn' : 'neutral'}>val. {fmtDate(l.expires_on)}</Badge>} {l.quantity != null && `${l.quantity} ${l.unit ?? ''}`}</div>)}
              </li>))}
            </ul>
          )}
          <details><summary>Novo reagente</summary>
            <form action={createReagentAction.bind(null, projectId)}><Field label="Nome" name="name" required /><div className="grid cols-2"><Field label="Fornecedor" name="supplier" /><Field label="Catálogo" name="catalog_number" /></div><Field label="Armazenamento" name="storage_conditions" /><Submit>Adicionar</Submit></form>
          </details>
          {reagents.length > 0 && <details><summary>Novo lote</summary>
            <form action={addLotAction.bind(null, projectId)}>
              <Field label="Reagente" name="reagent_id"><Select name="reagent_id" required options={reagents.map((r) => ({ value: r.id, label: r.name }))} /></Field>
              <div className="grid cols-2"><Field label="Lote" name="lot_number" required /><Field label="Validade" name="expires_on" type="date" /></div>
              <div className="grid cols-2"><Field label="Quantidade" name="quantity" /><Field label="Unidade" name="unit" /></div><Submit>Adicionar lote</Submit>
            </form></details>}
        </Card>
      </div>
      <Card title="Entradas">
        {entries.length === 0 ? <Empty>Caderno vazio.</Empty> : (
          <ul className="list">{entries.map((n: any) => (
            <li key={n.id}>
              <div className="row"><strong>{n.title}</strong><span className="muted small">{fmtDate(n.entry_date)}{n.experiments ? ` · ${n.experiments.title}` : ''}</span>
                {n.signed_at ? <Badge tone="ok">assinada {fmtDateTime(n.signed_at)}</Badge> : <Badge tone="warn">rascunho</Badge>}</div>
              <div className="prose">{n.body}</div>
              {!n.signed_at ? (
                <div className="row">
                  <details><summary className="small">Editar</summary><form action={updateNotebookAction.bind(null, projectId, n.id)}><Field label="Registro" name="body" rows={5} defaultValue={n.body} /><Submit>Salvar</Submit></form></details>
                  <form action={signNotebookAction.bind(null, projectId, n.id)}><button className="btn small">Assinar (torna imutável)</button></form>
                </div>
              ) : (
                <details><summary className="small">Registrar correção</summary>
                  <form action={addNotebookAction.bind(null, projectId)}><input type="hidden" name="amends_id" value={n.id} /><input type="hidden" name="experiment_id" value={n.experiment_id ?? ''} /><input type="hidden" name="title" value={`Correção: ${n.title}`} /><Field label="Correção" name="body" rows={3} required /><Submit>Registrar</Submit></form>
                </details>
              )}
            </li>))}
          </ul>
        )}
      </Card>
    </>
  );
}
