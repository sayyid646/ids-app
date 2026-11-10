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
