-- =====================================================================
-- Migrasi 12: stok barang jadi (katalog perhiasan)
--   * Setiap model perhiasan (misalnya Premium Man 01) punya jumlah stok yang tersedia.
--   * Stok hanya berubah lewat penambahan/pengurangan yang tercatat (riwayat stok), tidak bisa minus.
--   * Isi awal: 49 model dari katalog, stok 0, foto dari katalog.
-- Aman dijalankan ulang.
-- =====================================================================

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  name         text not null,
  class        text not null,
  kind         text not null default 'Cincin',
  gender       public.gender_category,
  photo_static text,
  photo_path   text,
  stock        integer not null default 0,
  notes        text,
  sort_order   integer not null default 1000,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint products_stock_check check (stock >= 0 and stock <= 100000),
  constraint products_class_check check (class in ('PREMIUM', 'HIGH', 'LUXURY', 'SULTAN', 'COUPLE', 'SPESIAL', 'LAINNYA')),
  constraint products_kind_check check (kind in ('Cincin', 'Giwang', 'Liontin', 'Gelang', 'Kalung', 'Lainnya')),
  constraint products_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint products_code_check check (code ~ '^[A-Z0-9-]{2,20}$'),
  constraint products_notes_check check (notes is null or char_length(notes) <= 300)
);
create unique index if not exists products_code_uq on public.products (code) where deleted_at is null;

create table if not exists public.product_stock_moves (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete restrict,
  delta       integer not null,
  stock_after integer not null,
  reason      text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint product_stock_moves_delta_check check (delta <> 0),
  constraint product_stock_moves_reason_check check (reason is null or char_length(reason) <= 200)
);
create index if not exists product_stock_moves_product_ix on public.product_stock_moves (product_id, created_at desc);

create or replace function public.products_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is not null then
      raise exception 'Barang ini ada di Sampah. Pulihkan dulu bila ingin mengubahnya.' using errcode = 'P0001';
    end if;
    if old.deleted_at < now() - public.masa_sampah() then
      raise exception 'Barang ini sudah lebih dari 7 hari di Sampah dan tidak bisa dipulihkan.' using errcode = 'P0001', hint = 'IDS_SAMPAH_KEDALUWARSA';
    end if;
    if exists (select 1 from public.products p where p.id <> new.id and p.deleted_at is null and p.code = new.code) then
      raise exception 'Kode % sudah dipakai barang lain. Ubah dulu kode barang yang lain itu.', new.code using errcode = '23505', hint = 'IDS_KODE_DUPLIKAT';
    end if;
    return new;
  end if;
  new.code  := upper(regexp_replace(btrim(new.code), '\s+', '-', 'g'));
  new.name  := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'UPDATE' then
    -- Stok hanya boleh berubah lewat fungsi ubah_stok_produk (supaya selalu tercatat).
    if new.stock is distinct from old.stock and coalesce(current_setting('ids.ubah_stok', true), '') <> 'ya' then
      raise exception 'Stok diubah lewat tombol tambah/kurangi stok supaya tercatat di riwayat.' using errcode = 'P0001';
    end if;
    new.created_at := old.created_at;
  elsif new.stock <> 0 and coalesce(current_setting('ids.ubah_stok', true), '') <> 'ya' then
    raise exception 'Barang baru dimulai dengan stok 0, lalu ditambah lewat tombol tambah stok.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.products p where p.id <> new.id and p.deleted_at is null and p.code = new.code) then
    raise exception 'Kode % sudah dipakai barang lain.', new.code using errcode = '23505', hint = 'IDS_KODE_DUPLIKAT';
  end if;
  return new;
end $$;
drop trigger if exists products_before on public.products;
create trigger products_before before insert or update on public.products
  for each row execute function public.products_before();
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
drop trigger if exists products_no_delete on public.products;
create trigger products_no_delete before delete on public.products
  for each row execute function public.tolak_hapus_permanen();
