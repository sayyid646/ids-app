-- =====================================================================
-- Migrasi 11: stok perak setiap pengrajin dan nota manual
--   * Pemakaian perak = berat (gram) setiap barang yang diberikan ke pengrajin,
--     dicatat pada tanggal barang diberikan. Tidak ada pencatatan kedua, jadi tidak bisa ganda.
--   * Pembelian perak dicatat per pengrajin, kelipatan 50 gram.
--   * Sisa stok = total pembelian - total pemakaian, dihitung otomatis.
--   * Nota manual (menu Nota) disimpan supaya bisa dibuka, diubah, dan dicetak lagi.
-- Aman dijalankan ulang.
-- =====================================================================

-- Pemakaian standar per gender (nilai awal yang terisi otomatis, bisa diubah per barang).
alter table public.app_settings add column if not exists silver_lady_grams numeric(7,2) not null default 6;
alter table public.app_settings add column if not exists silver_man_grams  numeric(7,2) not null default 12;
alter table public.app_settings drop constraint if exists app_settings_silver_default_check;
alter table public.app_settings add constraint app_settings_silver_default_check
  check (silver_lady_grams > 0 and silver_lady_grams <= 1000 and silver_man_grams > 0 and silver_man_grams <= 1000);

-- ------------------------------------------------- pembelian perak
create table if not exists public.silver_purchases (
  id            uuid primary key default gen_random_uuid(),
  craftsman_id  uuid not null references public.craftsmen (id) on delete restrict,
  purchase_date date not null default public.hari_ini(),
  grams         numeric(10,2) not null,
  notes         text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint silver_purchases_grams_check check (grams >= 50 and grams <= 1000000 and mod(grams, 50) = 0),
  constraint silver_purchases_notes_check check (notes is null or char_length(notes) <= 300)
);
create index if not exists silver_purchases_craftsman_ix on public.silver_purchases (craftsman_id, purchase_date) where deleted_at is null;

create or replace function public.silver_purchases_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is not null then
      raise exception 'Pembelian ini ada di Sampah. Pulihkan dulu bila ingin mengubahnya.' using errcode = 'P0001';
    end if;
    if old.deleted_at < now() - public.masa_sampah() then
      raise exception 'Pembelian ini sudah lebih dari 7 hari di Sampah dan tidak bisa dipulihkan.' using errcode = 'P0001', hint = 'IDS_SAMPAH_KEDALUWARSA';
    end if;
    if exists (select 1 from public.craftsmen c where c.id = new.craftsman_id and c.deleted_at is not null) then
      raise exception 'Pengrajin pembelian ini ada di Sampah. Pulihkan pengrajinnya dulu.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'INSERT' or new.craftsman_id is distinct from old.craftsman_id then
    if not exists (select 1 from public.craftsmen c where c.id = new.craftsman_id and c.deleted_at is null) then
      raise exception 'Pengrajin tidak ditemukan atau sudah dihapus.' using errcode = 'P0002';
    end if;
  end if;
  if new.purchase_date > public.hari_ini() then
    raise exception 'Tanggal pembelian tidak boleh melewati hari ini.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists silver_purchases_before on public.silver_purchases;
create trigger silver_purchases_before before insert or update on public.silver_purchases
  for each row execute function public.silver_purchases_before();
drop trigger if exists silver_purchases_updated_at on public.silver_purchases;
create trigger silver_purchases_updated_at before update on public.silver_purchases
  for each row execute function public.set_updated_at();
drop trigger if exists silver_purchases_no_delete on public.silver_purchases;
create trigger silver_purchases_no_delete before delete on public.silver_purchases
  for each row execute function public.tolak_hapus_permanen();

create or replace function public.log_silver_purchases()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  v := jsonb_build_object('pengrajin', public.info_pengrajin(new.craftsman_id), 'tanggal', new.purchase_date, 'gram', new.grams);
  if tg_op = 'INSERT' then
    perform public.tulis_log('perak_dibeli', 'silver_purchase', new.id, null, null, new.craftsman_id, null, v);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('perak_dihapus', 'silver_purchase', new.id, null, null, new.craftsman_id, null, v);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('perak_dipulihkan', 'silver_purchase', new.id, null, null, new.craftsman_id, null, v);
  elsif (old.purchase_date, old.grams, old.notes) is distinct from (new.purchase_date, new.grams, new.notes) then
    perform public.tulis_log('perak_diubah', 'silver_purchase', new.id, null, null, new.craftsman_id,
      jsonb_build_object('tanggal', old.purchase_date, 'gram', old.grams, 'catatan', old.notes),
      jsonb_build_object('tanggal', new.purchase_date, 'gram', new.grams, 'catatan', new.notes));
  end if;
  return new;
