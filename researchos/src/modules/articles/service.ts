import type { Db } from '@/lib/types';
import { chunkPages } from './chunker';
import { extractPdf } from './pdf';
import { extractDois, quoteInSource } from '@/modules/ai/guardrails';
import { embed, toPgVector } from '@/modules/ai/embeddings';

export interface Article {
  id: string;
  project_id: string;
  title: string;
  authors: { family: string; given?: string }[];
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
  reading_status: 'to_read' | 'reading' | 'read' | 'fichado';
  metadata_origin: string;
  metadata_verified: boolean;
  created_at: string;
}

const MAX_PDF_BYTES = 40 * 1024 * 1024;

export async function listArticles(db: Db, projectId: string): Promise<Article[]> {
  const { data, error } = await db.from('articles').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Article[];
}

export async function getArticle(db: Db, id: string) {
  const { data, error } = await db.from('articles').select('*, article_files(*), passages(*)').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data as Article & { article_files: Record<string, any>[]; passages: Record<string, any>[] };
}

export async function createArticle(
  db: Db,
  projectId: string,
  input: { title: string; authors?: string; year?: number | null; journal?: string | null; doi?: string | null; abstract?: string | null }
): Promise<string> {
  const { data, error } = await db
    .from('articles')
    .insert({
      project_id: projectId,
      title: input.title,
      authors: parseAuthors(input.authors ?? ''),
      year: input.year ?? null,
      journal: input.journal ?? null,
      doi: normalizeDoi(input.doi),
      abstract: input.abstract ?? null,
      metadata_origin: 'researcher',
      metadata_verified: true // digitado pelo pesquisador
    })
    .select('id')
    .single();
  if (error) throw new Error(error.code === '23505' ? 'Já existe um artigo com esse DOI neste projeto.' : error.message);
  return data.id as string;
}

/** "Silva, Ana; Souza, B." → [{family, given}] */
export function parseAuthors(s: string): { family: string; given?: string }[] {
  return s
    .split(/;|\n/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const [family, given] = a.split(',').map((x) => x.trim());
      return given ? { family, given } : { family };
    });
}

export function normalizeDoi(doi?: string | null): string | null {
  if (!doi) return null;
  const m = doi.trim().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].toLowerCase() : null;
}

/** Importa PDF: cria o artigo (título provisório = nome do arquivo), guarda no Storage e indexa texto. */
export async function importPdf(db: Db, projectId: string, file: { name: string; bytes: Uint8Array }, articleId?: string) {
  if (file.bytes.byteLength > MAX_PDF_BYTES) throw new Error('PDF acima de 40 MB.');
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Envie um arquivo .pdf.');

  const extracted = await extractPdf(file.bytes);
  const { data: dup } = await db.from('article_files').select('article_id').eq('project_id', projectId).eq('sha256', extracted.sha256).maybeSingle();
  if (dup) throw new Error('Este PDF já foi importado neste projeto.');

  let id = articleId;
  if (!id) {
    const { data, error } = await db
      .from('articles')
      .insert({ project_id: projectId, title: file.name.replace(/\.pdf$/i, ''), metadata_origin: 'researcher', metadata_verified: false })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id as string;
  }

  const fileId = crypto.randomUUID();
  const path = `${projectId}/${id}/${fileId}.pdf`;
  const up = await db.storage.from('papers').upload(path, file.bytes, { contentType: 'application/pdf' });
  if (up.error) throw new Error(`Falha no upload: ${up.error.message}`);

  const hasText = extracted.pages.some((p) => p.trim().length > 40);
  const { error: fErr } = await db.from('article_files').insert({
    id: fileId,
    project_id: projectId,
    article_id: id,
    storage_path: path,
    original_name: file.name,
    sha256: extracted.sha256,
    size_bytes: file.bytes.byteLength,
    page_count: extracted.pageCount,
    extraction_status: hasText ? 'done' : 'no_text'
  });
  if (fErr) throw new Error(fErr.message);

  if (hasText) {
    const pageRows = extracted.pages.map((text, i) => ({ project_id: projectId, article_id: id, file_id: fileId, page_number: i + 1, text }));
    const { error: pErr } = await db.from('article_pages').insert(pageRows);
    if (pErr) throw new Error(pErr.message);

    const chunks = chunkPages(extracted.pages).map((c) => ({
      project_id: projectId, article_id: id, file_id: fileId, page_number: c.pageNumber, chunk_index: c.chunkIndex, content: c.content
    }));
    const { data: inserted, error: cErr } = await db.from('article_chunks').insert(chunks).select('id, content');
    if (cErr) throw new Error(cErr.message);
    await embedChunks(db, (inserted ?? []) as { id: string; content: string }[]);

    // DOI: somente se aparece literalmente no PDF, e só preenche se o artigo ainda não tem
    const dois = extractDois(extracted.pages.slice(0, 2).join('\n'));
    if (dois.length === 1) {
      await db.from('articles').update({ doi: dois[0], metadata_origin: 'source_extracted' }).eq('id', id).is('doi', null);
    }
  }
  return { articleId: id!, fileId, extraction: hasText ? 'done' : 'no_text', pages: extracted.pageCount };
}

