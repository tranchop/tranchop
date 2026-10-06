import Link from 'next/link';
import { Badge, Card, Empty, Field, PageHeader, Select, Submit } from '@/components/ui';
import { requireUser, first, type SearchParams } from '@/lib/auth';
import { listArticles } from '@/modules/articles/service';
import { listClaims } from '@/modules/evidence/service';
import { addCitationAction, addSectionAction, attachClaimAction, saveSectionAction } from '@/modules/writing/actions';
import { ensureDissertation, getSectionView, listSections } from '@/modules/writing/service';

const STATUS = [['outline', 'Esboço'], ['drafting', 'Redigindo'], ['review', 'Em revisão'], ['final', 'Final']] as const;

export default async function DissertationPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: SearchParams }) {
  const { projectId } = await params;
  const selected = first((await searchParams).s);
  const { db } = await requireUser();
  const docId = await ensureDissertation(db, projectId);
  const sections = await listSections(db, docId);
  const current = selected ? sections.find((s) => s.id === selected) : undefined;
  const view = current ? await getSectionView(db, current.id) : null;
  const [articles, claims, passages] = current ? await Promise.all([listArticles(db, projectId), listClaims(db, projectId), db.from('passages').select('id, article_id, page_number, quote')]) : [[], [], { data: [] }];
  const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  const total = sections.reduce((n, s) => n + words(s.content), 0);

  return (
    <>
      <PageHeader title="Dissertação" subtitle={`${total} palavras · ${sections.filter((s) => s.status === 'final').length}/${sections.length} seções finais`} actions={<a className="btn" href={`/p/${projectId}/dissertation/export`}>Exportar Markdown (ABNT)</a>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) 1fr' }}>
        <div>
          <Card title="Estrutura">
            <ul className="list">{sections.map((s) => (
              <li key={s.id} id={`s-${s.id}`} style={{ paddingLeft: s.parent_id ? '1rem' : 0 }}>
                <Link className="link" href={`/p/${projectId}/dissertation?s=${s.id}`} style={{ fontWeight: s.id === selected ? 700 : 400 }}>{s.title}</Link>{' '}
                <Badge tone={s.status === 'final' ? 'ok' : s.status === 'outline' ? 'neutral' : 'info'}>{STATUS.find(([v]) => v === s.status)?.[1]}</Badge> <span className="muted small">{words(s.content)}p</span>
              </li>))}
            </ul>
            <details><summary>Nova seção</summary>
              <form action={addSectionAction.bind(null, projectId, docId)}><Field label="Título" name="title" required /><Field label="Dentro de" name="parent_id"><Select name="parent_id" empty="(raiz)" options={sections.map((s) => ({ value: s.id, label: s.title }))} /></Field><Submit>Adicionar</Submit></form>
            </details>
          </Card>
        </div>
        <div>
          {!current || !view ? <Card><Empty>Escolha uma seção para escrever.</Empty></Card> : (
            <>
              {view.warnings.length > 0 && (
                <div className="notice"><strong>Alertas de rigor</strong><ul>{view.warnings.map((w, i) => <li key={i}>{w.level === 'error' ? '⛔' : '⚠️'} {w.message}</li>)}</ul></div>
              )}
              <Card title={current.title}>
                <form action={saveSectionAction.bind(null, projectId, current.id)}>
                  <div className="grid cols-4"><Field label="Título" name="title" defaultValue={current.title} required />
                    <Field label="Status" name="status"><Select name="status" defaultValue={current.status} options={STATUS.map(([value, label]) => ({ value, label }))} /></Field>
                    <Field label="Meta de palavras" name="word_target" type="number" defaultValue={current.word_target} /></div>
                  <Field label="Texto (Markdown). Citações aparecem como [@cite:…]" name="content" rows={18} defaultValue={current.content} />
                  <Submit>Salvar seção</Submit> <span className="muted small">Cada salvamento fica no histórico.</span>
                </form>
              </Card>
              <Card title="Pré-visualização com citações ABNT"><div className="prose">{view.rendered || <Empty>Sem texto.</Empty>}</div></Card>
              <div className="grid cols-2">
                <Card title="Citar artigo">
                  <form action={addCitationAction.bind(null, projectId, current.id)}>
                    <Field label="Artigo / passagem" name="source"><Select name="source" required empty="Escolha…" options={[
                      ...articles.map((a) => ({ value: `${a.id}|`, label: `${a.authors[0]?.family ?? a.title.slice(0, 30)} (${a.year ?? 's.d.'}) — artigo` })),
                      ...((passages.data ?? []) as { id: string; article_id: string; page_number: number | null; quote: string }[]).map((p) => ({ value: `${p.article_id}|${p.id}`, label: `p.${p.page_number ?? '?'}: “${p.quote.slice(0, 50)}”` }))
                    ]} /></Field>
                    <Field label="Localizador (ex.: p. 12)" name="locator" /><Submit>Inserir citação</Submit>
                  </form>
                  <p className="muted small">O marcador é adicionado ao fim do texto; mova-o para o ponto desejado.</p>
                </Card>
                <Card title="Afirmações que sustentam esta seção">
                  {view.claims.length === 0 ? <Empty>Nenhuma vinculada.</Empty> : <ul className="list">{view.claims.map((c) => <li key={c.id}>{c.text} <Badge tone={c.status === 'supported' ? 'ok' : 'warn'}>{c.status}</Badge></li>)}</ul>}
                  <form action={attachClaimAction.bind(null, projectId, current.id)}>
                    <Field label="Vincular afirmação" name="claim_id"><Select name="claim_id" required empty="Escolha…" options={claims.map((c) => ({ value: c.id, label: c.text.slice(0, 70) }))} /></Field><Submit>Vincular</Submit>
                  </form>
                </Card>
              </div>
              <p className="small"><Link className="link" href={`/p/${projectId}/trace/section/${current.id}`}>Ver cadeia de rastreabilidade desta seção →</Link></p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
