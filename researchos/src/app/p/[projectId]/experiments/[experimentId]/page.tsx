import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LinkPanel } from '@/components/LinkPanel';
import { Badge, Card, Empty, Field, fmtDate, PageHeader, Provenance, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import {
  addGroupAction, addInterpretationAction, addResultAction, archiveDatasetAction, finalizeResultAction, setExperimentStatusAction, uploadDatasetAction, useReagentAction
} from '@/modules/experiments/actions';
import { getExperiment, listReagents, signedDatasetUrl, type Dataset } from '@/modules/experiments/service';

const STATUS = ['planned', 'running', 'analysis', 'done', 'aborted'].map((s) => ({ value: s, label: s }));

export default async function ExperimentPage({ params }: { params: Promise<{ projectId: string; experimentId: string }> }) {
  const { projectId, experimentId } = await params;
  const { db } = await requireUser();
  let data;
  try { data = await getExperiment(db, experimentId); } catch { notFound(); }
  const { experiment: e, groups, datasets, interpretations, results, reagents } = data;
  const reagentCatalog = await listReagents(db, projectId);
  const urls = new Map<string, string>();
  await Promise.all(datasets.map(async (d) => { try { urls.set(d.id, await signedDatasetUrl(db, d.storage_path)); } catch { /* sem acesso */ } }));
  const back = `/p/${projectId}/experiments/${experimentId}`;
  const dsOption = (d: Dataset) => ({ value: d.id, label: `${d.layer === 'raw' ? 'BRUTO' : 'processado'}: ${d.name}` });

  return (
    <>
      <PageHeader title={`${e.code ? `${e.code} — ` : ''}${e.title}`} subtitle={e.hypotheses ? `Testa: ${e.hypotheses.statement}` : 'Sem hipótese vinculada'}
        actions={<form className="row" action={setExperimentStatusAction.bind(null, projectId, experimentId)}><Select name="status" options={STATUS} defaultValue={e.status} /><button className="btn small">Atualizar</button></form>} />
      {e.protocol_versions && <p className="muted">Protocolo: {e.protocol_versions.protocols.title} v{e.protocol_versions.version} (versão fixada)</p>}
      {e.design && <Card title="Desenho experimental"><div className="prose">{e.design}</div></Card>}

      <Card title="Grupos">
        {groups.length === 0 ? <Empty>Sem grupos.</Empty> : <table><thead><tr><th>Grupo</th><th>Tratamento</th><th>n</th></tr></thead><tbody>{groups.map((g) => <tr key={g.id}><td>{g.name}</td><td>{g.treatment ?? '—'}</td><td>{g.n ?? '—'}</td></tr>)}</tbody></table>}
        <details><summary>Adicionar grupo</summary>
          <form className="row" action={addGroupAction.bind(null, projectId, experimentId)} style={{ alignItems: 'end' }}><Field label="Nome" name="name" required /><Field label="Tratamento" name="treatment" /><Field label="n" name="n" type="number" /><Submit>Adicionar</Submit></form>
        </details>
      </Card>

      <Card title="Dados: bruto → processado">
        <p className="muted small">Dados brutos são imutáveis (hash SHA-256, sem sobrescrita). Processamentos criam novos arquivos ligados ao original.</p>
        {datasets.length === 0 ? <Empty>Nenhum arquivo.</Empty> : (
          <ul className="list">{datasets.map((d) => (
            <li key={d.id} className={`layer layer-${d.layer}`} style={d.archived_at ? { opacity: 0.55 } : undefined}>
              <div className="row"><Badge tone={d.layer === 'raw' ? 'bad' : 'info'}>{d.layer === 'raw' ? 'BRUTO' : 'processado'}</Badge><strong>{d.name}</strong>{d.archived_at && <Badge>arquivado</Badge>}
                {urls.get(d.id) && <a className="link small" href={urls.get(d.id)}>baixar</a>}
                {!d.archived_at && <form action={archiveDatasetAction.bind(null, projectId, experimentId, d.id)}><button className="btn btn-ghost small">arquivar</button></form>}</div>
              <div className="mono muted">sha256 {d.sha256.slice(0, 16)}… · {fmtDate(d.created_at)}{d.derived_from ? ` · derivado de ${datasets.find((x) => x.id === d.derived_from)?.name ?? '…'}` : ''}</div>
              {d.processing_method && <div className="muted small">Método: {d.processing_method}</div>}
            </li>))}
          </ul>
        )}
        <details><summary>Enviar arquivo</summary>
          <form action={uploadDatasetAction.bind(null, projectId, experimentId)}>
            <Field label="Camada" name="layer"><Select name="layer" options={[{ value: 'raw', label: 'Bruto (instrumento/planilha original)' }, { value: 'processed', label: 'Processado (derivado)' }]} /></Field>
            <Field label="Arquivo" name="file"><input type="file" name="file" required /></Field>
            <Field label="Grupo" name="group_id"><Select name="group_id" empty="—" options={groups.map((g) => ({ value: g.id, label: g.name }))} /></Field>
            <Field label="Derivado de (obrigatório se processado)" name="derived_from"><Select name="derived_from" empty="—" options={datasets.filter((d) => !d.archived_at).map(dsOption)} /></Field>
            <Field label="Método / script / versão (obrigatório se processado)" name="method" rows={2} /><Field label="Notas" name="notes" /><Submit>Enviar</Submit>
          </form>
        </details>
      </Card>

      <Card title="Interpretações">
        {interpretations.length === 0 ? <Empty>Nenhuma.</Empty> : <ul className="list">{interpretations.map((i: any) => <li key={i.id}><div className="prose">{i.body}</div><Provenance origin={i.origin} review={i.review_status} />{i.dataset_id && <span className="muted small"> sobre {datasets.find((d) => d.id === i.dataset_id)?.name}</span>}</li>)}</ul>}
        <details><summary>Registrar interpretação</summary>
          <form action={addInterpretationAction.bind(null, projectId, experimentId)}>
            <Field label="Dados analisados" name="dataset_id"><Select name="dataset_id" empty="—" options={datasets.filter((d) => !d.archived_at).map(dsOption)} /></Field>
            <Field label="Interpretação" name="body" rows={4} required /><Submit>Salvar</Submit>
          </form>
        </details>
      </Card>

      <Card title="Resultados">
        {results.length === 0 ? <Empty>Nenhum resultado.</Empty> : (
          <table><thead><tr><th>Resultado</th><th>Valor</th><th>Estatística</th><th>Status</th><th /></tr></thead>
            <tbody>{results.map((r: any) => (
              <tr key={r.id}><td>{r.statement}{!r.interpretation_id && <div className="small"><Badge tone="warn">sem interpretação</Badge></div>}</td>
                <td>{r.value ?? '—'} {r.unit ?? ''}</td><td>{r.stat_test ?? '—'}{r.p_value != null ? ` (p=${r.p_value})` : ''}</td>
                <td><Badge tone={r.status === 'final' ? 'ok' : 'warn'}>{r.status === 'final' ? 'final' : 'preliminar'}</Badge></td>
                <td>{r.status !== 'final' && <form action={finalizeResultAction.bind(null, projectId, experimentId, r.id)}><button className="btn small">Tornar final</button></form>}
                  <Link className="link small" href={`/p/${projectId}/trace/result/${r.id}`}>rastrear</Link></td></tr>))}
            </tbody></table>
        )}
        <details><summary>Registrar resultado (números são sempre do pesquisador)</summary>
          <form action={addResultAction.bind(null, projectId, experimentId)}>
            <Field label="Afirmação do resultado" name="statement" rows={2} required />
            <Field label="Interpretação de base" name="interpretation_id"><Select name="interpretation_id" empty="—" options={interpretations.map((i: any) => ({ value: i.id, label: i.body.slice(0, 70) }))} /></Field>
            <Field label="Grupo" name="group_id"><Select name="group_id" empty="—" options={groups.map((g) => ({ value: g.id, label: g.name }))} /></Field>
            <div className="grid cols-4"><Field label="Métrica" name="metric" /><Field label="Valor" name="value" /><Field label="Unidade" name="unit" /><Field label="p" name="p_value" /></div>
            <Field label="Teste estatístico" name="stat_test" /><Submit>Salvar como preliminar</Submit>
          </form>
        </details>
      </Card>

      <Card title="Reagentes utilizados">
        {reagents.length === 0 ? <Empty>Nenhum.</Empty> : <ul className="list">{reagents.map((r: any) => <li key={r.id}>{r.reagents.name} {r.reagent_lots && <span className="muted">lote {r.reagent_lots.lot_number}</span>} {r.amount != null && `· ${r.amount} ${r.unit ?? ''}`}</li>)}</ul>}
        <details><summary>Registrar uso</summary>
          <form action={useReagentAction.bind(null, projectId, experimentId)}>
            <Field label="Reagente" name="reagent_id"><Select name="reagent_id" required empty="Escolha…" options={reagentCatalog.map((r) => ({ value: r.id, label: r.name }))} /></Field>
            <Field label="Lote" name="lot_id"><Select name="lot_id" empty="—" options={reagentCatalog.flatMap((r) => r.reagent_lots.map((l) => ({ value: l.id, label: `${r.name} — lote ${l.lot_number}` })))} /></Field>
            <div className="grid cols-2"><Field label="Quantidade" name="amount" /><Field label="Unidade" name="unit" /></div><Submit>Registrar</Submit>
          </form>
        </details>
      </Card>

      <LinkPanel db={db} projectId={projectId} srcType="experiment" srcId={experimentId} backTo={back} />
    </>
  );
}
