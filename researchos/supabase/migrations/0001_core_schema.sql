-- ResearchOS — núcleo do modelo de dados
-- PostgreSQL é a fonte de verdade. Todo registro científico pertence a um projeto
-- (project_id denormalizado em todas as tabelas para RLS simples e barato).

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Tipos transversais: proveniência e revisão humana
-- ---------------------------------------------------------------------------
-- Origem de toda informação relevante:
--   source_extracted : extraída literalmente da fonte (com localizador)
--   ai_inferred      : inferida pela IA a partir da fonte (precisa de revisão)
--   ai_suggested     : sugestão da IA (não decorre diretamente da fonte)
--   researcher       : escrita/adicionada pelo pesquisador
create type origin as enum ('source_extracted', 'ai_inferred', 'ai_suggested', 'researcher');
create type review_status as enum ('draft', 'approved', 'rejected');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe strict as
$$ select public.unaccent('public.unaccent', $1) $$;

-- ---------------------------------------------------------------------------
-- Tenancy: perfis, projetos, membros
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- perfis de usuários já existentes (migração aplicada depois de haver contas)
insert into profiles (id, display_name) select id, split_part(email, '@', 1) from auth.users on conflict do nothing;

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  institution text,
  program text,
  advisor text,
  start_date date,
  end_date date,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade, -- via profiles para o PostgREST embutir display_name
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index on project_members (user_id);

-- ---------------------------------------------------------------------------
-- IA: toda geração fica registrada (contexto, modelo, revisão humana)
-- ---------------------------------------------------------------------------
create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id),
  purpose text not null check (purpose in ('fichamento', 'assistant_answer', 'link_suggestion', 'section_assist', 'other')),
  provider text not null,
  model text not null,
  model_params jsonb not null default '{}',
  context_scope text not null check (context_scope in ('source', 'library', 'project', 'dissertation', 'system')),
  context_refs jsonb not null default '{}',        -- ex.: {"article_ids": [...], "section_id": "..."}
  retrieved_chunk_ids uuid[] not null default '{}', -- trechos efetivamente enviados ao modelo
  prompt text,
  output jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'insufficient_context')),
  error text,
  tokens_in int,
  tokens_out int,
  review_status review_status not null default 'draft',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on ai_generations (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Moldura da pesquisa: objetivos e hipóteses
-- ---------------------------------------------------------------------------
create table objectives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null default 'specific' check (kind in ('general', 'specific')),
  title text not null,
  description text,
  position int not null default 0,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hypotheses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  objective_id uuid references objectives(id) on delete set null,
  statement text not null,
  rationale text,
  status text not null default 'proposed' check (status in ('proposed', 'testing', 'supported', 'refuted', 'inconclusive')),
  origin origin not null default 'researcher',
  review_status review_status not null default 'approved',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Biblioteca: artigos, PDFs, páginas, trechos
-- ---------------------------------------------------------------------------
create table articles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  authors jsonb not null default '[]',      -- [{"family": "...", "given": "..."}]
  year int,
  journal text,
  volume text,
  issue text,
  pages text,
  publisher text,
  doi text,                                  -- NUNCA gerado por IA: só extraído do PDF ou digitado
  url text,
  abstract text,
  language text,
  keywords text[] not null default '{}',
  reading_status text not null default 'to_read' check (reading_status in ('to_read', 'reading', 'read', 'fichado')),
  metadata_origin origin not null default 'researcher',
  metadata_verified boolean not null default false, -- pesquisador confirmou os metadados
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index articles_project_doi_uq on articles (project_id, lower(doi)) where doi is not null;

create table article_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  storage_path text not null,               -- {project_id}/{article_id}/{file_id}.pdf no bucket "papers"
  original_name text,
  sha256 text,
  size_bytes bigint,
  page_count int,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'done', 'failed', 'no_text')),
  extraction_error text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (project_id, sha256)
);
create index on article_files (article_id);

create table article_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  file_id uuid not null references article_files(id) on delete cascade,
  page_number int not null,
  text text not null,
  unique (file_id, page_number)
);
create index on article_pages (article_id);

create table article_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  file_id uuid references article_files(id) on delete cascade,
  page_number int not null,                 -- localizador: página de origem
  section text,
  chunk_index int not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('simple', public.f_unaccent(content))) stored,
  embedding vector(1536),                   -- preenchido por job; dimensão = modelo de embeddings configurado
  unique (file_id, chunk_index)
);
create index on article_chunks (article_id);
create index article_chunks_tsv_idx on article_chunks using gin (tsv);
create index article_chunks_embedding_idx on article_chunks using hnsw (embedding vector_cosine_ops);

