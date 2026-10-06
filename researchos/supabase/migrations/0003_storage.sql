-- Buckets privados. Caminho obrigatório: {project_id}/... (primeiro segmento = projeto).
-- Só executa em ambiente Supabase (schema storage presente).
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'schema storage ausente: pulando políticas de Storage';
    return;
  end if;

  insert into storage.buckets (id, name, public) values ('papers', 'papers', false), ('lab-data', 'lab-data', false)
  on conflict (id) do nothing;

  -- leitura: membros do projeto
  create policy "project members read files" on storage.objects for select to authenticated
    using (bucket_id in ('papers', 'lab-data') and public.is_member(((storage.foldername(name))[1])::uuid));
  -- upload: owner/editor
  create policy "project editors upload files" on storage.objects for insert to authenticated
    with check (bucket_id in ('papers', 'lab-data') and public.can_edit(((storage.foldername(name))[1])::uuid));
  -- PDFs podem ser substituídos/removidos por editores; dados brutos (lab-data) nunca são sobrescritos ou apagados
  create policy "project editors manage papers" on storage.objects for update to authenticated
    using (bucket_id = 'papers' and public.can_edit(((storage.foldername(name))[1])::uuid));
  create policy "project editors delete papers" on storage.objects for delete to authenticated
    using (bucket_id = 'papers' and public.can_edit(((storage.foldername(name))[1])::uuid));
end $$;
