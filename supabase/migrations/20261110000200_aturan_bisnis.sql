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