drop trigger if exists product_stock_moves_no_delete on public.product_stock_moves;
create trigger product_stock_moves_no_delete before update or delete on public.product_stock_moves
  for each row execute function public.tolak_hapus_permanen();

create or replace function public.log_products()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := jsonb_build_object('kode', new.code, 'nama', new.name);
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('produk_ditambahkan', 'product', new.id, null, null, null, null, v);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('produk_dihapus', 'product', new.id, null, null, null, null, v);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('produk_dipulihkan', 'product', new.id, null, null, null, null, v);
  elsif (old.code, old.name, old.class, old.kind, old.gender, old.notes, old.photo_path)
        is distinct from (new.code, new.name, new.class, new.kind, new.gender, new.notes, new.photo_path) then
    perform public.tulis_log('produk_diubah', 'product', new.id, null, null, null,
      jsonb_build_object('kode', old.code, 'nama', old.name), v);
  end if;
  return new;
end $$;
drop trigger if exists log_products on public.products;
create trigger log_products after insert or update on public.products
  for each row execute function public.log_products();

-- Menambah (delta positif) atau mengurangi (delta negatif) stok, dengan riwayat. Mengembalikan stok baru.
create or replace function public.ubah_stok_produk(p_produk uuid, p_delta integer, p_alasan text default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_stok integer; v_nama text;
begin
  perform public.pastikan_admin();
  if p_delta is null or p_delta = 0 then
    raise exception 'Jumlah perubahan stok tidak boleh nol.' using errcode = '22023';
  end if;
  select p.stock, p.name into v_stok, v_nama from public.products p where p.id = p_produk and p.deleted_at is null for update;
  if not found then
    raise exception 'Barang tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_stok + p_delta < 0 then
    raise exception 'Stok % tinggal %, tidak bisa dikurangi %.', v_nama, v_stok, abs(p_delta) using errcode = 'P0001', hint = 'IDS_STOK_KURANG';
  end if;
  perform set_config('ids.ubah_stok', 'ya', true);
  update public.products set stock = v_stok + p_delta where id = p_produk;
  perform set_config('ids.ubah_stok', '', true);
  insert into public.product_stock_moves (product_id, delta, stock_after, reason)
  values (p_produk, p_delta, v_stok + p_delta, nullif(btrim(p_alasan), ''));
  return v_stok + p_delta;
end $$;

-- Riwayat aktivitas untuk setiap perubahan stok (ditulis oleh pemicu, dengan hak penulis log).
create or replace function public.log_product_stock_moves()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.tulis_log('stok_produk_diubah', 'product', new.product_id, null, null, null,
    jsonb_build_object('stok', new.stock_after - new.delta),
    jsonb_build_object('stok', new.stock_after, 'perubahan', new.delta, 'alasan', new.reason));
  return new;
end $$;
drop trigger if exists log_product_stock_moves on public.product_stock_moves;
create trigger log_product_stock_moves after insert on public.product_stock_moves
  for each row execute function public.log_product_stock_moves();

create or replace function public.hapus_produk(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.products set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Barang tidak ditemukan atau sudah di Sampah.' using errcode = 'P0002';
  end if;
end $$;

-- -------------------------------------------------- keamanan dan akses
alter table public.products enable row level security;
alter table public.product_stock_moves enable row level security;
drop policy if exists products_select on public.products;
create policy products_select on public.products for select to authenticated using ((select public.is_admin()));
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated with check ((select public.is_admin()));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists product_stock_moves_select on public.product_stock_moves;
create policy product_stock_moves_select on public.product_stock_moves for select to authenticated using ((select public.is_admin()));
drop policy if exists product_stock_moves_insert on public.product_stock_moves;
create policy product_stock_moves_insert on public.product_stock_moves for insert to authenticated with check ((select public.is_admin()));
revoke all on public.products, public.product_stock_moves from anon, authenticated, public;
grant select, insert, update on public.products to authenticated;
grant select, insert on public.product_stock_moves to authenticated;
do $$
declare t text;
begin
  foreach t in array array['products'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ Sampah
create or replace function public.pulihkan_sampah(p_jenis text, p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  if p_jenis = 'order' then
    update public.orders set deleted_at = null where id = p_id and deleted_at is not null;
  elsif p_jenis = 'barang' then
    update public.order_items set deleted_at = null where id = p_id and deleted_at is not null;
  elsif p_jenis = 'pengrajin' then
    update public.craftsmen set deleted_at = null where id = p_id and deleted_at is not null;
  elsif p_jenis = 'pembelian' then
    update public.silver_purchases set deleted_at = null where id = p_id and deleted_at is not null;
  elsif p_jenis = 'nota' then
    update public.manual_notes set deleted_at = null where id = p_id and deleted_at is not null;
  elsif p_jenis = 'produk' then
    update public.products set deleted_at = null where id = p_id and deleted_at is not null;
  else
    raise exception 'Jenis tidak dikenal.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Data tidak ditemukan di Sampah.' using errcode = 'P0002';
  end if;
end $$;

create or replace view public.v_sampah with (security_invoker = true) as
select 'order'::text as jenis, o.id, o.id as order_id, o.order_number, null::integer as item_no, o.customer_name,
       (select count(*) from public.order_items x where x.order_id = o.id and x.deleted_at is null) as jumlah_barang,
       null::text as category_name, null::text as craftsman_code,
       o.deleted_at, o.deleted_at + public.masa_sampah() as hilang_pada
from public.orders o
where o.deleted_at is not null and o.deleted_at > now() - public.masa_sampah()
union all
select 'barang', i.id, i.order_id, o.order_number, i.item_no, o.customer_name, 1, k.name, c.code,
       i.deleted_at, i.deleted_at + public.masa_sampah()
from public.order_items i
join public.orders o on o.id = i.order_id
join public.jewelry_categories k on k.id = i.category_id
join public.craftsmen c on c.id = i.craftsman_id
where i.deleted_at is not null and o.deleted_at is null and i.deleted_at > now() - public.masa_sampah()
union all
select 'pengrajin', c.id, null::uuid, null::text, null::integer, c.name,
       (select count(*) from public.order_items x where x.craftsman_id = c.id and x.deleted_at is null), null::text, c.code,
       c.deleted_at, c.deleted_at + public.masa_sampah()
from public.craftsmen c
where c.deleted_at is not null and c.deleted_at > now() - public.masa_sampah()
union all
select 'pembelian', p.id, null::uuid, null::text, null::integer, to_char(p.purchase_date, 'DD-MM-YYYY'),
       p.grams::bigint, null::text, c.code,
       p.deleted_at, p.deleted_at + public.masa_sampah()
from public.silver_purchases p
join public.craftsmen c on c.id = p.craftsman_id
where p.deleted_at is not null and p.deleted_at > now() - public.masa_sampah()
union all
select 'nota', n.id, null::uuid, n.note_no::text, null::integer, n.recipient,
       jsonb_array_length(n.lines)::bigint, null::text, null::text,
       n.deleted_at, n.deleted_at + public.masa_sampah()
from public.manual_notes n
where n.deleted_at is not null and n.deleted_at > now() - public.masa_sampah()
union all
select 'produk', p.id, null::uuid, p.code, null::integer, p.name,
       p.stock::bigint, p.class, null::text,
       p.deleted_at, p.deleted_at + public.masa_sampah()
from public.products p
where p.deleted_at is not null and p.deleted_at > now() - public.masa_sampah();

revoke all on public.v_sampah from anon, authenticated, public;
grant select on public.v_sampah to authenticated;
grant execute on function public.ubah_stok_produk(uuid, integer, text), public.hapus_produk(uuid), public.pulihkan_sampah(text, uuid) to authenticated;
revoke execute on function public.ubah_stok_produk(uuid, integer, text), public.hapus_produk(uuid), public.pulihkan_sampah(text, uuid) from anon, public;

-- ------------------------------------------------- isi awal: katalog
insert into public.products (code, name, class, kind, gender, photo_static, sort_order)
select v.code, v.name, v.class, v.kind, v.gender::public.gender_category, v.photo, v.urut
from (values
  ('PR-M01', 'Premium Man 01', 'PREMIUM', 'Cincin', 'MAN', 'katalog/v1/pr-m01.jpg', 1),
  ('PR-M02', 'Premium Man 02', 'PREMIUM', 'Cincin', 'MAN', 'katalog/v1/pr-m02.jpg', 2),
  ('PR-M03', 'Premium Man 03', 'PREMIUM', 'Cincin', 'MAN', 'katalog/v1/pr-m03.jpg', 3),
  ('PR-M04', 'Premium Man 04', 'PREMIUM', 'Cincin', 'MAN', 'katalog/v1/pr-m04.jpg', 4),
  ('PR-L01', 'Premium Lady 01', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l01.jpg', 5),
  ('PR-L02', 'Premium Lady 02', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l02.jpg', 6),
  ('PR-L03', 'Premium Lady 03', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l03.jpg', 7),
  ('PR-L04', 'Premium Lady 04', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l04.jpg', 8),
  ('PR-L05', 'Premium Lady 05', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l05.jpg', 9),
  ('PR-L06', 'Premium Lady 06', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l06.jpg', 10),
  ('PR-L07', 'Premium Lady 07', 'PREMIUM', 'Cincin', 'LADY', 'katalog/v1/pr-l07.jpg', 11),
  ('PR-GW01', 'Giwang Premium 01', 'PREMIUM', 'Giwang', 'LADY', 'katalog/v1/pr-gw01.jpg', 12),
  ('PR-LT01', 'Liontin Premium 01', 'PREMIUM', 'Liontin', 'LADY', 'katalog/v1/pr-lt01.jpg', 13),
  ('PR-LT02', 'Liontin Premium 02', 'PREMIUM', 'Liontin', 'LADY', 'katalog/v1/pr-lt02.jpg', 14),
  ('PR-LT03', 'Liontin Premium 03', 'PREMIUM', 'Liontin', 'LADY', 'katalog/v1/pr-lt03.jpg', 15),
  ('HI-M01', 'High Man 01', 'HIGH', 'Cincin', 'MAN', 'katalog/v1/hi-m01.jpg', 16),
  ('HI-M02', 'High Man 02', 'HIGH', 'Cincin', 'MAN', 'katalog/v1/hi-m02.jpg', 17),
  ('HI-M03', 'High Man 03', 'HIGH', 'Cincin', 'MAN', 'katalog/v1/hi-m03.jpg', 18),
  ('HI-M04', 'High Man 04', 'HIGH', 'Cincin', 'MAN', 'katalog/v1/hi-m04.jpg', 19),
  ('HI-M05', 'High Man 05', 'HIGH', 'Cincin', 'MAN', 'katalog/v1/hi-m05.jpg', 20),
  ('HI-M06', 'High Man 06', 'HIGH', 'Cincin', 'MAN', 'katalog/v1/hi-m06.jpg', 21),
  ('HI-L01', 'High Lady 01', 'HIGH', 'Cincin', 'LADY', 'katalog/v1/hi-l01.jpg', 22),
  ('HI-L02', 'High Lady 02', 'HIGH', 'Cincin', 'LADY', 'katalog/v1/hi-l02.jpg', 23),
  ('HI-L03', 'High Lady 03', 'HIGH', 'Cincin', 'LADY', 'katalog/v1/hi-l03.jpg', 24),
  ('HI-L04', 'High Lady 04', 'HIGH', 'Cincin', 'LADY', 'katalog/v1/hi-l04.jpg', 25),
  ('HI-L05', 'High Lady 05', 'HIGH', 'Cincin', 'LADY', 'katalog/v1/hi-l05.jpg', 26),
  ('HI-L06', 'High Lady 06', 'HIGH', 'Cincin', 'LADY', 'katalog/v1/hi-l06.jpg', 27),
  ('HI-LT01', 'Liontin High 01', 'HIGH', 'Liontin', 'LADY', 'katalog/v1/hi-lt01.jpg', 28),
  ('HI-LT02', 'Liontin High 02', 'HIGH', 'Liontin', 'LADY', 'katalog/v1/hi-lt02.jpg', 29),
  ('HI-LT03', 'Liontin High 03', 'HIGH', 'Liontin', 'LADY', 'katalog/v1/hi-lt03.jpg', 30),
  ('LX-M01', 'Luxury Man 01', 'LUXURY', 'Cincin', 'MAN', 'katalog/v1/lx-m01.jpg', 31),
  ('LX-M02', 'Luxury Man 02', 'LUXURY', 'Cincin', 'MAN', 'katalog/v1/lx-m02.jpg', 32),
  ('LX-M03', 'Luxury Man 03', 'LUXURY', 'Cincin', 'MAN', 'katalog/v1/lx-m03.jpg', 33),
  ('LX-M04', 'Luxury Man 04', 'LUXURY', 'Cincin', 'MAN', 'katalog/v1/lx-m04.jpg', 34),
  ('LX-L01', 'Luxury Lady 01', 'LUXURY', 'Cincin', 'LADY', 'katalog/v1/lx-l01.jpg', 35),
  ('LX-L02', 'Luxury Lady 02', 'LUXURY', 'Cincin', 'LADY', 'katalog/v1/lx-l02.jpg', 36),
  ('LX-L03', 'Luxury Lady 03', 'LUXURY', 'Cincin', 'LADY', 'katalog/v1/lx-l03.jpg', 37),
  ('LX-L04', 'Luxury Lady 04', 'LUXURY', 'Cincin', 'LADY', 'katalog/v1/lx-l04.jpg', 38),
  ('LX-L05', 'Luxury Lady 05', 'LUXURY', 'Cincin', 'LADY', 'katalog/v1/lx-l05.jpg', 39),
  ('CP-01', 'Couple 01', 'COUPLE', 'Cincin', null, 'katalog/v1/cp-01.jpg', 40),
  ('SL-L01', 'Sultan Lady 01', 'SULTAN', 'Cincin', 'LADY', 'katalog/v1/sl-l01.jpg', 41),
  ('SL-L02', 'Sultan Lady 02', 'SULTAN', 'Cincin', 'LADY', 'katalog/v1/sl-l02.jpg', 42),
  ('SL-L03', 'Sultan Lady 03', 'SULTAN', 'Cincin', 'LADY', 'katalog/v1/sl-l03.jpg', 43),
  ('SL-L04', 'Sultan Lady 04', 'SULTAN', 'Cincin', 'LADY', 'katalog/v1/sl-l04.jpg', 44),
  ('SL-M01', 'Sultan Man 01', 'SULTAN', 'Cincin', 'MAN', 'katalog/v1/sl-m01.jpg', 45),
  ('SL-M02', 'Sultan Man 02', 'SULTAN', 'Cincin', 'MAN', 'katalog/v1/sl-m02.jpg', 46),
  ('SL-BR01', 'Bracelet Sultan 01', 'SULTAN', 'Gelang', 'LADY', 'katalog/v1/sl-br01.jpg', 47),
  ('SL-BR02', 'Bracelet Sultan 02', 'SULTAN', 'Gelang', 'LADY', 'katalog/v1/sl-br02.jpg', 48),
  ('DS-M01', 'Double Sultan Man 01', 'SPESIAL', 'Cincin', 'MAN', 'katalog/v1/ds-m01.jpg', 49)
) as v(code, name, class, kind, gender, photo, urut)
where not exists (select 1 from public.products p where p.code = v.code);
