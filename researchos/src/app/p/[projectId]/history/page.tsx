import { Badge, Card, Empty, fmtDateTime, PageHeader } from '@/components/ui';
import { requireUser, first, type SearchParams } from '@/lib/auth';
import { describeChange, diffFields, listChanges, TABLE_LABEL } from '@/modules/history/service';

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: SearchParams }) {
  const { projectId } = await params;
  const sp = await searchParams;
  const table = first(sp.table);
  const { db } = await requireUser();
  const [changes, gens] = await Promise.all([
    listChanges(db, projectId, { table, limit: 150 }),
    db.from('ai_generations').select('id, purpose, model, context_scope, status, review_status, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(15).then((r) => r.data ?? [])
  ]);
  return (
    <>
      <PageHeader title="Histórico" subtitle="Quem mudou o quê e quando (estado anterior e novo), mais o registro de todas as gerações de IA." />
      <form className="row" action=""><select name="table" defaultValue={table ?? ''}><option value="">Todas as entidades</option>{Object.entries(TABLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><button className="btn small">Filtrar</button></form>
      <Card title="Gerações de IA">
        {gens.length === 0 ? <Empty>Nenhuma geração.</Empty> : <table><thead><tr><th>Quando</th><th>Finalidade</th><th>Contexto</th><th>Modelo</th><th>Status</th><th>Revisão humana</th></tr></thead>
          <tbody>{gens.map((g: any) => <tr key={g.id}><td>{fmtDateTime(g.created_at)}</td><td>{g.purpose}</td><td>{g.context_scope}</td><td className="mono">{g.model}</td><td>{g.status}</td><td><Badge tone={g.review_status === 'approved' ? 'ok' : 'warn'}>{g.review_status}</Badge></td></tr>)}</tbody></table>}
      </Card>
      <Card title="Alterações">
        {changes.length === 0 ? <Empty>Sem alterações.</Empty> : (
          <ul className="list">{changes.map((c) => {
            const diffs = c.op === 'UPDATE' ? diffFields(c.old_data, c.new_data).slice(0, 4) : [];
            return (
              <li key={c.id}><div>{describeChange(c)} <span className="muted small">{fmtDateTime(c.changed_at)}</span></div>
                {diffs.length > 0 && <details><summary className="small">{diffs.length} campo(s)</summary>{diffs.map((d) => <div key={d.field} className="small mono">{d.field}: <s>{String(d.before ?? '∅').slice(0, 80)}</s> → {String(d.after ?? '∅').slice(0, 80)}</div>)}</details>}
              </li>);
          })}</ul>
        )}
      </Card>
    </>
  );
}
