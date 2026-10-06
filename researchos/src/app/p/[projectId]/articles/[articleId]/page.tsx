import { notFound } from 'next/navigation';
import { LinkPanel } from '@/components/LinkPanel';
import { Badge, Card, Empty, Field, PageHeader, Provenance, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { aiConfigured } from '@/lib/env';
import { addPassageAction, attachPdfAction, confirmMetadataAction, setReadingStatusAction } from '@/modules/articles/actions';
import { getArticle, signedPdfUrl } from '@/modules/articles/service';
import { addFieldAction, approveAllAction, approveFichamentoAction, editFieldAction, generateFichamentoAction, reviewFieldAction } from '@/modules/fichamento/actions';
import { getFichamento } from '@/modules/fichamento/service';
import { FICHAMENTO_FIELDS, FIELD_LABEL } from '@/modules/fichamento/verify';

export default async function ArticlePage({ params }: { params: Promise<{ projectId: string; articleId: string }> }) {
  const { projectId, articleId } = await params;
  const { db } = await requireUser();
  let article;
  try { article = await getArticle(db, articleId); } catch { notFound(); }
  const files = article.article_files;
  const file = files[0];
  const [fich, pdfUrl] = await Promise.all([getFichamento(db, articleId), file ? signedPdfUrl(db, file.storage_path).catch(() => null) : Promise.resolve(null)]);
  const back = `/p/${projectId}/articles/${articleId}`;
  const canGenerate = aiConfigured() && file?.extraction_status === 'done';
  const order = ['reference', ...FICHAMENTO_FIELDS] as string[];
  const fields = (fich?.fields ?? []).slice().sort((a, b) => order.indexOf(a.field_key) - order.indexOf(b.field_key) || a.position - b.position);
  const drafts = fields.filter((f) => f.review_status === 'draft').length;

  return (
    <>
      <PageHeader title={article.title} subtitle={`${article.authors.map((a) => a.family).join('; ')}${article.year ? ` · ${article.year}` : ''}${article.journal ? ` · ${article.journal}` : ''}`}
        actions={<form className="row" action={setReadingStatusAction.bind(null, projectId, articleId)}>
          <Select name="status" defaultValue={article.reading_status} options={[['to_read', 'A ler'], ['reading', 'Lendo'], ['read', 'Lido'], ['fichado', 'Fichado']].map(([value, label]) => ({ value, label }))} /><button className="btn small">Salvar</button></form>} />

      <div className="grid cols-2">
        <Card title="Arquivo PDF">
          {file ? (
            <>
              <p><a className="link" href={pdfUrl ?? '#'} target="_blank" rel="noreferrer">Abrir PDF ↗</a> <span className="muted small">{file.page_count} páginas · {file.original_name}</span></p>
              <p>{file.extraction_status === 'done' ? <Badge tone="ok">texto extraído</Badge> : <Badge tone="warn">sem camada de texto (escaneado?)</Badge>}</p>
            </>
          ) : (
            <form action={attachPdfAction.bind(null, projectId, articleId)}>
              <Field label="Anexar PDF" name="file"><input type="file" name="file" accept="application/pdf" required /></Field><Submit>Enviar</Submit>
            </form>
          )}
        </Card>
        <Card title={<>Metadados <Provenance origin={article.metadata_origin as any} /> {article.metadata_verified ? <Badge tone="ok">confirmados</Badge> : <Badge tone="warn">a confirmar</Badge>}</>}>
          <details open={!article.metadata_verified}><summary>{article.metadata_verified ? 'Editar' : 'Revisar e confirmar'}</summary>
            <form action={confirmMetadataAction.bind(null, projectId, articleId)}>
              <Field label="Título" name="title" defaultValue={article.title} required />
              <Field label="Autores (Sobrenome, Nome; …)" name="authors" defaultValue={article.authors.map((a) => (a.given ? `${a.family}, ${a.given}` : a.family)).join('; ')} />
              <div className="grid cols-2"><Field label="Ano" name="year" type="number" defaultValue={article.year} /><Field label="DOI" name="doi" defaultValue={article.doi} /></div>
              <Field label="Periódico" name="journal" defaultValue={article.journal} /><Field label="Resumo" name="abstract" rows={3} defaultValue={article.abstract} />
              <Submit>Confirmar metadados</Submit>
            </form>
          </details>
          <p className="muted small">O DOI só é preenchido se aparecer literalmente no PDF ou se você digitar. A IA nunca o gera.</p>
        </Card>
      </div>

      <Card title="Fichamento" id="fichamento">
        <div className="row" style={{ marginBottom: '.75rem' }}>
          {fich && <Badge tone={fich.status === 'approved' ? 'ok' : 'warn'}>{fich.status === 'approved' ? 'aprovado' : 'em revisão'}</Badge>}
          <form action={generateFichamentoAction.bind(null, projectId, articleId)}>
            <button className="btn btn-primary" disabled={!canGenerate} title={canGenerate ? '' : 'Requer PDF com texto e ANTHROPIC_API_KEY configurada'}>{fich ? 'Gerar novo rascunho com IA' : 'Gerar rascunho com IA'}</button>
          </form>
          {fich && drafts > 0 && <form action={approveAllAction.bind(null, projectId, articleId, fich.id)}><button className="btn">Aprovar {drafts} pendentes</button></form>}
          {fich && fich.status !== 'approved' && <form action={approveFichamentoAction.bind(null, projectId, articleId, fich.id)}><button className="btn btn-primary">Aprovar fichamento</button></form>}
        </div>
        {!canGenerate && <p className="muted small">{!aiConfigured() ? 'IA não configurada (ANTHROPIC_API_KEY).' : 'Importe um PDF com texto para gerar o rascunho.'}</p>}
        {!fich ? <Empty>Sem fichamento. A IA gera um <strong>rascunho</strong>; nada vale até você aprovar.</Empty> : fields.map((f) => (
          <div key={f.id} className={`field-block ${f.review_status === 'draft' ? 'draft' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{FIELD_LABEL[f.field_key]}</h3><Provenance origin={f.origin} review={f.review_status} />
            </div>
            <div className="prose">{f.content}</div>
            {f.passages && (
              <blockquote className="quote">“{f.passages.quote}” <span className="small">— p. {f.passages.page_number}{' '}
                {f.passages.verified_in_source ? <Badge tone="ok">literal no PDF</Badge> : <Badge tone="warn">não verificado</Badge>}{' '}
                {pdfUrl && f.passages.page_number && <a className="link" href={`${pdfUrl}#page=${f.passages.page_number}`} target="_blank" rel="noreferrer">abrir na página ↗</a>}</span></blockquote>
            )}
            {f.field_key !== 'reference' && (
              <div className="row">
                {f.review_status !== 'approved' && <form action={reviewFieldAction.bind(null, projectId, articleId, f.id, 'approved')}><button className="btn small">Aprovar</button></form>}
                {f.review_status !== 'rejected' && <form action={reviewFieldAction.bind(null, projectId, articleId, f.id, 'rejected')}><button className="btn btn-danger small">Rejeitar</button></form>}
                <details><summary className="small">Editar</summary>
                  <form action={editFieldAction.bind(null, projectId, articleId, f.id)}><Field label="Seu texto (passa a constar como do pesquisador)" name="content" rows={3} defaultValue={f.content} /><Submit>Salvar edição</Submit></form>
                </details>
              </div>
            )}
          </div>
        ))}
        {fich && (
          <details><summary>Adicionar campo manualmente</summary>
            <form action={addFieldAction.bind(null, projectId, articleId, fich.id)}>
              <Field label="Campo" name="field_key"><Select name="field_key" options={FICHAMENTO_FIELDS.map((k) => ({ value: k, label: FIELD_LABEL[k] }))} /></Field>
              <Field label="Conteúdo" name="content" rows={3} required /><Submit>Adicionar</Submit>
            </form>
          </details>
        )}
      </Card>

      <Card title="Passagens (trechos citáveis)">
        {article.passages.length === 0 ? <Empty>Nenhuma passagem. Registre trechos para usar como citação e evidência.</Empty> : (
          <ul className="list">{article.passages.map((p: any) => (
            <li key={p.id}><blockquote className="quote">“{p.quote}”</blockquote>
              <span className="small muted">p. {p.page_number ?? '—'}{p.section ? ` · ${p.section}` : ''} </span>
              {p.verified_in_source ? <Badge tone="ok">literal no PDF</Badge> : <Badge tone="warn">não confere com o PDF</Badge>} <Provenance origin={p.origin} />
              {p.note && <div className="muted">{p.note}</div>}
            </li>))}
          </ul>
        )}
        <details><summary>Registrar passagem</summary>
          <form action={addPassageAction.bind(null, projectId, articleId)}>
            <Field label="Trecho (copie literalmente do PDF)" name="quote" rows={3} required />
            <div className="grid cols-2"><Field label="Página" name="page" type="number" /><Field label="Seção" name="section" /></div>
            <Field label="Nota" name="note" /><Submit>Salvar passagem</Submit>
          </form>
        </details>
      </Card>

      <LinkPanel db={db} projectId={projectId} srcType="article" srcId={articleId} backTo={back} />
    </>
  );
}
