-- =====================================================================
-- Migrasi 9: Sampah 7 hari dan ukuran nota A5
--   * Order atau barang yang dihapus masuk Sampah (kolom deleted_at).
--   * Selama 7 hari bisa dipulihkan. Setelah itu hilang permanen dari aplikasi
--     dan tidak bisa dipulihkan lagi. Catatan riwayat tetap ada.
--   * Data di Sampah tidak dihitung di dashboard, laporan, dan daftar.
-- Aman dijalankan ulang.
-- =====================================================================

alter table public.order_items add column if not exists deleted_at timestamptz;
create index if not exists order_items_deleted_ix on public.order_items (deleted_at) where deleted_at is not null;
create index if not exists orders_deleted_ix on public.orders (deleted_at) where deleted_at is not null;

-- Ukuran kertas A5 untuk nota.
alter table public.app_settings drop constraint if exists app_settings_receipt_paper_check;
alter table public.app_settings add constraint app_settings_receipt_paper_check
  check (receipt_paper in ('A4', 'A5', '80mm', '58mm'));

create or replace function public.masa_sampah()
returns interval language sql immutable set search_path = '' as $$ select interval '7 days' $$;

-- ------------------------------------------------------------- order
create or replace function public.orders_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    -- Order di Sampah hanya boleh dipulihkan, dan hanya dalam 7 hari.
    if new.deleted_at is not null then
      raise exception 'Order ini ada di Sampah. Pulihkan dulu bila ingin mengubahnya.' using errcode = 'P0001';
    end if;
    if old.deleted_at < now() - public.masa_sampah() then
      raise exception 'Order ini sudah lebih dari 7 hari di Sampah dan tidak bisa dipulihkan.' using errcode = 'P0001', hint = 'IDS_SAMPAH_KEDALUWARSA';
    end if;
    if exists (select 1 from public.orders o
               where o.id <> new.id and o.deleted_at is null and public.order_key(o.order_number) = public.order_key(new.order_number)) then
      raise exception 'Nomor order % sudah dipakai order lain. Ubah dulu nomor order yang lain itu.', new.order_number
        using errcode = '23505', hint = 'IDS_NOMOR_DUPLIKAT';
    end if;
    return new;
  end if;

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
    if old.cancelled_at is not null and new.cancelled_at is not null
       and (new.order_number, new.customer_name, new.customer_whatsapp)
           is distinct from (old.order_number, old.customer_name, old.customer_whatsapp) then
      raise exception 'Order yang sudah dibatalkan tidak bisa diubah. Pulihkan dulu bila perlu.' using errcode = 'P0001';
    end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- -------------------------------------------------------------- barang
-- Bungkus aturan barang yang lama: hapus/pulihkan barang hanya mengubah deleted_at.
create or replace function public.order_items_sampah()
returns trigger language plpgsql set search_path = '' as $$
declare v_order_hapus timestamptz;
begin
  if new.deleted_at is distinct from old.deleted_at then
    if (to_jsonb(new) - array['deleted_at', 'updated_at']) <> (to_jsonb(old) - array['deleted_at', 'updated_at']) then
      raise exception 'Hapus atau pulihkan barang tidak boleh bersamaan dengan perubahan lain.' using errcode = 'P0001';
    end if;
    if new.deleted_at is null then
      if old.deleted_at < now() - public.masa_sampah() then
        raise exception 'Barang ini sudah lebih dari 7 hari di Sampah dan tidak bisa dipulihkan.' using errcode = 'P0001', hint = 'IDS_SAMPAH_KEDALUWARSA';
      end if;
      select o.deleted_at into v_order_hapus from public.orders o where o.id = new.order_id;
      if v_order_hapus is not null then
        raise exception 'Order barang ini juga ada di Sampah. Pulihkan ordernya dulu.' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  if old.deleted_at is not null then
    raise exception 'Barang ini ada di Sampah. Pulihkan dulu bila ingin mengubahnya.' using errcode = 'P0001';
  end if;
  return public.order_items_before_inti(new, old, tg_op);
end $$;

-- Aturan barang lama dipindah ke fungsi biasa supaya bisa dipanggil dari pembungkus di atas.
do $$
declare src text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'order_items_before_inti') then
    select pg_get_functiondef('public.order_items_before()'::regprocedure) into src;
    src := replace(src, 'FUNCTION public.order_items_before()', 'FUNCTION public.order_items_before_inti(new public.order_items, old public.order_items, tg_op text)');
    src := replace(src, 'RETURNS trigger', 'RETURNS public.order_items');
    execute src;
  end if;
end $$;

-- Barang baru tetap melewati aturan lama (trigger di atas hanya menangani UPDATE dengan OLD).
create or replace function public.order_items_sampah_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  return public.order_items_before_inti(new, null, tg_op);
end $$;
drop trigger if exists order_items_before on public.order_items;
drop trigger if exists order_items_before_ins on public.order_items;
create trigger order_items_before_ins before insert on public.order_items
  for each row execute function public.order_items_sampah_insert();
