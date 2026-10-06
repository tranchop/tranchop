# ResearchOS

Gestão de conhecimento, pesquisa e escrita científica — **Artigos → PDFs → Fichamentos → Conceitos → Ideias → Hipóteses → Experimentos → Resultados → Evidências → Dissertação**, com rastreabilidade e proveniência em cada passo.

Arquitetura, modelo de dados e regras de integridade: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js (App Router) + TypeScript · Supabase (PostgreSQL + RLS, Auth, Storage) · pgvector · IA via servidor (Anthropic).

## Rodando

```bash
cd researchos
cp .env.example .env.local        # preencha as chaves
npm install

# Banco (Supabase CLI): aplica supabase/migrations/*.sql
supabase link --project-ref <ref> && supabase db push

npm run dev
```

No Supabase, habilite a extensão `vector` (já criada pela migração 0001) e confirme que os buckets privados `papers` e `lab-data` existem (a migração 0003 os cria).

Sem `ANTHROPIC_API_KEY` o sistema funciona normalmente, exceto o fichamento por IA e o assistente. Sem `EMBEDDINGS_API_KEY` a busca é só textual.

## Testes

```bash
npm test            # guardrails de IA, chunking, ABNT, busca, histórico, validação do assistente
npm run typecheck
npm run db:test     # requer Postgres local com pgvector: aplica migrações e roda 35 verificações (RLS, imutabilidade, regras científicas)
```

`db:test` usa `PSQL` e `DB` do ambiente (ex.: `PSQL="psql -U postgres" npm run db:test`).

## Fluxo principal do MVP

1. Crie um projeto, cadastre objetivos e hipóteses.
2. **Biblioteca** → importe um PDF → confirme os metadados.
3. **Gerar rascunho com IA** → revise campo a campo (cada um mostra origem, trecho literal e página) → aprove.
4. Registre **passagens**, **conhecimento** (ideias, lacunas…) e **afirmações com evidências**.
5. Crie **experimentos** ligados a hipóteses; envie dados brutos → processados → interpretação → resultado.
6. Escreva a **dissertação**, insira citações e acompanhe os alertas de rigor; exporte em Markdown/ABNT.
7. Use **Busca**, **Assistente** e **Rastreabilidade** para voltar de qualquer afirmação à página do PDF.
