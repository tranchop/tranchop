-- ResearchOS — RLS, integridade científica, histórico, busca e rastreabilidade

-- ---------------------------------------------------------------------------
-- Funções de autorização (SECURITY DEFINER evita recursão de RLS em project_members)
-- ---------------------------------------------------------------------------
create or replace function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid())
$$;

create or replace function public.can_edit(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members
                 where project_id = pid and user_id = auth.uid() and role in ('owner', 'editor'))
$$;

create or replace function public.is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members
                 where project_id = pid and user_id = auth.uid() and role = 'owner')
$$;

-- criador do projeto vira owner
create or replace function public.add_creator_as_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger projects_add_owner after insert on projects
  for each row execute function public.add_creator_as_owner();

-- perfil automático no signup (auth.users)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- owner convida por e-mail (precisa ler auth.users, por isso SECURITY DEFINER)
create or replace function public.add_member_by_email(p_project uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_owner(p_project) then raise exception 'apenas owner pode gerenciar membros' using errcode = '42501'; end if;
  if p_role not in ('editor', 'viewer', 'owner') then raise exception 'papel inválido'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'usuário não encontrado: o convidado precisa criar conta primeiro'; end if;
  insert into project_members (project_id, user_id, role) values (p_project, uid, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (id = auth.uid() or exists (
    select 1 from project_members a join project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

alter table projects enable row level security;
create policy projects_select on projects for select using (created_by = auth.uid() or is_member(id));
create policy projects_insert on projects for insert with check (created_by = auth.uid());
create policy projects_update on projects for update using (is_owner(id)) with check (is_owner(id));
create policy projects_delete on projects for delete using (is_owner(id));

alter table project_members enable row level security;
create policy members_select on project_members for select using (is_member(project_id));
create policy members_write on project_members for all using (is_owner(project_id)) with check (is_owner(project_id));

-- logs: leitura por membros, escrita só por triggers/serviço
alter table change_log enable row level security;
create policy change_log_select on change_log for select using (project_id is not null and is_member(project_id));
alter table search_index enable row level security;
create policy search_index_select on search_index for select using (is_member(project_id));

alter table ai_generations enable row level security;
create policy ai_gen_select on ai_generations for select using (is_member(project_id));
create policy ai_gen_insert on ai_generations for insert with check (can_edit(project_id) and user_id = auth.uid());
create policy ai_gen_update on ai_generations for update using (can_edit(project_id)) with check (can_edit(project_id));

-- demais tabelas: membros leem, owner/editor escrevem
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'project_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('project_members', 'change_log', 'search_index', 'ai_generations')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (is_member(project_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (can_edit(project_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (can_edit(project_id)) with check (can_edit(project_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (can_edit(project_id))', t || '_delete', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Integridade: referências nunca cruzam projetos
-- ---------------------------------------------------------------------------
create or replace function public.enforce_same_project() returns trigger
language plpgsql as $$
declare a text; col text; tbl text; ref uuid; pid uuid; j jsonb := to_jsonb(new);
begin
  foreach a in array tg_argv loop
    col := split_part(a, ':', 1);
    tbl := split_part(a, ':', 2);
    ref := nullif(j ->> col, '')::uuid;
    if ref is null then continue; end if;
    execute format('select project_id from public.%I where id = $1', tbl) into pid using ref;
    if pid is distinct from new.project_id then
      raise exception 'referência inválida: %.% aponta para outro projeto ou registro inexistente', tg_table_name, col
        using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

do $$
declare
  cfg jsonb := '{
    "hypotheses":        ["objective_id:objectives", "ai_generation_id:ai_generations"],
    "article_files":     ["article_id:articles"],
    "article_pages":     ["article_id:articles", "file_id:article_files"],
    "article_chunks":    ["article_id:articles"],
    "passages":          ["article_id:articles"],
    "fichamentos":       ["article_id:articles", "ai_generation_id:ai_generations"],
    "fichamento_fields": ["fichamento_id:fichamentos", "passage_id:passages", "ai_generation_id:ai_generations"],
    "knowledge_items":   ["passage_id:passages", "ai_generation_id:ai_generations"],
    "protocol_versions": ["protocol_id:protocols"],
    "experiments":       ["hypothesis_id:hypotheses", "protocol_version_id:protocol_versions"],
    "experiment_groups": ["experiment_id:experiments"],
    "datasets":          ["experiment_id:experiments", "group_id:experiment_groups", "derived_from:datasets"],
    "interpretations":   ["experiment_id:experiments", "dataset_id:datasets", "ai_generation_id:ai_generations"],
    "results":           ["experiment_id:experiments", "group_id:experiment_groups", "interpretation_id:interpretations"],
    "claims":            ["ai_generation_id:ai_generations"],
    "evidence":          ["claim_id:claims", "passage_id:passages", "result_id:results", "ai_generation_id:ai_generations"],
    "notebook_entries":  ["experiment_id:experiments", "amends_id:notebook_entries"],
    "reagent_lots":      ["reagent_id:reagents"],
    "experiment_reagents": ["experiment_id:experiments", "reagent_id:reagents", "lot_id:reagent_lots"],
    "decisions":         ["meeting_id:meetings", "supersedes_id:decisions"],
    "sections":          ["document_id:documents", "parent_id:sections"],
    "section_claims":    ["section_id:sections", "claim_id:claims"],
    "citations":         ["section_id:sections", "article_id:articles", "passage_id:passages", "claim_id:claims"],
    "links":             ["ai_generation_id:ai_generations"]
  }';
  t text; args text;
begin
  for t in select jsonb_object_keys(cfg) loop
    select string_agg(quote_literal(x), ', ') into args from jsonb_array_elements_text(cfg -> t) x;
    execute format('create trigger enforce_same_project before insert or update on public.%I
                    for each row execute function public.enforce_same_project(%s)', t, args);
  end loop;
end $$;

-- citação: a passagem tem que ser do artigo citado
create or replace function public.check_citation_passage() returns trigger
language plpgsql as $$
begin
  if new.passage_id is not null and not exists
     (select 1 from passages where id = new.passage_id and article_id = new.article_id) then
    raise exception 'a passagem citada não pertence ao artigo citado' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger citation_passage_matches_article before insert or update on citations
  for each row execute function public.check_citation_passage();

-- ---------------------------------------------------------------------------
-- Links polimórficos: validar existência e projeto dos dois nós
-- ---------------------------------------------------------------------------
create or replace function public.node_table(t text) returns text
language sql immutable as $$
  select case t
    when 'article' then 'articles'          when 'passage' then 'passages'
    when 'fichamento' then 'fichamentos'    when 'knowledge_item' then 'knowledge_items'
    when 'claim' then 'claims'              when 'evidence' then 'evidence'
    when 'objective' then 'objectives'      when 'hypothesis' then 'hypotheses'
    when 'protocol' then 'protocols'        when 'experiment' then 'experiments'
    when 'dataset' then 'datasets'          when 'interpretation' then 'interpretations'
    when 'result' then 'results'            when 'notebook_entry' then 'notebook_entries'
    when 'reagent' then 'reagents'          when 'task' then 'tasks'
    when 'meeting' then 'meetings'          when 'decision' then 'decisions'
    when 'section' then 'sections'
  end
$$;

create or replace function public.validate_link() returns trigger
language plpgsql as $$
declare st text := node_table(new.src_type); dt text := node_table(new.dst_type); pid uuid;
begin
  if st is null or dt is null then
    raise exception 'tipo de nó inválido em links: % / %', new.src_type, new.dst_type using errcode = '23514';
  end if;
  execute format('select project_id from public.%I where id = $1', st) into pid using new.src_id;
  if pid is distinct from new.project_id then raise exception 'nó de origem inexistente ou de outro projeto' using errcode = '23514'; end if;
  execute format('select project_id from public.%I where id = $1', dt) into pid using new.dst_id;
  if pid is distinct from new.project_id then raise exception 'nó de destino inexistente ou de outro projeto' using errcode = '23514'; end if;
  return new;
end $$;
create trigger validate_link before insert or update on links
  for each row execute function public.validate_link();

-- ---------------------------------------------------------------------------
-- Regras científicas
-- ---------------------------------------------------------------------------
-- Dado bruto é imutável (conteúdo/identidade); só pode ser arquivado.
create or replace function public.protect_raw_dataset() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.layer = 'raw' then
    if (new.layer, new.storage_path, new.sha256, new.size_bytes, new.derived_from, new.experiment_id)
       is distinct from (old.layer, old.storage_path, old.sha256, old.size_bytes, old.derived_from, old.experiment_id) then
      raise exception 'dado bruto é imutável: envie um novo arquivo ou crie uma camada processada' using errcode = '23514';
    end if;
  elsif tg_op = 'DELETE' and old.layer = 'raw' and pg_trigger_depth() = 1 then
    raise exception 'dado bruto não pode ser apagado: use arquivamento (archived_at)' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger protect_raw_dataset before update or delete on datasets
  for each row execute function public.protect_raw_dataset();

-- Entrada de caderno assinada é imutável; correções entram como nova entrada (amends_id).
create or replace function public.protect_signed_entry() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.signed_at is not null then
    if (new.title, new.body, new.entry_date, new.experiment_id, new.signed_at, new.signed_by)
       is distinct from (old.title, old.body, old.entry_date, old.experiment_id, old.signed_at, old.signed_by) then
      raise exception 'entrada assinada é imutável: registre uma correção como nova entrada' using errcode = '23514';
    end if;
  elsif tg_op = 'DELETE' and old.signed_at is not null and pg_trigger_depth() = 1 then
    raise exception 'entrada assinada não pode ser apagada' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger protect_signed_entry before update or delete on notebook_entries
  for each row execute function public.protect_signed_entry();

-- Versões de protocolo: append-only; numeração automática; atualiza protocols.current_version
create or replace function public.protocol_version_insert() returns trigger
language plpgsql as $$
begin
  select coalesce(max(version), 0) + 1 into new.version from protocol_versions where protocol_id = new.protocol_id;
  return new;
end $$;
create trigger protocol_version_number before insert on protocol_versions
  for each row execute function public.protocol_version_insert();

create or replace function public.protocol_version_after() returns trigger
language plpgsql as $$
begin
  update protocols set current_version = new.version where id = new.protocol_id;
  return new;
end $$;
create trigger protocol_version_bump after insert on protocol_versions
  for each row execute function public.protocol_version_after();

create or replace function public.protect_protocol_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() = 1 then
    raise exception 'versões de protocolo são imutáveis: crie uma nova versão' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger protect_protocol_version before update or delete on protocol_versions
  for each row execute function public.protect_protocol_version();

-- Fichamento só é aprovado quando nenhum campo continua em rascunho.
create or replace function public.fichamento_approval_gate() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if exists (select 1 from fichamento_fields where fichamento_id = new.id and review_status = 'draft') then
      raise exception 'há campos do fichamento ainda não revisados' using errcode = '23514';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end $$;
create trigger fichamento_approval_gate before update on fichamentos
  for each row execute function public.fichamento_approval_gate();

-- Status da afirmação deriva das evidências aprovadas.
create or replace function public.refresh_claim_status(p_claim uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sup int; con int;
begin
  select count(*) filter (where stance = 'supports'), count(*) filter (where stance = 'contradicts')
    into sup, con from evidence where claim_id = p_claim and review_status = 'approved';
  update claims set status = case when sup > 0 and con > 0 then 'contested'
                                  when con > 0 then 'contested'
                                  when sup > 0 then 'supported'
                                  else 'unsupported' end
  where id = p_claim;
end $$;

create or replace function public.evidence_refresh_claim() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform refresh_claim_status(old.claim_id); end if;
  if tg_op in ('INSERT', 'UPDATE') then perform refresh_claim_status(new.claim_id); end if;
  return null;
end $$;
create trigger evidence_refresh_claim after insert or update or delete on evidence
  for each row execute function public.evidence_refresh_claim();

create or replace function public.task_completed_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then new.completed_at := now();
  elsif new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger task_completed_at before update on tasks
  for each row execute function public.task_completed_at();

-- ---------------------------------------------------------------------------
-- Histórico genérico (quem mudou o quê, com estado anterior e novo)
-- ---------------------------------------------------------------------------
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; pid uuid; rid uuid;
begin
  o := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  if tg_op = 'UPDATE' and o = n then return null; end if;
  pid := coalesce(n ->> 'project_id', o ->> 'project_id')::uuid;
  rid := coalesce(n ->> 'id', o ->> 'id')::uuid;
  if tg_table_name = 'projects' then pid := rid; end if;
  insert into change_log (project_id, table_name, row_id, op, old_data, new_data)
  values (pid, tg_table_name, rid, tg_op, o, n);
  return null;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and tb.table_type = 'BASE TABLE'
      and c.column_name = 'project_id'
      and c.table_name not in ('change_log', 'search_index', 'ai_generations', 'article_pages', 'article_chunks')
  loop
    execute format('create trigger log_change after insert or update or delete on public.%I
                    for each row execute function public.log_change()', t);
  end loop;
  create trigger log_change after insert or update or delete on projects
    for each row execute function public.log_change();
end $$;

-- ---------------------------------------------------------------------------
-- Índice de busca unificado (mantido por trigger)
-- ---------------------------------------------------------------------------
create or replace function public.index_entity() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; c text; b text := ''; ttl text; et text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    delete from search_index where entity_type = et and entity_id = old.id;
    return old;
  end if;
  j := to_jsonb(new);
  if j ->> 'review_status' = 'rejected' then
    delete from search_index where entity_type = et and entity_id = new.id;
    return new;
  end if;
  ttl := j ->> tg_argv[1];
  foreach c in array string_to_array(tg_argv[2], ',') loop
    if coalesce(j ->> c, '') <> '' then b := b || case when b = '' then '' else E'\n' end || (j ->> c); end if;
  end loop;
  insert into search_index (project_id, entity_type, entity_id, title, body)
  values (new.project_id, et, new.id, ttl, nullif(b, ''))
  on conflict (entity_type, entity_id) do update
    set title = excluded.title,
        body = excluded.body,
        embedding = case when search_index.title is not distinct from excluded.title
                          and search_index.body is not distinct from excluded.body
                         then search_index.embedding else null end,
        updated_at = now();
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('articles',          'article',        'title',      'abstract'),
    ('passages',          'passage',        'section',    'quote,note'),
    ('fichamento_fields', 'fichamento_field','field_key', 'content'),
    ('knowledge_items',   'knowledge_item', 'title',      'body'),
    ('claims',            'claim',          'text',       'text'),
    ('objectives',        'objective',      'title',      'description'),
    ('hypotheses',        'hypothesis',     'statement',  'rationale'),
    ('protocols',         'protocol',       'title',      'objective'),
    ('experiments',       'experiment',     'title',      'design'),
    ('interpretations',   'interpretation', 'body',       'body'),
    ('results',           'result',         'statement',  'metric'),
    ('notebook_entries',  'notebook_entry', 'title',      'body'),
    ('reagents',          'reagent',        'name',       'notes,supplier,catalog_number'),
    ('tasks',             'task',           'title',      'description'),
    ('meetings',          'meeting',        'title',      'agenda,notes'),
    ('decisions',         'decision',       'title',      'rationale'),
    ('sections',          'section',        'title',      'content')
  ) as v(tbl, etype, tcol, bcols)
  loop
    execute format('create trigger index_entity after insert or update or delete on public.%I
                    for each row execute function public.index_entity(%L, %L, %L)', r.tbl, r.etype, r.tcol, r.bcols);
  end loop;
end $$;

-- Busca textual (RLS aplica: security invoker)
create or replace function public.search_project(p_project uuid, p_query text, p_types text[] default null, p_limit int default 30)
returns table (entity_type text, entity_id uuid, title text, snippet text, rank real)
language sql stable set search_path = public as $$
  with q as (select websearch_to_tsquery('simple', public.f_unaccent(p_query)) as tsq)
  select s.entity_type, s.entity_id, s.title, left(coalesce(s.body, ''), 240), ts_rank(s.tsv, q.tsq)
  from search_index s, q
  where s.project_id = p_project and s.tsv @@ q.tsq and (p_types is null or s.entity_type = any (p_types))
  order by 5 desc
  limit least(p_limit, 100)
$$;

-- Trechos de PDF: busca textual com localizador (artigo + página)
create or replace function public.search_chunks(p_project uuid, p_query text, p_limit int default 12, p_article_ids uuid[] default null)
returns table (id uuid, article_id uuid, page_number int, section text, content text, rank real)
language sql stable set search_path = public as $$
  with q as (select websearch_to_tsquery('simple', public.f_unaccent(p_query)) as tsq)
  select c.id, c.article_id, c.page_number, c.section, c.content, ts_rank(c.tsv, q.tsq)
  from article_chunks c, q
  where c.project_id = p_project and c.tsv @@ q.tsq and (p_article_ids is null or c.article_id = any (p_article_ids))
  order by 6 desc
  limit least(p_limit, 50)
$$;

-- Trechos de PDF: busca semântica (pgvector, distância de cosseno)
create or replace function public.match_chunks(p_project uuid, p_embedding vector(1536), p_limit int default 12, p_article_ids uuid[] default null)
returns table (id uuid, article_id uuid, page_number int, section text, content text, similarity real)
language sql stable set search_path = public as $$
  select c.id, c.article_id, c.page_number, c.section, c.content, (1 - (c.embedding <=> p_embedding))::real
  from article_chunks c
  where c.project_id = p_project and c.embedding is not null and (p_article_ids is null or c.article_id = any (p_article_ids))
  order by c.embedding <=> p_embedding
  limit least(p_limit, 50)
$$;

-- Itens do índice (notas, claims, fichamentos…) por similaridade
create or replace function public.match_index(p_project uuid, p_embedding vector(1536), p_limit int default 12)
returns table (entity_type text, entity_id uuid, title text, snippet text, similarity real)
language sql stable set search_path = public as $$
  select s.entity_type, s.entity_id, s.title, left(coalesce(s.body, ''), 240), (1 - (s.embedding <=> p_embedding))::real
  from search_index s
  where s.project_id = p_project and s.embedding is not null
  order by s.embedding <=> p_embedding
  limit least(p_limit, 50)
$$;

-- ---------------------------------------------------------------------------
-- Grafo: nós e arestas unificados (FKs tipadas + links livres)
-- ---------------------------------------------------------------------------
-- Convenção das arestas: "dependente --relação--> fundamento".
create view v_nodes with (security_invoker = true) as
  select 'article'::text as node_type, id as node_id, project_id, title as label from articles
  union all select 'passage', p.id, p.project_id, left(p.quote, 90) from passages p
  union all select 'fichamento', f.id, f.project_id, 'Fichamento: ' || a.title from fichamentos f join articles a on a.id = f.article_id
  union all select 'knowledge_item', id, project_id, title from knowledge_items
  union all select 'claim', id, project_id, left(text, 120) from claims
  union all select 'evidence', e.id, e.project_id, 'Evidência (' || e.stance || ')' from evidence e
  union all select 'objective', id, project_id, title from objectives
  union all select 'hypothesis', id, project_id, left(statement, 120) from hypotheses
  union all select 'protocol', id, project_id, title from protocols
  union all select 'experiment', id, project_id, title from experiments
  union all select 'dataset', id, project_id, name || ' (' || layer || ')' from datasets
  union all select 'interpretation', id, project_id, left(body, 90) from interpretations
  union all select 'result', id, project_id, left(statement, 120) from results
  union all select 'notebook_entry', id, project_id, title from notebook_entries
  union all select 'reagent', id, project_id, name from reagents
  union all select 'task', id, project_id, title from tasks
  union all select 'meeting', id, project_id, title from meetings
  union all select 'decision', id, project_id, title from decisions
  union all select 'section', id, project_id, title from sections;

create view v_edges with (security_invoker = true) as
  select project_id, src_type, src_id, dst_type, dst_id, relation, origin, review_status, 'link'::text as via from links
  union all select project_id, 'passage', id, 'article', article_id, 'belongs_to', origin, 'approved'::review_status, 'fk' from passages
  union all select project_id, 'fichamento', id, 'article', article_id, 'summarizes', 'researcher'::origin, 'approved'::review_status, 'fk' from fichamentos
  union all select project_id, 'knowledge_item', id, 'passage', passage_id, 'quotes', origin, review_status, 'fk' from knowledge_items where passage_id is not null
  union all select project_id, 'hypothesis', id, 'objective', objective_id, 'refines', 'researcher'::origin, 'approved'::review_status, 'fk' from hypotheses where objective_id is not null
  union all select project_id, 'evidence', id, 'claim', claim_id, 'about', origin, review_status, 'fk' from evidence
  union all select project_id, 'evidence', id, 'passage', passage_id, 'quotes', origin, review_status, 'fk' from evidence where passage_id is not null
  union all select project_id, 'evidence', id, 'result', result_id, 'measured_in', origin, review_status, 'fk' from evidence where result_id is not null
  union all select project_id, 'experiment', id, 'hypothesis', hypothesis_id, 'tests', 'researcher'::origin, 'approved'::review_status, 'fk' from experiments where hypothesis_id is not null
  union all select e.project_id, 'experiment', e.id, 'protocol', pv.protocol_id, 'follows', 'researcher'::origin, 'approved'::review_status, 'fk' from experiments e join protocol_versions pv on pv.id = e.protocol_version_id
  union all select project_id, 'dataset', id, 'experiment', experiment_id, 'belongs_to', 'researcher'::origin, 'approved'::review_status, 'fk' from datasets
  union all select project_id, 'dataset', id, 'dataset', derived_from, 'derived_from', 'researcher'::origin, 'approved'::review_status, 'fk' from datasets where derived_from is not null
  union all select project_id, 'interpretation', id, 'dataset', dataset_id, 'analyzes', origin, review_status, 'fk' from interpretations where dataset_id is not null
  union all select project_id, 'interpretation', id, 'experiment', experiment_id, 'belongs_to', origin, review_status, 'fk' from interpretations
  union all select project_id, 'result', id, 'interpretation', interpretation_id, 'based_on', origin, review_status, 'fk' from results where interpretation_id is not null
  union all select project_id, 'result', id, 'experiment', experiment_id, 'belongs_to', origin, review_status, 'fk' from results
  union all select project_id, 'notebook_entry', id, 'experiment', experiment_id, 'belongs_to', 'researcher'::origin, 'approved'::review_status, 'fk' from notebook_entries where experiment_id is not null
  union all select project_id, 'decision', id, 'meeting', meeting_id, 'made_in', 'researcher'::origin, 'approved'::review_status, 'fk' from decisions where meeting_id is not null
  union all select project_id, 'section', section_id, 'claim', claim_id, 'uses_claim', 'researcher'::origin, 'approved'::review_status, 'fk' from section_claims
  union all select project_id, 'section', section_id, 'article', article_id, 'cites', 'researcher'::origin, 'approved'::review_status, 'fk' from citations
  union all select project_id, 'section', section_id, 'passage', passage_id, 'cites', 'researcher'::origin, 'approved'::review_status, 'fk' from citations where passage_id is not null;

-- Vizinhança de um nó até p_depth saltos (sem direção: a cadeia mistura sentidos).
create or replace function public.trace_nodes(p_type text, p_id uuid, p_depth int default 4)
returns table (node_type text, node_id uuid, label text, depth int)
language sql stable set search_path = public as $$
  with recursive walk (depth, node_type, node_id) as (
    select 0, p_type, p_id
    union
    select w.depth + 1, n.t, n.i
    from walk w
    cross join lateral (
      select e.dst_type as t, e.dst_id as i from v_edges e where e.src_type = w.node_type and e.src_id = w.node_id
      union
      select e.src_type, e.src_id from v_edges e where e.dst_type = w.node_type and e.dst_id = w.node_id
    ) n
    where w.depth < least(p_depth, 8)
  ), best as (
    select node_type, node_id, min(depth) as depth from walk group by node_type, node_id
  )
  select b.node_type, b.node_id, coalesce(v.label, '(sem acesso ou removido)'), b.depth
  from best b left join v_nodes v on v.node_type = b.node_type and v.node_id = b.node_id
  order by b.depth, b.node_type
$$;

create or replace function public.trace_edges(p_type text, p_id uuid, p_depth int default 4)
returns table (src_type text, src_id uuid, dst_type text, dst_id uuid, relation text, origin origin, review_status review_status)
language sql stable set search_path = public as $$
  with n as (select node_type, node_id from trace_nodes(p_type, p_id, p_depth))
  select e.src_type, e.src_id, e.dst_type, e.dst_id, e.relation, e.origin, e.review_status
  from v_edges e
  where exists (select 1 from n where n.node_type = e.src_type and n.node_id = e.src_id)
    and exists (select 1 from n where n.node_type = e.dst_type and n.node_id = e.dst_id)
$$;