drop trigger if exists order_items_before_upd on public.order_items;
create trigger order_items_before_upd before update on public.order_items
  for each row execute function public.order_items_sampah();

-- ------------------------------------------------------------ riwayat
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
    perform public.tulis_log('order_dipulihkan', 'order', new.id, new.id, null, null, jsonb_build_object('alasan_batal', old.cancel_reason), null);
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('order_dihapus', 'order', new.id, new.id, null, null, null, jsonb_build_object('waktu', new.deleted_at));
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('order_dipulihkan_sampah', 'order', new.id, new.id, null, null, jsonb_build_object('dihapus', old.deleted_at), null);
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

create or replace function public.log_order_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d    jsonb;
  skip text[] := array['updated_at', 'created_at', 'status', 'completed_at', 'delivered_at', 'craftsman_id',
                       'cancelled_at', 'cancel_reason', 'production_month_manual', 'deleted_at'];
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
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('barang_dihapus', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no));
    return new;
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('barang_dipulihkan_sampah', 'order_item', new.id, new.order_id, new.id, new.craftsman_id, null,
      jsonb_build_object('barang_ke', new.item_no));
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

-- ---------------------------------------------- tampilan tanpa Sampah
create or replace view public.v_items with (security_invoker = true) as
select
  i.id, i.order_id, o.order_number, o.customer_name, o.customer_whatsapp, i.item_no,
  i.craftsman_id, c.code as craftsman_code, c.name as craftsman_name,
  i.category_id, k.name as category_name, i.gender, i.description, i.assigned_date, i.production_month,
  extract(year from i.production_month)::int as production_year,
  extract(month from i.production_month)::int as production_month_no,
  i.production_month_manual, i.production_start_date, i.status, public.label_status(i.status) as status_label,
  i.completed_at, i.delivered_at, i.notes, i.photo_path, i.cancelled_at, i.cancel_reason,
  o.cancelled_at as order_cancelled_at,
  (i.cancelled_at is null and o.cancelled_at is null and o.deleted_at is null) as is_active,
  i.created_at, i.updated_at,
  i.weight_grams
from public.order_items i
join public.orders o              on o.id = i.order_id
join public.craftsmen c           on c.id = i.craftsman_id
join public.jewelry_categories k  on k.id = i.category_id
where o.deleted_at is null and i.deleted_at is null;

create or replace view public.v_orders with (security_invoker = true) as
select
  o.id, o.order_number, o.customer_name, o.customer_whatsapp, o.notes, o.cancelled_at, o.cancel_reason, o.created_at, o.updated_at,
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
left join public.order_items i          on i.order_id = o.id and i.deleted_at is null
left join public.craftsmen c            on c.id = i.craftsman_id
left join public.jewelry_categories k   on k.id = i.category_id
where o.deleted_at is null
group by o.id;

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
  where i.cancelled_at is null and i.deleted_at is null and o.cancelled_at is null and o.deleted_at is null
) a on a.craftsman_id = c.id
where c.deleted_at is null
group by c.id;

create or replace function public._barang_aktif()
returns table (id uuid, order_id uuid, craftsman_id uuid, category_id uuid, gender public.gender_category,
               status public.item_status, assigned_date date, production_month date,
               tgl_selesai date, tgl_serah date)
language sql stable security invoker set search_path = '' as $$
  select i.id, i.order_id, i.craftsman_id, i.category_id, i.gender, i.status, i.assigned_date, i.production_month,
         public.tgl_lokal(i.completed_at), public.tgl_lokal(i.delivered_at)
  from public.order_items i join public.orders o on o.id = i.order_id
  where i.cancelled_at is null and i.deleted_at is null and o.cancelled_at is null and o.deleted_at is null;
$$;

-- Nomor barang berikutnya tetap berurutan walau ada barang di Sampah (tidak berubah: memakai semua barang).

-- ------------------------------------------------------------- Sampah
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
where i.deleted_at is not null and o.deleted_at is null and i.deleted_at > now() - public.masa_sampah();

create or replace function public.hapus_order(p_order uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.orders set deleted_at = now() where id = p_order and deleted_at is null;
  if not found then
    raise exception 'Order tidak ditemukan atau sudah di Sampah.' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.hapus_barang(p_item uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.order_items set deleted_at = now() where id = p_item and deleted_at is null;
  if not found then
    raise exception 'Barang tidak ditemukan atau sudah di Sampah.' using errcode = 'P0002';
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
  else
    raise exception 'Jenis tidak dikenal.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Data tidak ditemukan di Sampah.' using errcode = 'P0002';
  end if;
end $$;

revoke all on public.v_sampah from anon, authenticated, public;
grant select on public.v_sampah to authenticated;
grant execute on function public.hapus_order(uuid), public.hapus_barang(uuid), public.pulihkan_sampah(text, uuid),
  public.masa_sampah(), public.order_items_before_inti(public.order_items, public.order_items, text) to authenticated;
revoke execute on function public.hapus_order(uuid), public.hapus_barang(uuid), public.pulihkan_sampah(text, uuid) from anon, public;
