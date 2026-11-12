-- =====================================================================
-- Migrasi 10: berat barang dengan minimal yang bisa diatur, order tanpa data pelanggan,
--             dan hapus pengrajin (masuk Sampah 7 hari).
-- Aman dijalankan ulang.
-- =====================================================================

-- --------------------------------------------- order tanpa data pelanggan
-- Nama dan WhatsApp pelanggan tidak lagi diisi. Data lama tetap tersimpan.
alter table public.orders alter column customer_name drop not null;

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
  new.customer_name     := nullif(regexp_replace(btrim(new.customer_name), '\s+', ' ', 'g'), '');
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

-- ------------------------------------------------------ berat barang
alter table public.app_settings add column if not exists min_weight_grams numeric(7,2) not null default 6;
alter table public.app_settings drop constraint if exists app_settings_min_weight_check;
alter table public.app_settings add constraint app_settings_min_weight_check
  check (min_weight_grams > 0 and min_weight_grams <= 1000);

alter table public.order_items add column if not exists weight_grams numeric(8,2);
alter table public.order_items drop constraint if exists order_items_weight_check;
alter table public.order_items add constraint order_items_weight_check
  check (weight_grams is null or (weight_grams > 0 and weight_grams <= 100000));

-- Berat barang baru (atau berat yang diubah) tidak boleh di bawah minimal di Pengaturan.
-- Barang lama yang belum punya berat tetap sah.
create or replace function public.order_items_cek_berat()
returns trigger language plpgsql set search_path = '' as $$
declare v_min numeric;
begin
  if new.weight_grams is not null and (tg_op = 'INSERT' or new.weight_grams is distinct from old.weight_grams) then
    select s.min_weight_grams into v_min from public.app_settings s where s.id = 1;
    if new.weight_grams < coalesce(v_min, 0) then
      raise exception 'Berat minimal order % gram. Berat yang diisi % gram.',
        replace(trim_scale(v_min)::text, '.', ','), replace(trim_scale(new.weight_grams)::text, '.', ',')
        using errcode = '22023', hint = 'IDS_BERAT_MINIMAL';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists order_items_cek_berat on public.order_items;
create trigger order_items_cek_berat before insert or update of weight_grams on public.order_items
  for each row execute function public.order_items_cek_berat();

create or replace function public._sisipkan_barang(p_order uuid, it jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_status public.item_status;
begin
  v_status := coalesce(nullif(it ->> 'status', ''), 'dalam_proses')::public.item_status;
  insert into public.order_items (
    order_id, craftsman_id, category_id, gender, description, assigned_date, production_month,
    production_start_date, status, completed_at, delivered_at, notes, photo_path, weight_grams)
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
    nullif(it ->> 'photo_path', ''),
    nullif(it ->> 'weight_grams', '')::numeric)
  returning id into v_id;
  return v_id;
end $$;

-- Kolom berat ditambahkan di akhir tampilan barang.
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

-- ------------------------------------------------- hapus pengrajin
create or replace function public.craftsmen_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.deleted_at is not null then
    if new.deleted_at is not null then
      raise exception 'Pengrajin ini ada di Sampah. Pulihkan dulu bila ingin mengubahnya.' using errcode = 'P0001';
    end if;
    if old.deleted_at < now() - public.masa_sampah() then
      raise exception 'Pengrajin ini sudah lebih dari 7 hari di Sampah dan tidak bisa dipulihkan.' using errcode = 'P0001', hint = 'IDS_SAMPAH_KEDALUWARSA';
    end if;
    if exists (select 1 from public.craftsmen c
               where c.id <> new.id and c.deleted_at is null and public.normalize_code(c.code) = public.normalize_code(new.code)) then
      raise exception 'ID % sudah dipakai pengrajin lain. Ubah dulu ID pengrajin yang lain itu.', new.code
        using errcode = '23505', hint = 'IDS_KODE_DUPLIKAT';
    end if;
    return new;
  end if;
  new.code  := public.normalize_code(new.code);
  new.name  := nullif(btrim(new.name), '');
  new.phone := public.normalize_wa(new.phone);
  if new.deleted_at is not null then
    new.is_active := false;
  end if;
  return new;
end $$;

create or replace function public.log_craftsmen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('pengrajin_ditambahkan', 'craftsman', new.id, null, null, new.id, null,
      jsonb_build_object('kode', new.code, 'nama', new.name, 'aktif', new.is_active));
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('pengrajin_dihapus', 'craftsman', new.id, null, null, new.id, null,
      jsonb_build_object('kode', new.code, 'nama', new.name));
    return new;
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('pengrajin_dipulihkan', 'craftsman', new.id, null, null, new.id, null,
      jsonb_build_object('kode', new.code, 'nama', new.name));
    return new;
  end if;
  if new.is_active is distinct from old.is_active then
    perform public.tulis_log(case when new.is_active then 'pengrajin_diaktifkan' else 'pengrajin_dinonaktifkan' end,
      'craftsman', new.id, null, null, new.id,
      jsonb_build_object('aktif', old.is_active), jsonb_build_object('aktif', new.is_active));
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

create or replace function public.hapus_pengrajin(p_pengrajin uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.pastikan_admin();
  update public.craftsmen set deleted_at = now() where id = p_pengrajin and deleted_at is null;
  if not found then
    raise exception 'Pengrajin tidak ditemukan atau sudah di Sampah.' using errcode = 'P0002';
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
where c.deleted_at is not null and c.deleted_at > now() - public.masa_sampah();

revoke all on public.v_sampah from anon, authenticated, public;
grant select on public.v_sampah to authenticated;
revoke all on public.v_items from anon, public;
grant select on public.v_items to authenticated;
grant execute on function public.hapus_pengrajin(uuid), public.pulihkan_sampah(text, uuid) to authenticated;
revoke execute on function public.hapus_pengrajin(uuid), public.pulihkan_sampah(text, uuid) from anon, public;
