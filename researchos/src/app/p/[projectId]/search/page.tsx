import Link from 'next/link';
import { Badge, Card, Empty, PageHeader } from '@/components/ui';
import { requireUser, first, type SearchParams } from '@/lib/auth';
import { NODE_LABEL, nodeHref } from '@/lib/types';
import { searchProject } from '@/modules/search/service';

export default async function SearchPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: SearchParams }) {
  const { projectId } = await params;
  const q = first((await searchParams).q) ?? '';
  const { db } = await requireUser();
  const res = q ? await searchProject(db, projectId, q) : { hits: [], semantic: false };
  return (
    <>
      <PageHeader title="Busca" subtitle="Texto completo em notas, fichamentos, resultados, escrita e nos PDFs (com página)." />
      <form className="row" action="" role="search"><input name="q" defaultValue={q} placeholder="Buscar em todo o projeto…" autoFocus style={{ flex: 1 }} /><button className="btn btn-primary">Buscar</button></form>
      <p className="muted small">{res.semantic ? 'Busca híbrida: texto + semântica.' : 'Busca textual (semântica desligada: configure EMBEDDINGS_API_KEY).'}</p>
      {q && (
        <Card title={`${res.hits.length} resultado(s)`}>
          {res.hits.length === 0 ? <Empty>Nada encontrado.</Empty> : (
            <ul className="list">{res.hits.map((h, i) => (
              <li key={i}>
                <div className="row"><Badge tone={h.kind === 'chunk' ? 'info' : 'neutral'}>{h.kind === 'chunk' ? 'PDF' : NODE_LABEL[h.entityType] ?? h.entityType}</Badge>
                  <Link className="link" href={h.kind === 'chunk' ? `/p/${projectId}/articles/${h.articleId}` : nodeHref(projectId, h.entityType === 'fichamento_field' ? 'article' : h.entityType, h.entityId)}>{h.title}</Link></div>
                <div className="muted">{h.snippet}</div>
              </li>))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
