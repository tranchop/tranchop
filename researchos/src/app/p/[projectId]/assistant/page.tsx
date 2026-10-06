import Link from 'next/link';
import { Badge, Card, Empty, Field, PageHeader, Select, Submit, fmtDateTime } from '@/components/ui';
import { requireUser, first, type SearchParams } from '@/lib/auth';
import { aiConfigured } from '@/lib/env';
import { NO_INFO_MESSAGE } from '@/modules/ai/guardrails';
import { askAction } from '@/modules/assistant/actions';
import { listArticles } from '@/modules/articles/service';

export default async function AssistantPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: SearchParams }) {
  const { projectId } = await params;
  const g = first((await searchParams).g);
  const { db } = await requireUser();
  const [articles, gen, recent] = await Promise.all([
    listArticles(db, projectId),
    g ? db.from('ai_generations').select('*').eq('id', g).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    db.from('ai_generations').select('id, created_at, context_scope, status, context_refs').eq('project_id', projectId).eq('purpose', 'assistant_answer').order('created_at', { ascending: false }).limit(8).then((r) => r.data ?? [])
  ]);
  const out = (gen?.output ?? {}) as { answer?: string; insufficient?: boolean; missing?: string; warnings?: string[]; sources?: { ref: string; label: string; text: string; articleId?: string; page?: number; projectId: string }[] };
  return (
    <>
      <PageHeader title="Assistente científico" subtitle="Responde somente com o que está na sua base, citando o trecho. Sem base suficiente, ele diz que não sabe." />
      {!aiConfigured() && <div className="notice">IA não configurada: defina ANTHROPIC_API_KEY no servidor.</div>}
      <Card title="Perguntar">
        <form action={askAction.bind(null, projectId)}>
          <Field label="Pergunta" name="question" rows={3} required />
          <div className="grid cols-2">
            <Field label="Contexto" name="scope"><Select name="scope" defaultValue="project" options={[
              { value: 'source', label: 'Uma fonte (artigo)' }, { value: 'library', label: 'Biblioteca' }, { value: 'project', label: 'Projeto' }, { value: 'dissertation', label: 'Dissertação (artigos citados)' }, { value: 'system', label: 'Sistema inteiro (todos os seus projetos)' }]} /></Field>
            <Field label="Artigo (se contexto = fonte)" name="article_id"><Select name="article_id" empty="—" options={articles.map((a) => ({ value: a.id, label: a.title.slice(0, 70) }))} /></Field>
          </div>
          <Submit>Perguntar</Submit>
        </form>
      </Card>
      {gen && (
        <Card title="Resposta">
          <p className="muted small">Contexto: {gen.context_scope} · modelo {gen.model} · {fmtDateTime(gen.created_at)} · revisão humana: {gen.review_status}</p>
          {gen.status === 'insufficient_context' || out.insufficient ? (
            <>
              <div className="notice"><strong>{NO_INFO_MESSAGE}</strong>{out.missing && <div className="muted">Faltou: {out.missing}</div>}</div>
              {out.warnings?.map((w, i) => <p key={i} className="small muted">⚠️ {w}</p>)}
            </>
          ) : (
            <>
              <div className="prose">{out.answer}</div>
              {out.missing && <p className="muted">Não coberto pela base: {out.missing}</p>}
              {out.warnings?.map((w, i) => <p key={i} className="small">⚠️ {w}</p>)}
              <h3 style={{ marginTop: '1rem' }}>Fontes</h3>
              <ul className="list">{(out.sources ?? []).map((s) => (
                <li key={s.ref}><Badge>{s.ref}</Badge> {s.articleId ? <Link className="link" href={`/p/${s.projectId}/articles/${s.articleId}`}>{s.label}</Link> : s.label}
                  <blockquote className="quote">{s.text.slice(0, 400)}</blockquote></li>))}
              </ul>
            </>
          )}
        </Card>
      )}
      <Card title="Consultas recentes">
        {recent.length === 0 ? <Empty>Nenhuma.</Empty> : <ul className="list">{recent.map((r: any) => <li key={r.id}><Link className="link" href={`/p/${projectId}/assistant?g=${r.id}`}>{r.context_refs?.question?.slice(0, 90) ?? r.id}</Link> <Badge>{r.context_scope}</Badge> {r.status === 'insufficient_context' && <Badge tone="warn">sem base</Badge>}</li>)}</ul>}
      </Card>
    </>
  );
}
