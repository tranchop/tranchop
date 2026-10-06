import Link from 'next/link';
import { Badge, Card, Empty, Field, PageHeader, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { createArticleAction, importPdfAction } from '@/modules/articles/actions';
import { listArticles } from '@/modules/articles/service';

const STATUS: Record<string, string> = { to_read: 'a ler', reading: 'lendo', read: 'lido', fichado: 'fichado' };

export default async function ArticlesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const articles = await listArticles(db, projectId);
  return (
    <>
      <PageHeader title="Biblioteca" subtitle="Artigos e PDFs. Cada fichamento aponta de volta para página e trecho." />
      <div className="grid cols-2">
        <Card title="Importar PDF">
          <form action={importPdfAction.bind(null, projectId)}>
            <Field label="Arquivo PDF (até 40 MB)" name="file"><input type="file" name="file" accept="application/pdf" required /></Field>
            <Submit>Importar e extrair texto</Submit>
          </form>
          <p className="muted small">O texto é extraído página a página (base da busca e das citações). PDFs escaneados não têm texto: OCR fica para depois do MVP.</p>
        </Card>
        <Card title="Adicionar manualmente">
          <details><summary>Digitar metadados</summary>
            <form action={createArticleAction.bind(null, projectId)}>
              <Field label="Título" name="title" required /><Field label="Autores (Sobrenome, Nome; …)" name="authors" />
              <div className="grid cols-2"><Field label="Ano" name="year" type="number" /><Field label="DOI" name="doi" /></div>
              <Field label="Periódico" name="journal" /><Field label="Resumo" name="abstract" rows={3} /><Submit>Adicionar</Submit>
            </form>
          </details>
        </Card>
      </div>
      <Card title={`Artigos (${articles.length})`}>
        {articles.length === 0 ? <Empty>Importe seu primeiro PDF.</Empty> : (
          <table>
            <thead><tr><th>Título</th><th>Ano</th><th>Status</th><th>Metadados</th></tr></thead>
            <tbody>{articles.map((a) => (
              <tr key={a.id}>
                <td><Link className="link" href={`/p/${projectId}/articles/${a.id}`}>{a.title}</Link><div className="muted small">{a.authors.map((x) => x.family).join('; ')}</div></td>
                <td>{a.year ?? '—'}</td><td><Badge tone={a.reading_status === 'fichado' ? 'ok' : 'neutral'}>{STATUS[a.reading_status]}</Badge></td>
                <td>{a.metadata_verified ? <Badge tone="ok">confirmados</Badge> : <Badge tone="warn">a confirmar</Badge>}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
