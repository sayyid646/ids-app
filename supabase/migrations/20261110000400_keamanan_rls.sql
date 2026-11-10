-- =====================================================================
-- Migrasi 4: keamanan. Hanya akun berperan 'admin' yang bisa membuka data usaha.
-- Row Level Security (RLS) aktif di semua tabel.
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.pastikan_admin()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Akses ditolak. Akun ini bukan administrator IDS.' using errcode = '42501', hint = 'IDS_BUKAN_ADMIN';
  end if;
end $$;

-- Menjadikan sebuah akun administrator. HANYA dijalankan dari SQL Editor Supabase.
create or replace function public.jadikan_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.profiles set role = 'admin' where lower(email) = lower(btrim(p_email));
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Akun dengan email % belum ada. Buat dulu di Authentication > Users.', p_email;
  end if;
  return 'Berhasil: ' || p_email || ' sekarang administrator IDS.';
end $$;

-- --------------------------------------------------------------- RLS
alter table public.profiles            enable row level security;
alter table public.app_settings        enable row level security;
alter table public.jewelry_categories  enable row level security;
alter table public.craftsmen           enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.activity_logs       enable row level security;

-- profil: tiap akun melihat profilnya sendiri; admin melihat semua.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- pengaturan
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated using ((select public.is_admin()));
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- tabel data usaha: baca, tambah, ubah hanya admin. Tidak ada kebijakan hapus.
do $$
declare t text;
begin
  foreach t in array array['jewelry_categories', 'craftsmen', 'orders', 'order_items'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_admin()))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_update', t);
  end loop;
end $$;

-- riwayat: hanya dibaca admin; ditulis otomatis oleh database.
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs for select to authenticated using ((select public.is_admin()));
