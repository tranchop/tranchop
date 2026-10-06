import Link from 'next/link';
import { Badge, Card, Empty, Field, PageHeader, Provenance, Select, Submit } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { addEvidenceAction, createClaimAction, removeEvidenceAction } from '@/modules/evidence/actions';
import { listClaims, listFinalResults, listPassages } from '@/modules/evidence/service';

const STATUS_TONE = { unsupported: 'bad', supported: 'ok', contested: 'warn' } as const;
const STATUS_LABEL = { unsupported: 'sem evidência', supported: 'sustentada', contested: 'contestada' } as const;
const STANCE = { supports: 'sustenta', contradicts: 'contradiz', context: 'contexto' } as const;

export default async function EvidencePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db } = await requireUser();
  const [claims, passages, results] = await Promise.all([listClaims(db, projectId), listPassages(db, projectId), listFinalResults(db, projectId)]);
  const sources = [
    ...passages.map((p) => ({ value: `passage:${p.id}`, label: `[Artigo] ${p.articles.title.slice(0, 35)} p.${p.page_number ?? '?'}: ${p.quote.slice(0, 50)}` })),
    ...results.map((r) => ({ value: `result:${r.id}`, label: `[Resultado ${r.status === 'final' ? 'final' : 'prelim.'}] ${r.experiments.title.slice(0, 25)}: ${r.statement.slice(0, 50)}` }))
  ];
  return (
    <>
      <PageHeader title="Afirmações e evidências" subtitle="Afirmação → evidência → passagem (artigo, página) ou resultado (experimento). O status é calculado pelo banco." />
      <Card title="Nova afirmação">
        <form action={createClaimAction.bind(null, projectId)}>
          <Field label="Afirmação" name="text" rows={2} required />
          <Field label="Tipo" name="kind"><Select name="kind" options={[{ value: 'literature', label: 'Da literatura' }, { value: 'own_finding', label: 'Achado próprio' }, { value: 'interpretation', label: 'Interpretação' }]} /></Field>
          <Submit>Criar</Submit>
        </form>
      </Card>
      {claims.length === 0 ? <Empty>Nenhuma afirmação ainda.</Empty> : claims.map((c) => (
        <Card key={c.id} id={`c-${c.id}`}>
          <div className="row"><Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge><Provenance origin={c.origin} review={c.review_status} /><Link className="link small" href={`/p/${projectId}/trace/claim/${c.id}`}>rastrear →</Link></div>
          <p className="prose">{c.text}</p>
          {c.evidence.length === 0 ? <Empty>Sem evidências — não use esta afirmação na dissertação sem sustentação.</Empty> : (
            <ul className="list">{c.evidence.map((e) => (
              <li key={e.id}>
                <div className="row"><Badge tone={e.stance === 'supports' ? 'ok' : e.stance === 'contradicts' ? 'bad' : 'neutral'}>{STANCE[e.stance]}</Badge>{e.strength && <Badge>{e.strength}</Badge>}
                  <form action={removeEvidenceAction.bind(null, projectId, e.id)}><button className="btn btn-ghost small">remover</button></form></div>
                {e.passages && <blockquote className="quote">“{e.passages.quote}” <span className="small">— <Link className="link" href={`/p/${projectId}/articles/${e.passages.article_id}`}>{e.passages.articles.title}</Link>{e.passages.articles.year ? ` (${e.passages.articles.year})` : ''}, p. {e.passages.page_number ?? '—'} {e.passages.verified_in_source ? <Badge tone="ok">literal no PDF</Badge> : <Badge tone="warn">não verificada</Badge>}</span></blockquote>}
                {e.results && <p>Resultado: <Link className="link" href={`/p/${projectId}/experiments/${e.results.experiment_id}`}>{e.results.statement}</Link></p>}
                {e.note && <div className="muted">{e.note}</div>}
              </li>))}
            </ul>
          )}
          <details><summary>Adicionar evidência</summary>
            <form action={addEvidenceAction.bind(null, projectId, c.id)}>
              <Field label="Fonte" name="source"><Select name="source" required empty="Escolha uma passagem ou resultado…" options={sources} /></Field>
              <div className="grid cols-2">
                <Field label="Relação" name="stance"><Select name="stance" options={Object.entries(STANCE).map(([value, label]) => ({ value, label }))} /></Field>
                <Field label="Força" name="strength"><Select name="strength" empty="—" options={['weak', 'moderate', 'strong'].map((v) => ({ value: v, label: v }))} /></Field>
              </div>
              <Field label="Nota" name="note" /><Submit>Adicionar</Submit>
            </form>
          </details>
        </Card>
      ))}
    </>
  );
}
