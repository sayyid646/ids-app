-- =====================================================================
-- Migrasi 7: sinkronisasi antarperangkat (Realtime) dan tempat foto barang
-- =====================================================================

-- Realtime: perubahan di tabel ini dikirim ke semua perangkat yang sedang login.
-- RLS tetap berlaku, jadi hanya admin yang menerima perubahan.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['app_settings', 'jewelry_categories', 'craftsmen', 'orders', 'order_items', 'activity_logs'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Foto barang: bucket privat, hanya admin yang bisa melihat dan mengunggah.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-barang', 'foto-barang', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identitas', 'identitas', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists ids_foto_select on storage.objects;
create policy ids_foto_select on storage.objects for select to authenticated
  using (bucket_id in ('foto-barang', 'identitas') and (select public.is_admin()));
drop policy if exists ids_foto_insert on storage.objects;
create policy ids_foto_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('foto-barang', 'identitas') and (select public.is_admin()));
drop policy if exists ids_foto_update on storage.objects;
create policy ids_foto_update on storage.objects for update to authenticated
  using (bucket_id in ('foto-barang', 'identitas') and (select public.is_admin()));
drop policy if exists ids_foto_delete on storage.objects;
create policy ids_foto_delete on storage.objects for delete to authenticated
  using (bucket_id in ('foto-barang', 'identitas') and (select public.is_admin()));
