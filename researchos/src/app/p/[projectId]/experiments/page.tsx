import Link from 'next/link';
import { Badge, Card, Empty, Field, PageHeader, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { addProtocolVersionAction, createExperimentAction, createProtocolAction } from '@/modules/experiments/actions';
import { listExperiments, listProtocols } from '@/modules/experiments/service';
import { listFrame } from '@/modules/projects/service';

export default async function ExperimentsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const [exps, protocols, frame] = await Promise.all([listExperiments(db, projectId), listProtocols(db, projectId), listFrame(db, projectId)]);
  const versions = protocols.flatMap((p) => p.protocol_versions.map((v) => ({ value: v.id, label: `${p.title} v${v.version}` })));
  return (
    <>
      <PageHeader title="Experimentos e protocolos" subtitle="Hipótese → experimento (protocolo versionado) → dados → interpretação → resultado." />
      <div className="grid cols-2">
        <Card title="Novo experimento">
          <form action={createExperimentAction.bind(null, projectId)}>
            <div className="grid cols-2"><Field label="Título" name="title" required /><Field label="Código" name="code" placeholder="EXP-001" /></div>
            <Field label="Hipótese testada" name="hypothesis_id"><Select name="hypothesis_id" empty="—" options={frame.hypotheses.map((h: any) => ({ value: h.id, label: h.statement.slice(0, 80) }))} /></Field>
            <Field label="Protocolo (versão fixada)" name="protocol_version_id"><Select name="protocol_version_id" empty="—" options={versions} /></Field>
            <Field label="Desenho experimental" name="design" rows={3} /><Submit>Criar experimento</Submit>
          </form>
        </Card>
        <Card title="Protocolos">
          {protocols.length === 0 ? <Empty>Nenhum protocolo.</Empty> : (
            <ul className="list">{protocols.map((p) => (
              <li key={p.id}><strong>{p.title}</strong> <Badge>v{p.current_version}</Badge>
                <details><summary className="small">Nova versão (as anteriores permanecem imutáveis)</summary>
                  <form action={addProtocolVersionAction.bind(null, projectId, p.id)}><Field label="Texto do protocolo" name="body" rows={6} required /><Field label="O que mudou" name="change_note" /><Submit>Salvar como v{p.current_version + 1}</Submit></form>
                </details>
              </li>))}
            </ul>
          )}
          <details><summary>Novo protocolo</summary>
            <form action={createProtocolAction.bind(null, projectId)}><Field label="Título" name="title" required /><Field label="Objetivo" name="objective" /><Field label="Texto" name="body" rows={6} required /><Submit>Criar</Submit></form>
          </details>
        </Card>
      </div>
      <Card title={`Experimentos (${exps.length})`}>
        {exps.length === 0 ? <Empty>Nenhum experimento.</Empty> : (
          <table><thead><tr><th>Experimento</th><th>Hipótese</th><th>Status</th></tr></thead>
            <tbody>{exps.map((e) => (
              <tr key={e.id}><td><Link className="link" href={`/p/${projectId}/experiments/${e.id}`}>{e.code ? `${e.code} — ` : ''}{e.title}</Link></td><td className="muted">{e.hypotheses?.statement.slice(0, 80) ?? '—'}</td><td><Badge>{e.status}</Badge></td></tr>))}
            </tbody></table>
        )}
      </Card>
    </>
  );
}
