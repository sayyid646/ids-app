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
