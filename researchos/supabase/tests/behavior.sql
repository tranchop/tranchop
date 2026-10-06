-- Teste de comportamento (rodar após stub + migrações). Falha com exceção se algo divergir.
\set ON_ERROR_STOP on
create schema t; grant usage on schema t to authenticated;
create or replace function t.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then raise notice 'ok  (bloqueado) %: %', label, sqlerrm; return; end;
  raise exception 'FALHOU: deveria bloquear -> %', label;
end $$;
create or replace function t.expect(cond boolean, label text) returns void language plpgsql as $$
begin if cond then raise notice 'ok  %', label; else raise exception 'FALHOU: %', label; end if; end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@x.org'),
  ('22222222-2222-2222-2222-222222222222', 'bia@x.org');

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- Ana cria projeto (vira owner) e dois artigos
insert into projects (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Mestrado Ana');
select t.expect((select role from project_members where user_id = auth.uid()) = 'owner', 'criador vira owner');

insert into articles (id, project_id, title, doi) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Efeito do composto X em células', '10.1/abc');
select t.expect((select count(*) from search_index where entity_type='article') = 1, 'trigger indexou artigo');
select t.expect((select count(*) from search_project('aaaaaaaa-0000-0000-0000-000000000001', 'celulas')) = 1, 'busca sem acento acha "células"');
select t.expect((select count(*) from change_log where table_name='articles' and op='INSERT') = 1, 'histórico registrou INSERT');
select t.expect_fail($$insert into articles (project_id,title,doi) values ('aaaaaaaa-0000-0000-0000-000000000001','dup','10.1/ABC')$$, 'DOI duplicado no projeto');

-- passagem + claim + evidência
insert into passages (id, project_id, article_id, page_number, quote) values
  ('b1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001', 4, 'X reduziu a viabilidade em 40%');
insert into claims (id, project_id, text) values ('c1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','X é citotóxico');
select t.expect((select status from claims where id='c1000000-0000-0000-0000-000000000001')='unsupported','claim nasce unsupported');
insert into evidence (project_id, claim_id, passage_id) values ('aaaaaaaa-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');
select t.expect((select status from claims where id='c1000000-0000-0000-0000-000000000001')='supported','claim vira supported com evidência aprovada');
select t.expect_fail($$insert into evidence (project_id, claim_id) values ('aaaaaaaa-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001')$$, 'evidência sem passagem nem resultado');

-- fichamento: campo extraído exige localizador; aprovação exige revisão
insert into fichamentos (id, project_id, article_id) values ('f1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001');
select t.expect_fail($$insert into fichamento_fields (project_id,fichamento_id,field_key,content,origin) values ('aaaaaaaa-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','objective','x','source_extracted')$$, 'campo extraído sem passagem');
insert into fichamento_fields (project_id,fichamento_id,field_key,content,origin,passage_id) values ('aaaaaaaa-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','results','X reduziu viabilidade','source_extracted','b1000000-0000-0000-0000-000000000001');
select t.expect_fail($$update fichamentos set status='approved' where id='f1000000-0000-0000-0000-000000000001'$$, 'aprovar fichamento com campo em rascunho');
update fichamento_fields set review_status='approved';
update fichamentos set status='approved' where id='f1000000-0000-0000-0000-000000000001';
select t.expect((select approved_by from fichamentos limit 1) = auth.uid(), 'aprovação registra revisor');

-- experimento / dados
insert into experiments (id, project_id, title) values ('e1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Viabilidade 24h');
insert into datasets (id, project_id, experiment_id, layer, name, storage_path, sha256) values
  ('d1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','raw','plate1.csv','p/raw.csv','abc');
insert into datasets (id, project_id, experiment_id, layer, name, storage_path, sha256, derived_from) values
  ('d1000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','processed','plate1_norm.csv','p/proc.csv','def','d1000000-0000-0000-0000-000000000001');
select t.expect_fail($$update datasets set storage_path='outro' where id='d1000000-0000-0000-0000-000000000001'$$, 'sobrescrever dado bruto');
select t.expect_fail($$delete from datasets where id='d1000000-0000-0000-0000-000000000001'$$, 'apagar dado bruto');
select t.expect_fail($$insert into datasets (project_id, experiment_id, layer, name, storage_path, sha256) values ('aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','processed','x','p','s')$$, 'processed sem origem');
update datasets set archived_at = now() where id='d1000000-0000-0000-0000-000000000001';
select t.expect(true, 'arquivar bruto permitido');

insert into interpretations (id, project_id, experiment_id, dataset_id, body) values ('1e000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000002','Queda dose-dependente');
select t.expect_fail($$insert into results (project_id, experiment_id, statement, status) values ('aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','r','final')$$, 'resultado final sem interpretação/aprovação');
select t.expect_fail($$insert into results (project_id, experiment_id, statement, value, origin) values ('aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','r',42,'ai_suggested')$$, 'número vindo da IA');
insert into results (id, project_id, experiment_id, interpretation_id, statement, value, unit, status, review_status) values
  ('2e000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','1e000000-0000-0000-0000-000000000001','Viabilidade 60%',60,'%','final','approved');

-- caderno assinado
insert into notebook_entries (id, project_id, experiment_id, title, body) values ('3e000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','Dia 1','semeadura');
update notebook_entries set body='semeadura 5k/poço' where id='3e000000-0000-0000-0000-000000000001';
update notebook_entries set signed_at=now(), signed_by=auth.uid() where id='3e000000-0000-0000-0000-000000000001';
select t.expect_fail($$update notebook_entries set body='alterado' where id='3e000000-0000-0000-0000-000000000001'$$, 'editar entrada assinada');

-- protocolo versionado
insert into protocols (id, project_id, title) values ('a0000000-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','MTT');
insert into protocol_versions (project_id, protocol_id, body) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','v1');
insert into protocol_versions (project_id, protocol_id, body) values ('aaaaaaaa-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','v2');
select t.expect((select current_version from protocols)=2, 'versão de protocolo incrementa');
select t.expect_fail($$update protocol_versions set body='x'$$, 'editar versão de protocolo');

-- evidência de resultado próprio + links + rastreio
insert into claims (id, project_id, text, kind) values ('c2000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','X reduz viabilidade a 60%','own_finding');
insert into evidence (project_id, claim_id, result_id) values ('aaaaaaaa-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002','2e000000-0000-0000-0000-000000000001');
insert into documents (id, project_id, title) values ('d0000000-0000-0000-0000-0000000000d1','aaaaaaaa-0000-0000-0000-000000000001','Dissertação');
insert into sections (id, project_id, document_id, title, content) values ('5e000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000d1','Discussão','texto');
insert into section_claims (project_id, section_id, claim_id) values ('aaaaaaaa-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002');
insert into citations (project_id, section_id, article_id, passage_id, locator) values ('aaaaaaaa-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','p. 4');
insert into links (project_id, src_type, src_id, dst_type, dst_id, relation) values
  ('aaaaaaaa-0000-0000-0000-000000000001','experiment','e1000000-0000-0000-0000-000000000001','article','a1000000-0000-0000-0000-000000000001','inspired_by');
select t.expect_fail($$insert into links (project_id, src_type, src_id, dst_type, dst_id, relation) values ('aaaaaaaa-0000-0000-0000-000000000001','article','a1000000-0000-0000-0000-000000000001','article','99999999-0000-0000-0000-000000000000','related_to')$$, 'link para nó inexistente');
select t.expect_fail($$insert into links (project_id, src_type, src_id, dst_type, dst_id, relation) values ('aaaaaaaa-0000-0000-0000-000000000001','foo','a1000000-0000-0000-0000-000000000001','article','a1000000-0000-0000-0000-000000000001','related_to')$$, 'tipo de nó inválido');

-- da seção da dissertação ao PDF/página (cadeia de rastreio)
select t.expect((select count(*) from trace_nodes('section','5e000000-0000-0000-0000-000000000001', 6) where node_type='passage' and node_id='b1000000-0000-0000-0000-000000000001') = 1, 'trace: seção alcança passagem do PDF');
select t.expect((select count(*) from trace_nodes('article','a1000000-0000-0000-0000-000000000001', 6) where node_type='dataset') >= 1, 'trace: artigo alcança dado experimental');
select t.expect((select count(*) from trace_edges('section','5e000000-0000-0000-0000-000000000001', 6)) > 5, 'trace_edges retorna arestas');

-- === Bia (outro usuário) não vê nada e não escreve ===
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select t.expect((select count(*) from projects) = 0, 'Bia não vê projeto da Ana');
select t.expect((select count(*) from articles) = 0, 'Bia não vê artigos');
select t.expect((select count(*) from change_log) = 0, 'Bia não vê histórico');
select t.expect((select count(*) from search_project('aaaaaaaa-0000-0000-0000-000000000001','celulas')) = 0, 'Bia não encontra na busca');
select t.expect_fail($$insert into articles (project_id,title) values ('aaaaaaaa-0000-0000-0000-000000000001','invasor')$$, 'Bia escrevendo no projeto da Ana');
-- Bia cria projeto próprio e tenta referenciar recurso da Ana
insert into projects (id, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Projeto Bia');
select t.expect_fail($$insert into passages (project_id, article_id, quote) values ('bbbbbbbb-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','q')$$, 'referência cruzada entre projetos');
select t.expect_fail($$select add_member_by_email('aaaaaaaa-0000-0000-0000-000000000001','bia@x.org','editor')$$, 'Bia se autoconvidando');

-- Ana convida Bia como viewer: lê, mas não escreve
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select add_member_by_email('aaaaaaaa-0000-0000-0000-000000000001','bia@x.org','viewer');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select t.expect((select count(*) from articles) = 1, 'viewer lê artigos');
select t.expect_fail($$insert into articles (project_id,title) values ('aaaaaaaa-0000-0000-0000-000000000001','x')$$, 'viewer não escreve');
select t.expect((select count(*) from articles where title='hack')=0, 'viewer: nada alterado');
reset role;
\echo === TODOS OS TESTES PASSARAM ===
