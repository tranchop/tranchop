import Link from 'next/link';
import { Card, Empty, Field, Provenance, Select, Submit } from '@/components/ui';
import { NODE_LABEL, nodeHref, type Origin, type ReviewStatus } from '@/lib/types';
import { createLinkAction, deleteLinkAction } from '@/modules/knowledge/actions';
import { linksOf, nodeLabels, RELATION_LABEL } from '@/modules/knowledge/service';
import type { Db } from '@/lib/types';

/** Relações de um item (entrantes e saientes) + formulário para criar nova relação. */
export async function LinkPanel({ db, projectId, srcType, srcId, backTo }: { db: Db; projectId: string; srcType: string; srcId: string; backTo: string }) {
  const { outgoing, incoming } = await linksOf(db, srcType, srcId);
  const all = [
    ...outgoing.map((l: any) => ({ l, dir: 'out' as const, other: { type: l.dst_type as string, id: l.dst_id as string } })),
    ...incoming.map((l: any) => ({ l, dir: 'in' as const, other: { type: l.src_type as string, id: l.src_id as string } }))
  ];
  const labels = await nodeLabels(db, all.map((a) => a.other));
  const { data: targets } = await db.from('v_nodes').select('node_type, node_id, label').eq('project_id', projectId).limit(400);
  const options = (targets ?? []).filter((t: any) => !(t.node_type === srcType && t.node_id === srcId)).map((t: any) => ({ value: `${t.node_type}:${t.node_id}`, label: `${NODE_LABEL[t.node_type] ?? t.node_type} — ${String(t.label).slice(0, 70)}` }));

  return (
    <Card title="Relações">
      {all.length === 0 ? <Empty>Sem relações ainda.</Empty> : (
        <ul className="list">
          {all.map(({ l, dir, other }) => (
            <li key={l.id} className="row">
              <span>{dir === 'out' ? 'Este item' : ''} <em>{dir === 'out' ? RELATION_LABEL[l.relation as keyof typeof RELATION_LABEL] : `← ${RELATION_LABEL[l.relation as keyof typeof RELATION_LABEL]} este item`}</em>{' '}
                <Link className="link" href={nodeHref(projectId, other.type, other.id)}>{NODE_LABEL[other.type]}: {labels.get(`${other.type}:${other.id}`) ?? '…'}</Link></span>
              <Provenance origin={l.origin as Origin} review={l.review_status as ReviewStatus} />
              <form action={deleteLinkAction.bind(null, backTo, l.id)}><button className="btn btn-ghost small" aria-label="Remover relação">remover</button></form>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Relacionar com outro item</summary>
        <form action={createLinkAction.bind(null, projectId, backTo)}>
          <input type="hidden" name="src_type" value={srcType} /><input type="hidden" name="src_id" value={srcId} />
          <Field label="Relação" name="relation"><Select name="relation" options={Object.entries(RELATION_LABEL).map(([value, label]) => ({ value, label: `este item ${label} …` }))} /></Field>
          <Field label="Item de destino" name="target"><Select name="target" required empty="Escolha…" options={options} /></Field>
          <Field label="Nota (opcional)" name="note" /><Submit>Criar relação</Submit>
        </form>
      </details>
      <p className="small"><Link className="link" href={`/p/${projectId}/trace/${srcType}/${srcId}`}>Ver cadeia de rastreabilidade →</Link></p>
    </Card>
  );
}
