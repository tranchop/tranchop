import Link from 'next/link';
import { Badge, Card, Empty, PageHeader, Provenance } from '@/components/ui';
import { requireUser, first, type SearchParams } from '@/lib/auth';
import { NODE_LABEL, nodeHref, type Origin, type ReviewStatus } from '@/lib/types';
import { EDGE_LABEL, groupByDepth, traceNode } from '@/modules/trace/service';

export default async function TracePage({ params, searchParams }: { params: Promise<{ projectId: string; type: string; id: string }>; searchParams: SearchParams }) {
  const { projectId, type, id } = await params;
  const depth = Math.min(Number(first((await searchParams).depth) ?? 3) || 3, 6);
  const { db } = await requireUser();
  const { nodes, edges } = await traceNode(db, type, id, depth);
  const label = new Map(nodes.map((n) => [`${n.node_type}:${n.node_id}`, n]));
  const layers = groupByDepth(nodes);
  const nameOf = (t: string, i: string) => `${NODE_LABEL[t] ?? t}: ${label.get(`${t}:${i}`)?.label ?? '…'}`;
  return (
    <>
      <PageHeader title="Rastreabilidade" subtitle={`Tudo que se conecta a este item em até ${depth} saltos: da afirmação ao PDF/página, do artigo à dissertação.`} actions={
        [2, 3, 4, 6].map((d) => <Link key={d} className="btn small" href={`?depth=${d}`}>{d} saltos</Link>)} />
      <Card title="Camadas (distância do item)">
        {[...layers.entries()].map(([d, ns]) => (
          <div key={d} style={{ marginBottom: '.75rem' }}>
            <h3>{d === 0 ? 'Item de partida' : `${d} salto(s)`}</h3>
            <div className="row">{ns.map((n) => <Link key={`${n.node_type}${n.node_id}`} className="btn small" href={nodeHref(projectId, n.node_type, n.node_id)}>{NODE_LABEL[n.node_type]} · {n.label.slice(0, 60)}</Link>)}</div>
          </div>
        ))}
      </Card>
      <Card title={`Relações (${edges.length})`}>
        {edges.length === 0 ? <Empty>Este item ainda não tem relações. Crie-as nas páginas dos itens.</Empty> : (
          <ul className="list">{edges.map((e, i) => (
            <li key={i}>{nameOf(e.src_type, e.src_id)} <Badge tone="info">{EDGE_LABEL[e.relation] ?? e.relation}</Badge> {nameOf(e.dst_type, e.dst_id)} <Provenance origin={e.origin as Origin} review={e.review_status as ReviewStatus} /></li>))}
          </ul>
        )}
      </Card>
    </>
  );
}