-- Âncora de rastreabilidade: um trecho literal de um artigo (página/seção).
-- Citações, evidências e fichamentos apontam para passagens, nunca para "o artigo" genérico.
create table passages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  article_id uuid not null references articles(id) on delete cascade,
  page_number int,
  section text,
  quote text not null,
  note text,
  verified_in_source boolean not null default false, -- quote confere literalmente com article_pages
  origin origin not null default 'researcher',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on passages (article_id);

-- ---------------------------------------------------------------------------
-- Fichamento: rascunho da IA, revisado e aprovado pelo pesquisador
-- ---------------------------------------------------------------------------
create table fichamentos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  article_id uuid not null unique references articles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  ai_generation_id uuid references ai_generations(id) on delete set null,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fichamento_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  fichamento_id uuid not null references fichamentos(id) on delete cascade,
  field_key text not null check (field_key in
    ('reference', 'objective', 'hypothesis', 'methodology', 'results', 'conclusion', 'limitations', 'relevance', 'key_info')),
  position int not null default 0,
  content text not null,
  origin origin not null,
  review_status review_status not null default 'draft',
  passage_id uuid references passages(id) on delete set null, -- onde na fonte
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fichamento_id, field_key, position),
  -- campo "extraído da fonte" exige localizador
  check (origin <> 'source_extracted' or passage_id is not null)
);

-- ---------------------------------------------------------------------------
-- Conhecimento: conceitos, ideias, perguntas, citações, lacunas, contradições
-- ---------------------------------------------------------------------------
create table knowledge_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in ('concept', 'idea', 'question', 'quote', 'gap', 'contradiction')),
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'active', 'resolved', 'archived')),
  tags text[] not null default '{}',
  passage_id uuid references passages(id) on delete set null,
  origin origin not null default 'researcher',
  review_status review_status not null default 'approved',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on knowledge_items (project_id, kind);

-- ---------------------------------------------------------------------------
-- Experimentos
-- ---------------------------------------------------------------------------
create table protocols (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  objective text,
  current_version int not null default 0,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- versões de protocolo são imutáveis (ver 0002): mudar protocolo = nova versão
create table protocol_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  protocol_id uuid not null references protocols(id) on delete cascade,
  version int not null,
  body text not null,
  change_note text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (protocol_id, version)
);

create table experiments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text,
  title text not null,
  hypothesis_id uuid references hypotheses(id) on delete set null,
  protocol_version_id uuid references protocol_versions(id) on delete set null,
  design text,
  status text not null default 'planned' check (status in ('planned', 'running', 'analysis', 'done', 'aborted')),
  started_on date,
  ended_on date,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table experiment_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  experiment_id uuid not null references experiments(id) on delete cascade,
  name text not null,
  description text,
  treatment text,
  n int,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Camadas de dados: raw → processed. Raw é imutável (trigger em 0002).
create table datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  experiment_id uuid not null references experiments(id),  -- sem cascade: dado não some junto com o experimento
  group_id uuid references experiment_groups(id) on delete set null,
  layer text not null check (layer in ('raw', 'processed')),
  name text not null,
  storage_path text not null,               -- bucket "lab-data"
  sha256 text not null,
  size_bytes bigint,
  derived_from uuid references datasets(id) on delete restrict,
  processing_method text,                   -- descrição/script/versão usada para derivar
  processing_params jsonb,
  notes text,
  archived_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check ((layer = 'raw' and derived_from is null) or (layer = 'processed' and derived_from is not null))
);
create index on datasets (experiment_id);

create table interpretations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  experiment_id uuid not null references experiments(id) on delete cascade,
  dataset_id uuid references datasets(id) on delete set null,   -- normalmente um dataset processed
  body text not null,
  origin origin not null default 'researcher',
  review_status review_status not null default 'draft',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  experiment_id uuid not null references experiments(id) on delete cascade,
  group_id uuid references experiment_groups(id) on delete set null,
  interpretation_id uuid references interpretations(id) on delete set null,
  statement text not null,
  metric text,
  value numeric,
  unit text,
  stat_test text,
  p_value numeric,
  status text not null default 'preliminary' check (status in ('preliminary', 'final')),
  origin origin not null default 'researcher',
  review_status review_status not null default 'draft',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- números só podem vir do pesquisador ou de dado processado, nunca da IA
  check ((value is null and p_value is null) or origin in ('researcher', 'source_extracted')),
  -- resultado final: interpretado e aprovado por humano
  check (status <> 'final' or (interpretation_id is not null and review_status = 'approved'))
);

-- ---------------------------------------------------------------------------
-- Afirmações e evidências
-- ---------------------------------------------------------------------------
create table claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  text text not null,
  kind text not null default 'literature' check (kind in ('literature', 'own_finding', 'interpretation')),
  status text not null default 'unsupported' check (status in ('unsupported', 'supported', 'contested')),
  origin origin not null default 'researcher',
  review_status review_status not null default 'approved',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Afirmação → Evidência → (Passagem → Artigo → PDF/página) | (Resultado → Experimento)
