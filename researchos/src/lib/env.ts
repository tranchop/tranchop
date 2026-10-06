export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name} (veja .env.example)`);
  return v;
}

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const embeddingsConfigured = () => Boolean(process.env.EMBEDDINGS_API_KEY);