/** Embeddings são opcionais; falha aqui não invalida a importação (busca textual segue funcionando). */
async function embedChunks(db: Db, rows: { id: string; content: string }[]) {
  try {
    for (let i = 0; i < rows.length; i += 64) {
      const batch = rows.slice(i, i + 64);
      const vectors = await embed(batch.map((r) => r.content));
      if (!vectors) return;
      await Promise.all(batch.map((r, j) => db.from('article_chunks').update({ embedding: toPgVector(vectors[j]) }).eq('id', r.id)));
    }
  } catch (e) {
    console.error('[embeddings]', e);
  }
}

export async function signedPdfUrl(db: Db, storagePath: string, page?: number): Promise<string> {
  const { data, error } = await db.storage.from('papers').createSignedUrl(storagePath, 3600);
  if (error) throw new Error(error.message);
  return page ? `${data.signedUrl}#page=${page}` : data.signedUrl;
}

/** Cria passagem (âncora de rastreabilidade). `verified_in_source` é calculado no servidor, nunca informado. */
export async function addPassage(
  db: Db,
  projectId: string,
  input: { articleId: string; pageNumber: number | null; section?: string | null; quote: string; note?: string | null }
): Promise<string> {
  let q = db.from('article_pages').select('text').eq('article_id', input.articleId);
  if (input.pageNumber) q = q.eq('page_number', input.pageNumber);
  const { data: pages } = await q;
  const verified = (pages ?? []).some((p: { text: string }) => quoteInSource(input.quote, p.text));
  const { data, error } = await db
    .from('passages')
    .insert({
      project_id: projectId,
      article_id: input.articleId,
      page_number: input.pageNumber,
      section: input.section ?? null,
      quote: input.quote,
      note: input.note ?? null,
      verified_in_source: verified,
      origin: 'researcher'
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateReadingStatus(db: Db, articleId: string, status: Article['reading_status']) {
  const { error } = await db.from('articles').update({ reading_status: status }).eq('id', articleId);
  if (error) throw new Error(error.message);
}

export async function confirmMetadata(
  db: Db,
  articleId: string,
  input: { title: string; authors: string; year: number | null; journal: string | null; doi: string | null; abstract: string | null }
) {
  const { error } = await db
    .from('articles')
    .update({
      title: input.title,
      authors: parseAuthors(input.authors),
      year: input.year,
      journal: input.journal,
      doi: normalizeDoi(input.doi),
      abstract: input.abstract,
      metadata_origin: 'researcher',
      metadata_verified: true
    })
    .eq('id', articleId);
  if (error) throw new Error(error.code === '23505' ? 'Já existe um artigo com esse DOI neste projeto.' : error.message);
}