end $$;
drop trigger if exists log_silver_purchases on public.silver_purchases;
create trigger log_silver_purchases after insert or update on public.silver_purchases
  for each row execute function public.log_silver_purchases();

-- ------------------------------------------------------ nota manual
create table if not exists public.manual_notes (
  id          uuid primary key default gen_random_uuid(),
  note_no     integer generated by default as identity,
  note_date   date not null default public.hari_ini(),
  recipient   text,
  lines       jsonb not null default '[]'::jsonb,
  total       numeric(16,2) not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint manual_notes_lines_check check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200),
  constraint manual_notes_recipient_check check (recipient is null or char_length(recipient) <= 120)
);

-- Baris nota: [{"banyak": 2, "nama": "Cincin", "harga": 150000}]. Jumlah dan total dihitung di sini,
-- jadi angka yang tersimpan selalu cocok dengan isinya.
create or replace function public.manual_notes_before()
returns trigger language plpgsql set search_path = '' as $$
declare b jsonb; v_total numeric := 0; v_banyak numeric; v_harga numeric; v_baris jsonb := '[]'::jsonb;
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is not null then
      raise exception 'Nota ini ada di Sampah. Pulihkan dulu bila ingin mengubahnya.' using errcode = 'P0001';
    end if;
    if old.deleted_at < now() - public.masa_sampah() then
      raise exception 'Nota ini sudah lebih dari 7 hari di Sampah dan tidak bisa dipulihkan.' using errcode = 'P0001', hint = 'IDS_SAMPAH_KEDALUWARSA';
    end if;
    return new;
  end if;
  for b in select * from jsonb_array_elements(new.lines) loop
    if jsonb_typeof(b) <> 'object' then
      raise exception 'Baris nota tidak valid.' using errcode = '22023';
    end if;
    begin
      v_banyak := coalesce(nullif(b ->> 'banyak', '')::numeric, 0);
      v_harga  := coalesce(nullif(b ->> 'harga', '')::numeric, 0);
    exception when others then
      raise exception 'Banyaknya dan harga pada nota harus berupa angka.' using errcode = '22023';
    end;
    if v_banyak < 0 or v_harga < 0 then
      raise exception 'Banyaknya dan harga tidak boleh minus.' using errcode = '22023';
    end if;
    if char_length(coalesce(b ->> 'nama', '')) > 200 then
      raise exception 'Nama barang maksimal 200 huruf.' using errcode = '22023';
    end if;
    v_baris := v_baris || jsonb_build_object('banyak', v_banyak, 'nama', btrim(coalesce(b ->> 'nama', '')), 'harga', v_harga,
                                             'jumlah', round(v_banyak * v_harga, 2));
    v_total := v_total + round(v_banyak * v_harga, 2);
  end loop;
  new.lines := v_baris;
  new.total := v_total;
  new.recipient := nullif(btrim(new.recipient), '');
  if tg_op = 'UPDATE' then
    new.note_no := old.note_no;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists manual_notes_before on public.manual_notes;
create trigger manual_notes_before before insert or update on public.manual_notes
  for each row execute function public.manual_notes_before();
drop trigger if exists manual_notes_updated_at on public.manual_notes;
create trigger manual_notes_updated_at before update on public.manual_notes
  for each row execute function public.set_updated_at();
drop trigger if exists manual_notes_no_delete on public.manual_notes;
create trigger manual_notes_no_delete before delete on public.manual_notes
  for each row execute function public.tolak_hapus_permanen();

create or replace function public.log_manual_notes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := jsonb_build_object('nomor', new.note_no, 'tanggal', new.note_date, 'kepada', new.recipient, 'total', new.total);
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('nota_dibuat', 'manual_note', new.id, null, null, null, null, v);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('nota_dihapus', 'manual_note', new.id, null, null, null, null, v);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('nota_dipulihkan', 'manual_note', new.id, null, null, null, null, v);
  elsif (old.note_date, old.recipient, old.lines) is distinct from (new.note_date, new.recipient, new.lines) then
    perform public.tulis_log('nota_diubah', 'manual_note', new.id, null, null, null,
      jsonb_build_object('total', old.total), jsonb_build_object('total', new.total));
  end if;
  return new;
end $$;
drop trigger if exists log_manual_notes on public.manual_notes;
create trigger log_manual_notes after insert or update on public.manual_notes
  for each row execute function public.log_manual_notes();

