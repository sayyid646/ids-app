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
-- Berat barang (gram). Aturan minimalnya ada di migrasi 10.
alter table public.order_items add column if not exists weight_grams numeric(8,2);
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