create table evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  stance text not null default 'supports' check (stance in ('supports', 'contradicts', 'context')),
  passage_id uuid references passages(id) on delete cascade,
  result_id uuid references results(id) on delete cascade,
  strength text check (strength in ('weak', 'moderate', 'strong')),
  note text,
  origin origin not null default 'researcher',
  review_status review_status not null default 'approved',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(passage_id, result_id) = 1)
);
create index on evidence (claim_id);

-- ---------------------------------------------------------------------------
-- Caderno de laboratório e reagentes
-- ---------------------------------------------------------------------------
create table notebook_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  experiment_id uuid references experiments(id) on delete set null,
  amends_id uuid references notebook_entries(id) on delete set null,
  entry_date date not null default current_date,
  title text not null,
  body text not null default '',
  signed_at timestamptz,                    -- após assinar, conteúdo é imutável (0002)
  signed_by uuid references auth.users(id),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reagents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  catalog_number text,
  supplier text,
  cas_number text,
  storage_conditions text,
  notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reagent_lots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  reagent_id uuid not null references reagents(id) on delete cascade,
  lot_number text not null,
  received_on date,
  expires_on date,
  quantity numeric,
  unit text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table experiment_reagents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  experiment_id uuid not null references experiments(id) on delete cascade,
  reagent_id uuid not null references reagents(id) on delete restrict,
  lot_id uuid references reagent_lots(id) on delete set null,
  amount numeric,
  unit text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tarefas, reuniões, decisões
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'cancelled')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  assignee_id uuid references auth.users(id),
  completed_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tasks (project_id, status, due_date);

create table meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  participants text[] not null default '{}',
  agenda text,
  notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete set null,
  supersedes_id uuid references decisions(id) on delete set null,
  title text not null,
  rationale text,
  decided_on date not null default current_date,
  status text not null default 'active' check (status in ('active', 'superseded', 'reverted')),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Escrita: dissertação, seções, citações
-- ---------------------------------------------------------------------------
create table documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  kind text not null default 'dissertation' check (kind in ('dissertation', 'article', 'report')),
  citation_style text not null default 'abnt',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  parent_id uuid references sections(id) on delete cascade,
  position int not null default 0,
  title text not null,
  content text not null default '',         -- markdown; marcadores [@cite:<citation_id>] e [[claim:<id>]]
  status text not null default 'outline' check (status in ('outline', 'drafting', 'review', 'final')),
  word_target int,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on sections (document_id, parent_id, position);

-- quais afirmações sustentam qual seção
create table section_claims (
  project_id uuid not null references projects(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (section_id, claim_id)
);

-- citação concreta numa seção: artigo (+ passagem/página) → gera referência ABNT
create table citations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  article_id uuid not null references articles(id) on delete restrict,
  passage_id uuid references passages(id) on delete set null,
  claim_id uuid references claims(id) on delete set null,
  locator text,                             -- ex.: "p. 12"
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index on citations (section_id);
create index on citations (article_id);

-- ---------------------------------------------------------------------------
-- Relações livres entre quaisquer nós (alimenta rastreabilidade e grafo)
-- ---------------------------------------------------------------------------
create table links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  src_type text not null,
  src_id uuid not null,
  dst_type text not null,
  dst_id uuid not null,
  relation text not null check (relation in
    ('inspired_by', 'derived_from', 'supports', 'contradicts', 'tests', 'explains',
     'answers', 'cites', 'used_in', 'related_to')),
  note text,
  origin origin not null default 'researcher',
  review_status review_status not null default 'approved',
  ai_generation_id uuid references ai_generations(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (src_type, src_id, dst_type, dst_id, relation),
  check (src_id <> dst_id or src_type <> dst_type)
);
create index on links (project_id, src_type, src_id);
create index on links (project_id, dst_type, dst_id);

-- ---------------------------------------------------------------------------
-- Histórico e busca
-- ---------------------------------------------------------------------------
create table change_log (
  id bigint generated always as identity primary key,
  project_id uuid,
  table_name text not null,
  row_id uuid,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index on change_log (project_id, changed_at desc);
create index on change_log (table_name, row_id, changed_at desc);

create table search_index (
  project_id uuid not null references projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  title text,
  body text,
  tsv tsvector generated always as (
    setweight(to_tsvector('simple', public.f_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.f_unaccent(coalesce(body, ''))), 'B')
  ) stored,
  embedding vector(1536),
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
create index on search_index (project_id);
create index search_index_tsv_idx on search_index using gin (tsv);
create index search_index_embedding_idx on search_index using hnsw (embedding vector_cosine_ops);

-- updated_at automático
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'updated_at'
      and c.table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')
      and c.table_name <> 'search_index'
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