-- -------------------------------------------------- keamanan dan akses
alter table public.silver_purchases enable row level security;
alter table public.manual_notes enable row level security;
do $$
declare t text;
begin
  foreach t in array array['silver_purchases', 'manual_notes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_admin()))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_update', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------ pemakaian dan stok
-- Setiap barang aktif yang punya berat = pemakaian perak pengrajinnya pada tanggal barang diberikan.
create or replace view public.v_pemakaian_perak with (security_invoker = true) as
select i.id as item_id, i.craftsman_id, c.code as craftsman_code, c.name as craftsman_name,
       i.assigned_date as tanggal, i.order_id, o.order_number, i.item_no,
       k.name as category_name, i.gender, i.status, i.weight_grams as gram
from public.order_items i
join public.orders o              on o.id = i.order_id
join public.craftsmen c           on c.id = i.craftsman_id
join public.jewelry_categories k  on k.id = i.category_id
where i.weight_grams is not null
  and i.deleted_at is null and i.cancelled_at is null
  and o.deleted_at is null and o.cancelled_at is null;

create or replace view public.v_pembelian_perak with (security_invoker = true) as
select p.id, p.craftsman_id, c.code as craftsman_code, c.name as craftsman_name,
       p.purchase_date as tanggal, p.grams as gram, p.notes, p.created_at
from public.silver_purchases p
join public.craftsmen c on c.id = p.craftsman_id
where p.deleted_at is null;

-- Laporan perak satu bulan untuk semua pengrajin.
--   stok_awal  = sisa sebelum bulan itu
--   stok_akhir = stok_awal + beli_bulan - pakai_bulan (sisa di akhir bulan)
--   stok_sekarang = semua pembelian - semua pemakaian sampai hari ini
create or replace function public.laporan_perak(p_bulan date)
returns table (craftsman_id uuid, code text, name text, is_active boolean,
               stok_awal numeric, beli_bulan numeric, pakai_bulan numeric, stok_akhir numeric,
               total_beli numeric, total_pakai numeric, stok_sekarang numeric)
language sql stable security invoker set search_path = '' as $$
  with b as (select date_trunc('month', p_bulan)::date as awal,
                    (date_trunc('month', p_bulan) + interval '1 month')::date as akhir),
  beli as (
    select p.craftsman_id,
      sum(p.gram) filter (where p.tanggal < b.awal) as sebelum,
      sum(p.gram) filter (where p.tanggal >= b.awal and p.tanggal < b.akhir) as bulan,
      sum(p.gram) as semua
    from public.v_pembelian_perak p, b group by p.craftsman_id),
  pakai as (
    select u.craftsman_id,
      sum(u.gram) filter (where u.tanggal < b.awal) as sebelum,
      sum(u.gram) filter (where u.tanggal >= b.awal and u.tanggal < b.akhir) as bulan,
      sum(u.gram) as semua
    from public.v_pemakaian_perak u, b group by u.craftsman_id)
  select c.id, c.code, c.name, c.is_active,
    coalesce(beli.sebelum, 0) - coalesce(pakai.sebelum, 0),
    coalesce(beli.bulan, 0),
    coalesce(pakai.bulan, 0),
    coalesce(beli.sebelum, 0) - coalesce(pakai.sebelum, 0) + coalesce(beli.bulan, 0) - coalesce(pakai.bulan, 0),
    coalesce(beli.semua, 0),
    coalesce(pakai.semua, 0),
    coalesce(beli.semua, 0) - coalesce(pakai.semua, 0)
  from public.craftsmen c
  left join beli  on beli.craftsman_id = c.id
  left join pakai on pakai.craftsman_id = c.id
  where c.deleted_at is null
  order by c.code;
$$;

-- ------------------------------------------------------------ Sampah
create or replace function public.hapus_pembelian_perak(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.silver_purchases set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Pembelian tidak ditemukan atau sudah di Sampah.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.hapus_nota(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.manual_notes set deleted_at = now() where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Nota tidak ditemukan atau sudah di Sampah.' using errcode = 'P0002';
  end if;
end $$;

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
where n.deleted_at is not null and n.deleted_at > now() - public.masa_sampah();

revoke all on public.v_sampah, public.v_pemakaian_perak, public.v_pembelian_perak from anon, authenticated, public;
grant select on public.v_sampah, public.v_pemakaian_perak, public.v_pembelian_perak to authenticated;
grant execute on function public.laporan_perak(date), public.hapus_pembelian_perak(uuid), public.hapus_nota(uuid),
  public.pulihkan_sampah(text, uuid) to authenticated;
revoke execute on function public.laporan_perak(date), public.hapus_pembelian_perak(uuid), public.hapus_nota(uuid),
  public.pulihkan_sampah(text, uuid) from anon, public;
