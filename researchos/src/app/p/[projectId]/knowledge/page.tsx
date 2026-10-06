import Link from 'next/link';
import { Badge, Card, Empty, Field, PageHeader, Provenance, Select, Submit } from '@/components/ui';
import { requireUser, first, type SearchParams } from '@/lib/auth';
import { createKnowledgeAction, setKnowledgeStatusAction } from '@/modules/knowledge/actions';
import { KIND_LABEL, listKnowledge } from '@/modules/knowledge/service';
import { listPassages } from '@/modules/evidence/service';

export default async function KnowledgePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: SearchParams }) {
  const { projectId } = await params;
  const kind = first((await searchParams).kind);
  const { db } = await requireUser();
  const [items, passages] = await Promise.all([listKnowledge(db, projectId, kind), listPassages(db, projectId)]);
  const base = `/p/${projectId}/knowledge`;
  return (
    <>
      <PageHeader title="Conhecimento" subtitle="Conceitos, ideias, perguntas, citações, lacunas e contradições — sempre ligados à origem." />
      <nav className="row" style={{ marginBottom: '1rem' }}>
        <Link className="btn small" href={base}>Todos</Link>
        {Object.entries(KIND_LABEL).map(([k, l]) => <Link key={k} className="btn small" href={`${base}?kind=${k}`}>{l}s</Link>)}
      </nav>
      <Card title="Novo item">
        <form action={createKnowledgeAction.bind(null, projectId)}>
          <div className="grid cols-2">
            <Field label="Tipo" name="kind"><Select name="kind" options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} defaultValue={kind ?? 'idea'} /></Field>
            <Field label="Etiquetas (vírgula)" name="tags" />
          </div>
          <Field label="Título" name="title" required /><Field label="Descrição" name="body" rows={3} />
          <Field label="Passagem de origem (obrigatória para citações)" name="passage_id"><Select name="passage_id" empty="— nenhuma —" options={passages.map((p) => ({ value: p.id, label: `${p.articles.title.slice(0, 40)} p.${p.page_number ?? '?'}: ${p.quote.slice(0, 50)}` }))} /></Field>
          <Submit>Salvar</Submit>
        </form>
      </Card>
      <Card title={`Itens (${items.length})`}>
        {items.length === 0 ? <Empty>Nada aqui ainda.</Empty> : (
          <ul className="list">{items.map((k) => (
            <li key={k.id} id={`k-${k.id}`}>
              <div className="row"><Badge tone="info">{KIND_LABEL[k.kind]}</Badge><strong>{k.title}</strong><Provenance origin={k.origin} review={k.review_status} /><Badge>{k.status}</Badge></div>
              {k.body && <div className="prose">{k.body}</div>}
              {k.passages && <blockquote className="quote">“{k.passages.quote}” <span className="small">— <Link className="link" href={`/p/${projectId}/articles/${k.passages.article_id}`}>{k.passages.articles.title}</Link>, p. {k.passages.page_number ?? '—'}</span></blockquote>}
              <div className="row">
                {k.status !== 'resolved' && <form action={setKnowledgeStatusAction.bind(null, projectId, k.id, 'resolved')}><button className="btn small">Resolver</button></form>}
                <form action={setKnowledgeStatusAction.bind(null, projectId, k.id, 'archived')}><button className="btn btn-ghost small">Arquivar</button></form>
                <Link className="link small" href={`/p/${projectId}/trace/knowledge_item/${k.id}`}>rastrear →</Link>
              </div>
            </li>))}
          </ul>
        )}
      </Card>
    </>
  );
}
