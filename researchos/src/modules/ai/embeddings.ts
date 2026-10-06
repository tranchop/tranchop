import { embeddingsConfigured } from '@/lib/env';

export const EMBEDDING_DIMS = 1536; // deve casar com vector(1536) no banco

/** Gera embeddings via endpoint compatível com /v1/embeddings. Retorna null se não configurado. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!embeddingsConfigured() || texts.length === 0) return null;
  const res = await fetch(process.env.EMBEDDINGS_API_URL || 'https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.EMBEDDINGS_API_KEY}` },
    body: JSON.stringify({ model: process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small', input: texts })
  });
  if (!res.ok) throw new Error(`Falha ao gerar embeddings (${res.status})`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const out = json.data.map((d) => d.embedding);
  if (out.some((v) => v.length !== EMBEDDING_DIMS)) {
    throw new Error(`Embeddings com dimensão diferente de ${EMBEDDING_DIMS}; ajuste o modelo ou a coluna vector.`);
  }
  return out;
}

/** pgvector aceita o literal '[0.1,0.2,...]'. */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;
