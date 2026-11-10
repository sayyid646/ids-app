-- =====================================================================
-- IDS — INTAN DUA SAUDARA  |  SETUP DATABASE LENGKAP (Fase 1)
-- Cara pakai: Supabase > SQL Editor > New query > tempel SEMUA isi file ini > Run.
-- Aman dijalankan ulang: tidak menggandakan data dan tidak menghapus data.
-- Isi: gabungan 8 file di folder supabase/migrations (urutan sama).
-- =====================================================================


-- >>>>>>>>>> 20261110000100_skema_inti.sql
-- =====================================================================
-- IDS — INTAN DUA SAUDARA
-- Migrasi 1: skema inti (tabel, relasi, indeks, aturan data)
-- =====================================================================
-- Konsep:
--   * orders       = satu nomor order milik satu pelanggan.
--   * order_items  = setiap barang perhiasan di dalam order. Status, pengrajin,
--                    kategori, dan tanggal dicatat PER BARANG supaya setiap
--                    barang bisa dilacak sendiri-sendiri.
--   * Tiga tanggal berbeda tidak pernah dicampur:
--       assigned_date  = tanggal barang diberikan ke pengrajin
--       completed_at   = waktu pengrajin selesai mengerjakan
--       delivered_at   = waktu barang diserahkan ke pembeli
--   * Data tidak pernah dihapus permanen. Pembatalan dan penonaktifan dipakai.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- tipe
do $$ begin
  create type public.item_status as enum ('dalam_proses', 'selesai', 'diserahkan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_category as enum ('LADY', 'MAN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.app_role as enum ('admin', 'none');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------- fungsi pembantu
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Merapikan nomor WhatsApp Indonesia ke format 62xxxxxxxxxx.
-- '0812-3456-7890' -> '6281234567890', '+62 812...' -> '62812...', '812...' -> '62812...'
create or replace function public.normalize_wa(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' then return null; end if;
  if left(d, 1) = '0' then d := '62' || substr(d, 2);
  elsif left(d, 1) = '8' then d := '62' || d;
  end if;
  return d;
end $$;

-- Merapikan kode pengrajin: huruf besar, spasi tunggal. 'ids  001 ' -> 'IDS 001'
create or replace function public.normalize_code(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(btrim(p), '\s+', ' ', 'g'));
$$;

-- Kunci pembanding nomor order: tanpa spasi, huruf besar. ' 2574 ' = '2574'
create or replace function public.order_key(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g'));
$$;

-- ------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        public.app_role not null default 'none',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Profil akun login. Hanya role admin yang bisa membuka data usaha.';

-- -------------------------------------------------------- app_settings
create table if not exists public.app_settings (
  id                        smallint primary key default 1 check (id = 1),
  app_name                  text not null default 'IDS',
  business_name             text not null default 'INTAN DUA SAUDARA',
  tagline                   text not null default 'SMART JEWELRY MANAGEMENT',
  business_address          text,
  business_whatsapp         text,
  logo_path                 text,
  timezone                  text not null default 'Asia/Makassar',
  date_format               text not null default 'dd MMMM yyyy',
  receipt_paper             text not null default 'A4' check (receipt_paper in ('A4', '80mm', '58mm')),
  receipt_show_signature    boolean not null default true,
  receipt_footer            text not null default 'Terima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.',
  wa_template_proses        text not null default E'Assalamu''alaikum.\n\nKami dari IDS - Intan Dua Saudara ingin menginformasikan bahwa pesanan permata Anda:\n\nNomor Order: {nomor_order}\nKategori: {kategori}\nStatus: Dalam Proses\n\nPesanan Anda sedang dikerjakan oleh pengrajin kami.\n\nTerima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.',
  wa_template_selesai       text not null default E'Assalamu''alaikum.\n\nKami dari IDS - Intan Dua Saudara ingin menginformasikan bahwa pesanan permata Anda:\n\nNomor Order: {nomor_order}\nKategori: {kategori}\nStatus: Selesai Dikerjakan\n\nPesanan Anda telah selesai dikerjakan pada {tanggal_selesai}.\n\nTerima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.',
  wa_template_diserahkan    text not null default E'Assalamu''alaikum.\n\nKami dari IDS - Intan Dua Saudara ingin menginformasikan bahwa pesanan permata Anda:\n\nNomor Order: {nomor_order}\nKategori: {kategori}\nStatus: Sudah Diserahkan\n\nPesanan Anda telah diserahkan pada {tanggal_serah}.\n\nTerima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.',
  appearance                text not null default 'terang' check (appearance in ('terang', 'gelap', 'otomatis')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
comment on table public.app_settings is 'Pengaturan usaha. Selalu tepat satu baris (id = 1).';

-- -------------------------------------------------- jewelry_categories
create table if not exists public.jewelry_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists jewelry_categories_name_uq
  on public.jewelry_categories (upper(btrim(name)));
comment on table public.jewelry_categories is 'Kategori perhiasan. Diubah namanya atau dinonaktifkan, tidak dihapus, supaya riwayat order tetap utuh.';

-- ----------------------------------------------------------- craftsmen
create table if not exists public.craftsmen (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (btrim(code) <> ''),
  name        text check (name is null or btrim(name) <> ''),
  phone       text,
  address     text,
  notes       text,
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists craftsmen_code_uq
  on public.craftsmen (public.normalize_code(code)) where deleted_at is null;
comment on column public.craftsmen.name is 'Boleh kosong bila nama belum diberikan (IDS 008 dan IDS 009).';

-- -------------------------------------------------------------- orders
create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_number       text not null check (btrim(order_number) <> ''),
  customer_name      text not null check (btrim(customer_name) <> ''),
  customer_whatsapp  text check (customer_whatsapp is null or customer_whatsapp ~ '^62[0-9]{7,13}$'),
  notes              text,
  cancelled_at       timestamptz,
  cancel_reason      text,
  deleted_at         timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- Satu nomor order hanya boleh dipakai satu order aktif. Barang tambahan masuk sebagai item.
create unique index if not exists orders_number_uq
  on public.orders (public.order_key(order_number)) where deleted_at is null;
create index if not exists orders_created_at_ix on public.orders (created_at desc);
create index if not exists orders_customer_trgm_ix
  on public.orders using gin (customer_name extensions.gin_trgm_ops);

-- --------------------------------------------------------- order_items
create table if not exists public.order_items (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders (id) on delete restrict,
  item_no                  integer not null check (item_no >= 1),
  craftsman_id             uuid not null references public.craftsmen (id) on delete restrict,
  category_id              uuid not null references public.jewelry_categories (id) on delete restrict,
  gender                   public.gender_category not null,
  description              text,
  assigned_date            date not null,
  production_month         date not null check (extract(day from production_month) = 1),
  production_month_manual  boolean not null default false,
  production_start_date    date,
  status                   public.item_status not null default 'dalam_proses',
  completed_at             timestamptz,
  delivered_at             timestamptz,
  notes                    text,
  photo_path               text,
  cancelled_at             timestamptz,
  cancel_reason            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint order_items_no_uq unique (order_id, item_no),
  -- Status dan tanggal selalu cocok. "Selesai" tidak sama dengan "sudah diserahkan".
  constraint order_items_status_dates_ck check (
       (status = 'dalam_proses' and completed_at is null     and delivered_at is null)
    or (status = 'selesai'      and completed_at is not null and delivered_at is null)
    or (status = 'diserahkan'   and completed_at is not null and delivered_at is not null)
  ),
  constraint order_items_delivered_after_completed_ck check (
    delivered_at is null or completed_at is null or delivered_at >= completed_at
  )
);
create index if not exists order_items_order_ix      on public.order_items (order_id);
create index if not exists order_items_craftsman_ix  on public.order_items (craftsman_id, status);
create index if not exists order_items_category_ix   on public.order_items (category_id);
create index if not exists order_items_assigned_ix   on public.order_items (assigned_date);
create index if not exists order_items_month_ix      on public.order_items (production_month);
create index if not exists order_items_status_ix     on public.order_items (status);
create index if not exists order_items_completed_ix  on public.order_items (completed_at) where completed_at is not null;
create index if not exists order_items_delivered_ix  on public.order_items (delivered_at) where delivered_at is not null;

-- ------------------------------------------------------- activity_logs
create table if not exists public.activity_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  actor_id      uuid,
  actor_email   text,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  order_id      uuid references public.orders (id) on delete restrict,
  order_number  text,
  item_id       uuid,
  craftsman_id  uuid,
  old_value     jsonb,
  new_value     jsonb,
  note          text
);
create index if not exists activity_logs_created_ix   on public.activity_logs (created_at desc);
create index if not exists activity_logs_order_ix     on public.activity_logs (order_id, created_at desc);
create index if not exists activity_logs_craftsman_ix on public.activity_logs (craftsman_id, created_at desc);
create index if not exists activity_logs_action_ix    on public.activity_logs (action);

-- ------------------------------------------------------ updated_at
do $$
declare t text;
begin
  foreach t in array array['profiles', 'app_settings', 'jewelry_categories', 'craftsmen', 'orders', 'order_items'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_updated_at', t);
  end loop;
end $$;

-- >>>>>>>>>> 20261110000200_aturan_bisnis.sql
-- =====================================================================
-- Migrasi 2: aturan bisnis yang dijaga langsung oleh database
-- (tidak bisa dilewati walaupun aplikasi salah kirim data)
-- =====================================================================

-- Zona waktu usaha (dari pengaturan, bawaan WITA).
create or replace function public.app_tz()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.timezone from public.app_settings s where s.id = 1), 'Asia/Makassar');
$$;

-- Tanggal hari ini menurut zona waktu usaha.
create or replace function public.hari_ini()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone public.app_tz())::date;
$$;

-- Tanggal lokal dari sebuah waktu.
create or replace function public.tgl_lokal(p timestamptz)
returns date language sql stable set search_path = '' as $$
  select (p at time zone public.app_tz())::date;
$$;

-- ------------------------------------------------- larangan hapus permanen
create or replace function public.tolak_hapus_permanen()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Data % tidak boleh dihapus permanen. Gunakan batalkan atau nonaktifkan.', tg_table_name
    using errcode = 'P0001', hint = 'IDS_TIDAK_BOLEH_HAPUS';
end $$;

do $$
declare t text;
begin
  foreach t in array array['jewelry_categories', 'craftsmen', 'orders', 'order_items', 'app_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.tolak_hapus_permanen()',
                   t || '_no_delete', t);
  end loop;
end $$;

-- Riwayat aktivitas tidak boleh diubah atau dihapus.
create or replace function public.tolak_ubah_log()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Riwayat aktivitas tidak boleh diubah atau dihapus.' using errcode = 'P0001', hint = 'IDS_LOG_TERKUNCI';
end $$;
drop trigger if exists activity_logs_locked on public.activity_logs;
create trigger activity_logs_locked before update or delete on public.activity_logs
  for each row execute function public.tolak_ubah_log();

-- --------------------------------------------------------- pengaturan
create or replace function public.app_settings_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    raise exception 'Zona waktu "%" tidak dikenal.', new.timezone using errcode = '22023';
  end;
  new.business_whatsapp := public.normalize_wa(new.business_whatsapp);
  return new;
end $$;
drop trigger if exists app_settings_before on public.app_settings;
create trigger app_settings_before before insert or update on public.app_settings
  for each row execute function public.app_settings_before();

-- ------------------------------------------------------------- profil
-- Peran (role) hanya bisa diubah dari SQL Editor Supabase, tidak lewat aplikasi.
create or replace function public.profiles_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Peran akun tidak bisa diubah dari aplikasi.' using errcode = '42501';
  end if;
  if (new.id <> old.id or new.email <> old.email) and auth.uid() is not null then
    raise exception 'Email dan ID akun tidak bisa diubah dari sini.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists profiles_before_update on public.profiles;
create trigger profiles_before_update before update on public.profiles
  for each row execute function public.profiles_before_update();

-- Setiap akun baru di Supabase Auth otomatis punya profil dengan peran 'none'.
create or replace function public.buat_profil_akun_baru()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.buat_profil_akun_baru();

-- ----------------------------------------------------------- pengrajin
create or replace function public.craftsmen_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.code  := public.normalize_code(new.code);
  new.name  := nullif(btrim(new.name), '');
  new.phone := public.normalize_wa(new.phone);
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'Pengrajin ini sudah dihapus (diarsipkan) dan tidak bisa diubah.' using errcode = 'P0001';
  end if;
  if new.deleted_at is not null then
    new.is_active := false;
  end if;
  return new;
end $$;
drop trigger if exists craftsmen_before on public.craftsmen;
create trigger craftsmen_before before insert or update on public.craftsmen
  for each row execute function public.craftsmen_before();

-- ------------------------------------------------------------ kategori
create or replace function public.categories_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := upper(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
  return new;
end $$;
drop trigger if exists categories_before on public.jewelry_categories;
create trigger categories_before before insert or update on public.jewelry_categories
  for each row execute function public.categories_before();

-- -------------------------------------------------------------- order
create or replace function public.orders_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.order_number      := btrim(new.order_number);
  new.customer_name     := regexp_replace(btrim(new.customer_name), '\s+', ' ', 'g');
  if nullif(btrim(new.customer_whatsapp), '') is not null
     and coalesce(public.normalize_wa(new.customer_whatsapp), '') !~ '^62[0-9]{7,13}$' then
    raise exception 'Nomor WhatsApp "%" tidak valid. Contoh yang benar: 0812 3456 7890.', new.customer_whatsapp
      using errcode = '22023', hint = 'IDS_WA_TIDAK_VALID';
  end if;
  new.customer_whatsapp := public.normalize_wa(new.customer_whatsapp);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    if old.deleted_at is not null and new.deleted_at is not null then
      raise exception 'Order ini sudah dihapus (diarsipkan) dan tidak bisa diubah.' using errcode = 'P0001';
    end if;
    if old.cancelled_at is not null and new.cancelled_at is not null
       and (new.order_number, new.customer_name, new.customer_whatsapp)
           is distinct from (old.order_number, old.customer_name, old.customer_whatsapp) then
      raise exception 'Order yang sudah dibatalkan tidak bisa diubah. Pulihkan dulu bila perlu.' using errcode = 'P0001';
    end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;
drop trigger if exists orders_before on public.orders;
create trigger orders_before before insert or update on public.orders
  for each row execute function public.orders_before();

-- --------------------------------------------------------------- item
create or replace function public.order_items_before()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_order  record;
  v_c      record;
  v_cat    record;
  v_today  date := public.hari_ini();
begin
  select o.cancelled_at, o.deleted_at into v_order from public.orders o where o.id = new.order_id;
  if not found then
    raise exception 'Order tidak ditemukan.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    raise exception 'Barang tidak bisa dipindah ke order lain.' using errcode = 'P0001';
  end if;
  if v_order.deleted_at is not null or (v_order.cancelled_at is not null and tg_op = 'INSERT') then
    raise exception 'Order ini sudah dibatalkan atau diarsipkan, tidak bisa ditambah atau diubah.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.cancelled_at is not null and new.cancelled_at is not null then
    raise exception 'Barang yang sudah dibatalkan tidak bisa diubah.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and v_order.cancelled_at is not null and new.status is distinct from old.status then
    raise exception 'Order ini sudah dibatalkan. Status barang tidak bisa diubah.' using errcode = 'P0001';
  end if;

  -- Pengrajin harus aktif ketika barang diberikan kepadanya.
  if tg_op = 'INSERT' or new.craftsman_id is distinct from old.craftsman_id then
    select c.is_active, c.deleted_at, c.code into v_c from public.craftsmen c where c.id = new.craftsman_id;
    if not found then
      raise exception 'Pengrajin tidak ditemukan.' using errcode = '23503';
    end if;
    if not v_c.is_active or v_c.deleted_at is not null then
      raise exception 'Pengrajin % sedang nonaktif. Aktifkan dulu atau pilih pengrajin lain.', v_c.code
        using errcode = 'P0001', hint = 'IDS_PENGRAJIN_NONAKTIF';
    end if;
  end if;

  -- Kategori harus aktif untuk barang baru atau saat kategori diganti.
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    select k.is_active, k.name into v_cat from public.jewelry_categories k where k.id = new.category_id;
    if not found then
      raise exception 'Kategori tidak ditemukan.' using errcode = '23503';
    end if;
    if not v_cat.is_active then
      raise exception 'Kategori % sedang nonaktif.', v_cat.name using errcode = 'P0001', hint = 'IDS_KATEGORI_NONAKTIF';
    end if;
  end if;

  -- Tanggal diberikan ke pengrajin: bawaan hari ini.
  if new.assigned_date is null then
    new.assigned_date := v_today;
  end if;
  if new.assigned_date > v_today then
    raise exception 'Tanggal diberikan ke pengrajin tidak boleh di masa depan.' using errcode = '22008';
  end if;

  -- Nomor urut barang di dalam order.
  if new.item_no is null then
    perform pg_advisory_xact_lock(hashtext(new.order_id::text));
    select coalesce(max(i.item_no), 0) + 1 into new.item_no from public.order_items i where i.order_id = new.order_id;
  end if;

  -- Bulan produksi: otomatis dari tanggal diberikan, kecuali diisi manual.
  --   * Diisi sendiri (berbeda dari bulan tanggal diberikan) -> dianggap manual dan dipertahankan.
  --   * Tidak diisi, atau sama dengan bulan otomatis          -> ikut tanggal diberikan.
  if new.production_month is not null
     and (tg_op = 'INSERT' or new.production_month is distinct from old.production_month) then
    new.production_month := date_trunc('month', new.production_month)::date;
    new.production_month_manual := new.production_month <> date_trunc('month', new.assigned_date)::date;
  elsif new.production_month is null
     or (tg_op = 'UPDATE' and not old.production_month_manual and new.assigned_date is distinct from old.assigned_date) then
    new.production_month := date_trunc('month', new.assigned_date)::date;
    new.production_month_manual := false;
  elsif tg_op = 'UPDATE' then
    new.production_month_manual := old.production_month_manual;
  end if;

  if new.production_start_date is not null and new.production_start_date < new.assigned_date then
    raise exception 'Tanggal mulai produksi tidak boleh sebelum tanggal diberikan ke pengrajin.' using errcode = '22008';
  end if;

  -- Tanggal otomatis mengikuti perubahan status.
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'dalam_proses' then
      new.completed_at := null;
      new.delivered_at := null;
    elsif new.status = 'selesai' then
      if tg_op = 'INSERT' or new.completed_at is not distinct from old.completed_at then
        new.completed_at := coalesce(new.completed_at, now());
      end if;
      new.delivered_at := null;
    elsif new.status = 'diserahkan' then
      new.completed_at := coalesce(new.completed_at, now());
      if tg_op = 'INSERT' or new.delivered_at is not distinct from old.delivered_at then
        new.delivered_at := coalesce(new.delivered_at, now());
      end if;
    end if;
  end if;

  -- Koreksi tanggal harus masuk akal.
  if new.completed_at is not null then
    if new.completed_at > now() + interval '5 minutes' then
      raise exception 'Tanggal selesai dikerjakan tidak boleh di masa depan.' using errcode = '22008';
    end if;
    if public.tgl_lokal(new.completed_at) < new.assigned_date then
      raise exception 'Tanggal selesai dikerjakan tidak boleh sebelum tanggal diberikan ke pengrajin.' using errcode = '22008';
    end if;
  end if;
  if new.delivered_at is not null then
    if new.delivered_at > now() + interval '5 minutes' then
      raise exception 'Tanggal diserahkan tidak boleh di masa depan.' using errcode = '22008';
    end if;
    if new.completed_at is not null and new.delivered_at < new.completed_at then
      raise exception 'Tanggal diserahkan ke pembeli tidak boleh sebelum tanggal selesai dikerjakan.' using errcode = '22008';
    end if;
  end if;

  new.description := nullif(btrim(new.description), '');
  new.notes       := nullif(btrim(new.notes), '');
  return new;
end $$;
drop trigger if exists order_items_before on public.order_items;
create trigger order_items_before before insert or update on public.order_items
  for each row execute function public.order_items_before();

-- >>>>>>>>>> 20261110000300_riwayat_aktivitas.sql
-- =====================================================================
-- Migrasi 3: riwayat aktivitas (audit log) otomatis
-- Dicatat oleh database, jadi tidak ada perubahan yang terlewat.
-- =====================================================================

-- Selisih dua baris: hanya kolom yang berubah. Hasil: {"kolom": {"lama": .., "baru": ..}}
create or replace function public.jsonb_selisih(p_lama jsonb, p_baru jsonb, p_abaikan text[] default array['updated_at'])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('lama', p_lama -> k, 'baru', p_baru -> k)), '{}'::jsonb)
  from jsonb_object_keys(p_baru) as k
  where not (k = any (p_abaikan))
    and (p_lama -> k) is distinct from (p_baru -> k);
$$;

create or replace function public.tulis_log(
  p_action text, p_entity_type text, p_entity_id uuid,
  p_order_id uuid, p_item_id uuid, p_craftsman_id uuid,
  p_old jsonb, p_new jsonb, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_no    text;
begin
  if v_uid is not null then
    select p.email into v_email from public.profiles p where p.id = v_uid;
  end if;
  if p_order_id is not null then
    select o.order_number into v_no from public.orders o where o.id = p_order_id;
  end if;
  insert into public.activity_logs
    (actor_id, actor_email, action, entity_type, entity_id, order_id, order_number, item_id, craftsman_id, old_value, new_value, note)
  values
    (v_uid, coalesce(v_email, case when v_uid is null then 'sistem' end), p_action, p_entity_type, p_entity_id,
     p_order_id, v_no, p_item_id, p_craftsman_id, p_old, p_new, p_note);
end $$;
revoke all on function public.tulis_log(text, text, uuid, uuid, uuid, uuid, jsonb, jsonb, text) from public;

-- Ringkasan pengrajin untuk log: {"id", "kode", "nama"}
create or replace function public.info_pengrajin(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'kode', c.code, 'nama', c.name) from public.craftsmen c where c.id = p_id;
$$;

-- --------------------------------------------------------------- order
create or replace function public.log_orders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('order_dibuat', 'order', new.id, new.id, null, null, null,
      jsonb_build_object('nomor_order', new.order_number, 'pelanggan', new.customer_name, 'whatsapp', new.customer_whatsapp));
    return new;
  end if;

  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.tulis_log('order_dibatalkan', 'order', new.id, new.id, null, null, null,
      jsonb_build_object('alasan', new.cancel_reason, 'waktu', new.cancelled_at));
  elsif old.cancelled_at is not null and new.cancelled_at is null then
    perform public.tulis_log('order_dipulihkan', 'order', new.id, new.id, null, null,
      jsonb_build_object('alasan_batal', old.cancel_reason), null);
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('order_diarsipkan', 'order', new.id, new.id, null, null, null, jsonb_build_object('waktu', new.deleted_at));
  end if;

  d := public.jsonb_selisih(
         to_jsonb(old) - array['cancelled_at', 'cancel_reason', 'deleted_at', 'created_by', 'created_at'],
         to_jsonb(new) - array['cancelled_at', 'cancel_reason', 'deleted_at', 'created_by', 'created_at']);
  if d <> '{}'::jsonb then
    perform public.tulis_log('order_diubah', 'order', new.id, new.id, null, null,
      (select jsonb_object_agg(k, v -> 'lama') from jsonb_each(d) as e(k, v)),
      (select jsonb_object_agg(k, v -> 'baru') from jsonb_each(d) as e(k, v)));
  end if;
  return new;
end $$;
drop trigger if exists log_orders on public.orders;
create trigger log_orders after insert or update on public.orders
  for each row execute function public.log_orders();

-- -------------------------------------------------------------- barang
create or replace function public.log_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d    jsonb;
  skip text[] := array['updated_at', 'created_at', 'status', 'completed_at', 'delivered_at', 'craftsman_id',
                       'cancelled_at', 'cancel_reason', 'production_month_manual'];
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('barang_ditambahkan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no, 'pengrajin', public.info_pengrajin(new.craftsman_id),
        'kategori', (select k.name from public.jewelry_categories k where k.id = new.category_id),
        'gender', new.gender, 'tanggal_diberikan', new.assigned_date, 'bulan_produksi', new.production_month,
        'status', new.status));
    perform public.tulis_log('pengrajin_ditugaskan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      public.info_pengrajin(new.craftsman_id));
    return new;
  end if;

  if new.craftsman_id is distinct from old.craftsman_id then
    perform public.tulis_log('pengrajin_ditugaskan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      public.info_pengrajin(old.craftsman_id), public.info_pengrajin(new.craftsman_id));
  end if;

  if new.status is distinct from old.status then
    perform public.tulis_log('status_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      jsonb_build_object('status', old.status, 'tanggal_selesai', old.completed_at, 'tanggal_serah', old.delivered_at),
      jsonb_build_object('status', new.status, 'tanggal_selesai', new.completed_at, 'tanggal_serah', new.delivered_at));
  else
    -- Koreksi tanggal tanpa ganti status.
    if new.completed_at is distinct from old.completed_at then
      perform public.tulis_log('tanggal_selesai_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
        jsonb_build_object('tanggal_selesai', old.completed_at), jsonb_build_object('tanggal_selesai', new.completed_at));
    end if;
    if new.delivered_at is distinct from old.delivered_at then
      perform public.tulis_log('tanggal_serah_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
        jsonb_build_object('tanggal_serah', old.delivered_at), jsonb_build_object('tanggal_serah', new.delivered_at));
    end if;
  end if;

  if old.cancelled_at is null and new.cancelled_at is not null then
    perform public.tulis_log('barang_dibatalkan', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no, 'alasan', new.cancel_reason));
  end if;

  d := public.jsonb_selisih(to_jsonb(old), to_jsonb(new), skip);
  if d <> '{}'::jsonb then
    perform public.tulis_log('barang_diubah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id,
      (select jsonb_object_agg(k, v -> 'lama') from jsonb_each(d) as e(k, v)),
      (select jsonb_object_agg(k, v -> 'baru') from jsonb_each(d) as e(k, v)));
  end if;
  return new;
end $$;
drop trigger if exists log_order_items on public.order_items;
create trigger log_order_items after insert or update on public.order_items
  for each row execute function public.log_order_items();

-- ----------------------------------------------------------- pengrajin
create or replace function public.log_craftsmen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('pengrajin_ditambahkan', 'craftsman', new.id, null, null, new.id, null,
      jsonb_build_object('kode', new.code, 'nama', new.name, 'aktif', new.is_active));
    return new;
  end if;
  if new.is_active is distinct from old.is_active and new.deleted_at is null then
    perform public.tulis_log(case when new.is_active then 'pengrajin_diaktifkan' else 'pengrajin_dinonaktifkan' end,
      'craftsman', new.id, null, null, new.id,
      jsonb_build_object('aktif', old.is_active), jsonb_build_object('aktif', new.is_active));
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('pengrajin_diarsipkan', 'craftsman', new.id, null, null, new.id, null,
      jsonb_build_object('kode', new.code, 'nama', new.name));
  end if;
  d := public.jsonb_selisih(to_jsonb(old) - array['is_active', 'deleted_at', 'created_at'],
                            to_jsonb(new) - array['is_active', 'deleted_at', 'created_at']);
  if d <> '{}'::jsonb then
    perform public.tulis_log('pengrajin_diubah', 'craftsman', new.id, null, null, new.id,
      (select jsonb_object_agg(k, v -> 'lama') from jsonb_each(d) as e(k, v)),
      (select jsonb_object_agg(k, v -> 'baru') from jsonb_each(d) as e(k, v)));
  end if;
  return new;
end $$;
drop trigger if exists log_craftsmen on public.craftsmen;
create trigger log_craftsmen after insert or update on public.craftsmen
  for each row execute function public.log_craftsmen();

-- ------------------------------------------------------------ kategori
create or replace function public.log_categories()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('kategori_ditambahkan', 'category', new.id, null, null, null, null,
      jsonb_build_object('nama', new.name));
    return new;
  end if;
  d := public.jsonb_selisih(to_jsonb(old) - 'created_at', to_jsonb(new) - 'created_at');
  if d <> '{}'::jsonb then
    perform public.tulis_log('kategori_diubah', 'category', new.id, null, null, null,
      (select jsonb_object_agg(k, v -> 'lama') from jsonb_each(d) as e(k, v)),
      (select jsonb_object_agg(k, v -> 'baru') from jsonb_each(d) as e(k, v)));
  end if;
  return new;
end $$;
drop trigger if exists log_categories on public.jewelry_categories;
create trigger log_categories after insert or update on public.jewelry_categories
  for each row execute function public.log_categories();

-- ---------------------------------------------------------- pengaturan
create or replace function public.log_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  d := public.jsonb_selisih(to_jsonb(old) - 'created_at', to_jsonb(new) - 'created_at');
  if d <> '{}'::jsonb then
    perform public.tulis_log('pengaturan_diubah', 'settings', null, null, null, null,
      (select jsonb_object_agg(k, v -> 'lama') from jsonb_each(d) as e(k, v)),
      (select jsonb_object_agg(k, v -> 'baru') from jsonb_each(d) as e(k, v)));
  end if;
  return new;
end $$;
drop trigger if exists log_settings on public.app_settings;
create trigger log_settings after update on public.app_settings
  for each row execute function public.log_settings();

-- >>>>>>>>>> 20261110000400_keamanan_rls.sql
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

-- >>>>>>>>>> 20261110000500_fungsi_bisnis.sql
-- =====================================================================
-- Migrasi 5: tampilan data (view), fungsi order, statistik, dan pencarian
-- Semua view memakai security_invoker supaya RLS tetap berlaku.
-- Barang "aktif" = barang tidak dibatalkan DAN order-nya tidak dibatalkan/diarsipkan.
-- =====================================================================

create or replace function public.label_status(p public.item_status)
returns text language sql immutable set search_path = '' as $$
  select case p
    when 'dalam_proses' then 'Dalam Proses'
    when 'selesai'      then 'Selesai Dikerjakan'
    when 'diserahkan'   then 'Sudah Diserahkan'
  end;
$$;

-- ---------------------------------------------------------- v_items
create or replace view public.v_items with (security_invoker = true) as
select
  i.id,
  i.order_id,
  o.order_number,
  o.customer_name,
  o.customer_whatsapp,
  i.item_no,
  i.craftsman_id,
  c.code   as craftsman_code,
  c.name   as craftsman_name,
  i.category_id,
  k.name   as category_name,
  i.gender,
  i.description,
  i.assigned_date,
  i.production_month,
  extract(year from i.production_month)::int  as production_year,
  extract(month from i.production_month)::int as production_month_no,
  i.production_month_manual,
  i.production_start_date,
  i.status,
  public.label_status(i.status) as status_label,
  i.completed_at,
  i.delivered_at,
  i.notes,
  i.photo_path,
  i.cancelled_at,
  i.cancel_reason,
  o.cancelled_at as order_cancelled_at,
  (i.cancelled_at is null and o.cancelled_at is null and o.deleted_at is null) as is_active,
  i.created_at,
  i.updated_at
from public.order_items i
join public.orders o              on o.id = i.order_id
join public.craftsmen c           on c.id = i.craftsman_id
join public.jewelry_categories k  on k.id = i.category_id
where o.deleted_at is null;

-- --------------------------------------------------------- v_orders
create or replace view public.v_orders with (security_invoker = true) as
select
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_whatsapp,
  o.notes,
  o.cancelled_at,
  o.cancel_reason,
  o.created_at,
  o.updated_at,
  count(i.id) filter (where i.cancelled_at is null)                              as quantity,
  count(i.id) filter (where i.cancelled_at is null and i.status = 'dalam_proses') as qty_dalam_proses,
  count(i.id) filter (where i.cancelled_at is null and i.status = 'selesai')      as qty_selesai,
  count(i.id) filter (where i.cancelled_at is null and i.status = 'diserahkan')   as qty_diserahkan,
  min(i.assigned_date) filter (where i.cancelled_at is null)                      as order_date,
  max(i.completed_at)  filter (where i.cancelled_at is null)                      as last_completed_at,
  max(i.delivered_at)  filter (where i.cancelled_at is null)                      as last_delivered_at,
  case
    when o.cancelled_at is not null then 'dibatalkan'
    when count(i.id) filter (where i.cancelled_at is null) = 0 then 'kosong'
    when count(i.id) filter (where i.cancelled_at is null and i.status = 'diserahkan')
       = count(i.id) filter (where i.cancelled_at is null) then 'diserahkan'
    when count(i.id) filter (where i.cancelled_at is null and i.status in ('selesai', 'diserahkan'))
       = count(i.id) filter (where i.cancelled_at is null) then 'selesai'
    when count(i.id) filter (where i.cancelled_at is null and i.status in ('selesai', 'diserahkan')) > 0 then 'sebagian'
    else 'dalam_proses'
  end as order_status,
  string_agg(distinct c.code, ', ') filter (where i.cancelled_at is null) as craftsman_codes,
  string_agg(distinct coalesce(c.name, c.code), ', ') filter (where i.cancelled_at is null) as craftsman_names,
  string_agg(distinct k.name, ', ') filter (where i.cancelled_at is null) as category_names
from public.orders o
left join public.order_items i          on i.order_id = o.id
left join public.craftsmen c            on c.id = i.craftsman_id
left join public.jewelry_categories k   on k.id = i.category_id
where o.deleted_at is null
group by o.id;

-- ------------------------------------------------------- v_craftsmen
-- Ringkasan sepanjang waktu tiap pengrajin (halaman pengrajin).
create or replace view public.v_craftsmen with (security_invoker = true) as
select
  c.id, c.code, c.name, c.phone, c.address, c.notes, c.is_active, c.created_at, c.updated_at,
  count(a.id)                                         as total_items,
  count(a.id) filter (where a.status = 'dalam_proses') as qty_dalam_proses,
  count(a.id) filter (where a.status = 'selesai')      as qty_selesai,
  count(a.id) filter (where a.status = 'diserahkan')   as qty_diserahkan,
  count(a.id) filter (where a.status in ('selesai', 'diserahkan')) as qty_selesai_dikerjakan,
  max(a.assigned_date)                                as last_assigned_date
from public.craftsmen c
left join (
  select i.id, i.craftsman_id, i.status, i.assigned_date
  from public.order_items i join public.orders o on o.id = i.order_id
  where i.cancelled_at is null and o.cancelled_at is null and o.deleted_at is null
) a on a.craftsman_id = c.id
where c.deleted_at is null
group by c.id;

-- =====================================================================
-- Fungsi order
-- =====================================================================

-- Cek nomor order sebelum menyimpan (untuk peringatan duplikat).
create or replace function public.cek_nomor_order(p_nomor text, p_kecuali uuid default null)
returns table (id uuid, order_number text, customer_name text, quantity bigint, order_date date, order_status text, cancelled boolean)
language sql stable security invoker set search_path = '' as $$
  select v.id, v.order_number, v.customer_name, v.quantity, v.order_date, v.order_status, v.cancelled_at is not null
  from public.v_orders v
  where public.order_key(v.order_number) = public.order_key(p_nomor)
    and (p_kecuali is null or v.id <> p_kecuali);
$$;

-- Menambah satu barang dari data JSON. Dipakai buat_order dan tambah_barang.
create or replace function public._sisipkan_barang(p_order uuid, it jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_status public.item_status;
begin
  v_status := coalesce(nullif(it ->> 'status', ''), 'dalam_proses')::public.item_status;
  insert into public.order_items (
    order_id, craftsman_id, category_id, gender, description, assigned_date, production_month,
    production_start_date, status, completed_at, delivered_at, notes, photo_path)
  values (
    p_order,
    (it ->> 'craftsman_id')::uuid,
    (it ->> 'category_id')::uuid,
    (it ->> 'gender')::public.gender_category,
    it ->> 'description',
    nullif(it ->> 'assigned_date', '')::date,
    nullif(it ->> 'production_month', '')::date,
    nullif(it ->> 'production_start_date', '')::date,
    v_status,
    case when v_status <> 'dalam_proses' then nullif(it ->> 'completed_at', '')::timestamptz end,
    case when v_status = 'diserahkan' then nullif(it ->> 'delivered_at', '')::timestamptz end,
    it ->> 'notes',
    nullif(it ->> 'photo_path', ''))
  returning id into v_id;
  return v_id;
end $$;

-- Membuat order lengkap dengan barang-barangnya dalam satu transaksi.
-- p = { order_number, customer_name, customer_whatsapp, notes,
--       items: [ { quantity (bawaan 1), craftsman_id, category_id, gender, description,
--                  assigned_date, production_month, production_start_date, notes, photo_path,
--                  status, completed_at, delivered_at } ] }
create or replace function public.buat_order(p jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id  uuid;
  it    jsonb;
  n     int;
  total int := 0;
begin
  perform public.pastikan_admin();
  if coalesce(btrim(p ->> 'order_number'), '') = '' then
    raise exception 'Nomor order wajib diisi.' using errcode = '23502';
  end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Order harus berisi minimal satu barang.' using errcode = '23502';
  end if;
  if exists (select 1 from public.orders o
             where public.order_key(o.order_number) = public.order_key(p ->> 'order_number') and o.deleted_at is null) then
    raise exception 'Nomor order % sudah dipakai. Tambahkan barang ke order yang ada atau gunakan nomor lain.', btrim(p ->> 'order_number')
      using errcode = '23505', hint = 'IDS_NOMOR_DUPLIKAT';
  end if;

  begin
    insert into public.orders (order_number, customer_name, customer_whatsapp, notes)
    values (p ->> 'order_number', p ->> 'customer_name', nullif(p ->> 'customer_whatsapp', ''), nullif(btrim(p ->> 'notes'), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Nomor order % sudah dipakai.', btrim(p ->> 'order_number') using errcode = '23505', hint = 'IDS_NOMOR_DUPLIKAT';
  end;

  for it in select value from jsonb_array_elements(p -> 'items') loop
    n := coalesce(nullif(it ->> 'quantity', '')::int, 1);
    if n < 1 or n > 100 then
      raise exception 'Jumlah barang harus 1 sampai 100.' using errcode = '22023';
    end if;
    for k in 1 .. n loop
      perform public._sisipkan_barang(v_id, it);
      total := total + 1;
    end loop;
  end loop;
  return v_id;
end $$;

-- Menambah barang ke order yang sudah ada.
create or replace function public.tambah_barang(p_order uuid, p_item jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n int; k int;
begin
  perform public.pastikan_admin();
  n := coalesce(nullif(p_item ->> 'quantity', '')::int, 1);
  if n < 1 or n > 100 then
    raise exception 'Jumlah barang harus 1 sampai 100.' using errcode = '22023';
  end if;
  for k in 1 .. n loop
    perform public._sisipkan_barang(p_order, p_item);
  end loop;
  return n;
end $$;

-- Mengubah status satu atau beberapa barang sekaligus.
-- p_waktu boleh kosong (= sekarang) atau diisi untuk mencatat waktu sebenarnya.
create or replace function public.ubah_status(p_items uuid[], p_status public.item_status, p_waktu timestamptz default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  perform public.pastikan_admin();
  update public.order_items i set
    status = p_status,
    completed_at = case
      when p_status = 'dalam_proses' then null
      -- Kembali dari "diserahkan" ke "selesai": tanggal selesai lama dipertahankan.
      when p_status = 'selesai' and i.status = 'diserahkan' then coalesce(p_waktu, i.completed_at)
      when p_status = 'selesai' then coalesce(p_waktu, now())
      when p_status = 'diserahkan' then coalesce(i.completed_at, p_waktu, now())
    end,
    delivered_at = case when p_status = 'diserahkan' then coalesce(p_waktu, now()) end
  where i.id = any (p_items) and i.cancelled_at is null and i.status is distinct from p_status;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.batalkan_order(p_order uuid, p_alasan text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  if coalesce(btrim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.' using errcode = '23502';
  end if;
  update public.orders set cancelled_at = now(), cancel_reason = btrim(p_alasan)
  where id = p_order and cancelled_at is null and deleted_at is null;
  if not found then
    raise exception 'Order tidak ditemukan atau sudah dibatalkan.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.pulihkan_order(p_order uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.orders set cancelled_at = null, cancel_reason = null
  where id = p_order and cancelled_at is not null and deleted_at is null;
  if not found then
    raise exception 'Order tidak ditemukan atau tidak dalam keadaan dibatalkan.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.batalkan_barang(p_item uuid, p_alasan text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  if coalesce(btrim(p_alasan), '') = '' then
    raise exception 'Alasan pembatalan wajib diisi.' using errcode = '23502';
  end if;
  update public.order_items set cancelled_at = now(), cancel_reason = btrim(p_alasan)
  where id = p_item and cancelled_at is null;
  if not found then
    raise exception 'Barang tidak ditemukan atau sudah dibatalkan.' using errcode = 'P0002';
  end if;
end $$;

-- =====================================================================
-- Statistik. Semua angka dihitung dari data, tidak ada angka tetap.
-- Periode memakai tanggal diberikan ke pengrajin (assigned_date),
-- kecuali angka "selesai pada periode" dan "diserahkan pada periode".
-- =====================================================================

create or replace function public._barang_aktif()
returns table (id uuid, order_id uuid, craftsman_id uuid, category_id uuid, gender public.gender_category,
               status public.item_status, assigned_date date, production_month date,
               tgl_selesai date, tgl_serah date)
language sql stable security invoker set search_path = '' as $$
  select i.id, i.order_id, i.craftsman_id, i.category_id, i.gender, i.status, i.assigned_date, i.production_month,
         public.tgl_lokal(i.completed_at), public.tgl_lokal(i.delivered_at)
  from public.order_items i join public.orders o on o.id = i.order_id
  where i.cancelled_at is null and o.cancelled_at is null and o.deleted_at is null;
$$;

create or replace function public.statistik_dashboard(p_dari date, p_sampai date)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  r     jsonb;
  v_now date := public.hari_ini();
  v_bln date := date_trunc('month', public.hari_ini())::date;
begin
  perform public.pastikan_admin();
  if p_dari is null or p_sampai is null or p_dari > p_sampai then
    raise exception 'Rentang tanggal tidak valid.' using errcode = '22023';
  end if;
  with a as (select * from public._barang_aktif()),
       p as (select * from a where a.assigned_date between p_dari and p_sampai)
  select jsonb_build_object(
    'periode', jsonb_build_object('dari', p_dari, 'sampai', p_sampai),
    'total_order',              (select count(distinct p.order_id) from p),
    'total_barang',             (select count(*) from p),
    'dalam_proses',             (select count(*) from p where p.status = 'dalam_proses'),
    'selesai_belum_diserahkan', (select count(*) from p where p.status = 'selesai'),
    'sudah_diserahkan',         (select count(*) from p where p.status = 'diserahkan'),
    'selesai_dikerjakan',       (select count(*) from p where p.status in ('selesai', 'diserahkan')),
    'belum_diserahkan',         (select count(*) from p where p.status <> 'diserahkan'),
    'selesai_pada_periode',     (select count(*) from a where a.tgl_selesai between p_dari and p_sampai),
    'diserahkan_pada_periode',  (select count(*) from a where a.tgl_serah between p_dari and p_sampai),
    'pengrajin_aktif',          (select count(*) from public.craftsmen c where c.is_active and c.deleted_at is null),
    'order_bulan_ini',          (select count(distinct a.order_id) from a where a.assigned_date between v_bln and v_now),
    'saat_ini', jsonb_build_object(
        'dalam_proses',    (select count(*) from a where a.status = 'dalam_proses'),
        'siap_diserahkan', (select count(*) from a where a.status = 'selesai'),
        'sudah_diserahkan',(select count(*) from a where a.status = 'diserahkan'),
        'total_barang',    (select count(*) from a))
  ) into r;
  return r;
end $$;

-- Grafik per bulan di antara dua tanggal (bulan pertama s.d. bulan terakhir).
create or replace function public.statistik_bulanan(p_dari date, p_sampai date)
returns table (bulan date, order_masuk bigint, barang_masuk bigint, barang_selesai bigint, barang_diserahkan bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  if p_dari is null or p_sampai is null or p_dari > p_sampai then
    raise exception 'Rentang tanggal tidak valid.' using errcode = '22023';
  end if;
  return query
  with a as (select * from public._barang_aktif()),
       m as (select gs::date as bulan
             from generate_series(date_trunc('month', p_dari), date_trunc('month', p_sampai), interval '1 month') gs)
  select m.bulan,
    (select count(distinct a.order_id) from a where date_trunc('month', a.assigned_date) = m.bulan),
    (select count(*) from a where date_trunc('month', a.assigned_date) = m.bulan),
    (select count(*) from a where date_trunc('month', a.tgl_selesai) = m.bulan),
    (select count(*) from a where date_trunc('month', a.tgl_serah) = m.bulan)
  from m order by m.bulan;
end $$;

-- Produktivitas tiap pengrajin dalam periode.
create or replace function public.produktivitas_pengrajin(p_dari date, p_sampai date)
returns table (craftsman_id uuid, code text, name text, is_active boolean,
               ditugaskan bigint, selesai_pada_periode bigint, diserahkan_pada_periode bigint,
               sedang_dikerjakan bigint, rata_hari_selesai numeric)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  if p_dari is null or p_sampai is null or p_dari > p_sampai then
    raise exception 'Rentang tanggal tidak valid.' using errcode = '22023';
  end if;
  return query
  with a as (select * from public._barang_aktif())
  select c.id, c.code, c.name, c.is_active,
    count(a.id) filter (where a.assigned_date between p_dari and p_sampai),
    count(a.id) filter (where a.tgl_selesai between p_dari and p_sampai),
    count(a.id) filter (where a.tgl_serah between p_dari and p_sampai),
    count(a.id) filter (where a.status = 'dalam_proses'),
    round(avg((a.tgl_selesai - a.assigned_date)::numeric) filter (where a.tgl_selesai between p_dari and p_sampai), 1)
  from public.craftsmen c
  left join a on a.craftsman_id = c.id
  where c.deleted_at is null
  group by c.id
  order by c.code;
end $$;

-- Rincian per kategori dan gender dalam periode.
create or replace function public.statistik_kategori(p_dari date, p_sampai date)
returns table (category_id uuid, category_name text, gender public.gender_category, jumlah bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  return query
  select k.id, k.name, a.gender, count(*)
  from public._barang_aktif() a join public.jewelry_categories k on k.id = a.category_id
  where a.assigned_date between p_dari and p_sampai
  group by k.id, k.name, k.sort_order, a.gender
  order by k.sort_order, a.gender;
end $$;

-- =====================================================================
-- Pencarian global. Semua kata harus cocok (di kolom mana saja).
-- Mencari: nomor order, nama/ID pengrajin, nama/WA pelanggan, kategori, status.
-- =====================================================================
create or replace function public.cari_global(p_q text, p_batas int default 50)
returns setof public.v_items
language plpgsql stable security invoker set search_path = '' as $$
declare kata text[];
begin
  perform public.pastikan_admin();
  kata := array(select k from regexp_split_to_table(lower(btrim(coalesce(p_q, ''))), '\s+') k where k <> '');
  if array_length(kata, 1) is null then
    return;
  end if;
  return query
  select v.* from public.v_items v
  where (
    select bool_and(
      lower(concat_ws(' ', v.order_number, v.customer_name, v.customer_whatsapp, v.craftsman_code,
                      replace(v.craftsman_code, ' ', ''), v.craftsman_name, v.category_name, v.status_label,
                      v.gender, v.description)) like '%' || k || '%'
      or (k ~ '^[0-9+]{4,}$' and v.customer_whatsapp like '%' || coalesce(public.normalize_wa(k), k) || '%'))
    from unnest(kata) k)
  order by v.is_active desc, v.updated_at desc
  limit greatest(1, least(coalesce(p_batas, 50), 200));
end $$;

-- >>>>>>>>>> 20261110000600_data_awal.sql
-- =====================================================================
-- Migrasi 6: data awal (aman dijalankan berulang, tidak menggandakan data)
-- =====================================================================

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- 8 kategori perhiasan, urut sesuai permintaan.
insert into public.jewelry_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('PREMIUM', 1), ('HIGH', 2), ('SULTAN', 3), ('LUXURY', 4),
  ('LIONTIN', 5), ('COUPLE', 6), ('BRACELET', 7), ('SPESIAL ITEM', 8)
) as v(name, sort_order)
where not exists (select 1 from public.jewelry_categories k where upper(k.name) = v.name);

-- 9 slot pengrajin. IDS 008 dan IDS 009 sengaja tanpa nama (belum diberikan).
insert into public.craftsmen (code, name)
select v.code, v.name
from (values
  ('IDS 001', 'Haji Iskandar'),
  ('IDS 002', 'Hafizurrahman'),
  ('IDS 003', 'Rif''an'),
  ('IDS 004', 'Ahmad Rifqi'),
  ('IDS 005', 'Khairin'),
  ('IDS 006', 'Rofii'),
  ('IDS 007', 'Riy'),
  ('IDS 008', null),
  ('IDS 009', null)
) as v(code, name)
where not exists (
  select 1 from public.craftsmen c
  where public.normalize_code(c.code) = v.code and c.deleted_at is null
);

-- >>>>>>>>>> 20261110000700_realtime_storage.sql
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

-- >>>>>>>>>> 20261110000800_hak_akses.sql
-- =====================================================================
-- Migrasi 8: hak akses (dijalankan paling akhir)
--   * anon (belum login): tidak bisa apa-apa.
--   * authenticated: boleh memanggil, tetapi RLS dan pastikan_admin()
--     memastikan hanya admin yang benar-benar mendapat data.
--   * Tidak ada hak DELETE untuk data usaha.
-- =====================================================================

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated;

grant select, update                 on public.profiles           to authenticated;
grant select, update                 on public.app_settings       to authenticated;
grant select, insert, update         on public.jewelry_categories to authenticated;
grant select, insert, update         on public.craftsmen          to authenticated;
grant select, insert, update         on public.orders             to authenticated;
grant select, insert, update         on public.order_items        to authenticated;
grant select                         on public.activity_logs      to authenticated;
grant select on public.v_items, public.v_orders, public.v_craftsmen to authenticated;

-- Kolom peran tidak boleh diubah dari aplikasi (dijaga juga oleh trigger).
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

grant execute on all functions in schema public to authenticated;
-- Fungsi khusus pemilik database, tidak boleh dipanggil dari aplikasi.
revoke execute on function public.jadikan_admin(text) from authenticated;
revoke execute on function public.tulis_log(text, text, uuid, uuid, uuid, uuid, jsonb, jsonb, text) from authenticated;

-- Objek yang dibuat nanti tidak otomatis terbuka untuk anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
