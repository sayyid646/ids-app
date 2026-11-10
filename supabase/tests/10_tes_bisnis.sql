-- =====================================================================
-- Tes otomatis aturan bisnis IDS. Dijalankan oleh jalankan_tes.sh.
-- Setiap pemeriksaan mencetak "ok". Satu kegagalan menghentikan seluruh tes.
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ------------------------------------------------------------ alat tes
create schema tes;
create table tes.ctx (k text primary key, v uuid);
grant usage on schema tes to anon, authenticated;
grant all on tes.ctx to anon, authenticated;

create function tes.id(p text) returns uuid language sql stable as $$ select v from tes.ctx where k = p $$;
create function tes.simpan(p text, v uuid) returns void language sql as $$
  insert into tes.ctx values (p, v) on conflict (k) do update set v = excluded.v $$;
create function tes.sama(p_label text, p_dapat text, p_harap text) returns void language plpgsql as $$
begin
  if p_dapat is distinct from p_harap then
    raise exception 'GAGAL [%]: dapat "%", seharusnya "%"', p_label, p_dapat, p_harap;
  end if;
  raise notice 'ok  %', p_label;
end $$;
create function tes.gagal(p_label text, p_sql text, p_pola text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pola then
      raise exception 'GAGAL [%]: ditolak dengan pesan lain: "%" (diharapkan cocok "%")', p_label, sqlerrm, p_pola;
    end if;
    raise notice 'ok  % (ditolak: %)', p_label, left(sqlerrm, 80);
    return;
  end;
  raise exception 'GAGAL [%]: perintah seharusnya ditolak', p_label;
end $$;
-- ID pengrajin dan kategori dibaca sebagai pemilik database (tanpa RLS) agar tes jelas.
create function tes.p(p_code text) returns uuid language sql stable security definer as $$
  select id from public.craftsmen where code = p_code and deleted_at is null $$;
create function tes.k(p_name text) returns uuid language sql stable security definer as $$
  select id from public.jewelry_categories where name = p_name $$;
create function tes.barang(p_order uuid, p_no int) returns uuid language sql stable security definer as $$
  select id from public.order_items where order_id = p_order and item_no = p_no $$;
create function tes.item(p_pengrajin text, p_kategori text, p_gender text, p_tgl text, p_tambahan jsonb default '{}')
returns jsonb language sql stable as $$
  select jsonb_build_object('craftsman_id', tes.p(p_pengrajin), 'category_id', tes.k(p_kategori),
                            'gender', p_gender, 'assigned_date', p_tgl) || p_tambahan $$;
grant execute on all functions in schema tes to anon, authenticated;

\echo
\echo '== Persiapan akun'
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@ids.test'),
  ('00000000-0000-0000-0000-00000000000b', 'staf@ids.test');
select public.jadikan_admin('ADMIN@ids.test');
do $$ begin
  perform tes.sama('profil dibuat otomatis untuk akun baru', (select count(*) from public.profiles)::text, '2');
  perform tes.sama('akun baru berperan none', (select role::text from public.profiles where email = 'staf@ids.test'), 'none');
  perform tes.sama('admin berperan admin', (select role::text from public.profiles where email = 'admin@ids.test'), 'admin');
  perform tes.gagal('jadikan_admin untuk email yang belum ada', $q$select public.jadikan_admin('x@ids.test')$q$, 'belum ada');
end $$;

\echo
\echo '== T1 Data awal: 9 pengrajin dan 8 kategori'
do $$ begin
  perform tes.sama('9 slot pengrajin', (select count(*) from public.craftsmen)::text, '9');
  perform tes.sama('kode IDS 001 sampai IDS 009',
    (select string_agg(code, ',' order by code) from public.craftsmen),
    'IDS 001,IDS 002,IDS 003,IDS 004,IDS 005,IDS 006,IDS 007,IDS 008,IDS 009');
  perform tes.sama('nama 7 pengrajin sesuai data',
    (select string_agg(coalesce(name, '-'), ',' order by code) from public.craftsmen),
    'Haji Iskandar,Hafizurrahman,Rif''an,Ahmad Rifqi,Khairin,Rofii,Riy,-,-');
  perform tes.sama('IDS 008 dan IDS 009 tanpa nama karangan',
    (select count(*) from public.craftsmen where code in ('IDS 008', 'IDS 009') and name is null)::text, '2');
  perform tes.sama('semua pengrajin aktif', (select count(*) from public.craftsmen where is_active)::text, '9');
  perform tes.sama('8 kategori urut',
    (select string_agg(name, ',' order by sort_order) from public.jewelry_categories),
    'PREMIUM,HIGH,SULTAN,LUXURY,LIONTIN,COUPLE,BRACELET,SPESIAL ITEM');
  perform tes.sama('pengaturan tepat satu baris', (select count(*) from public.app_settings)::text, '1');
  perform tes.sama('zona waktu bawaan WITA', (select timezone from public.app_settings), 'Asia/Makassar');
  perform tes.sama('penambahan 9 pengrajin tercatat di riwayat',
    (select count(*) from public.activity_logs where action = 'pengrajin_ditambahkan')::text, '9');
end $$;

\echo
\echo '== T2 Pengunjung belum login (anon) tidak bisa apa-apa'
set role anon;
select tes.gagal('anon baca pengrajin', 'select count(*) from public.craftsmen', 'permission denied');
select tes.gagal('anon baca order', 'select count(*) from public.orders', 'permission denied');
select tes.gagal('anon baca view barang', 'select count(*) from public.v_items', 'permission denied');
select tes.gagal('anon baca riwayat', 'select count(*) from public.activity_logs', 'permission denied');
select tes.gagal('anon panggil statistik', $q$select public.statistik_dashboard('2026-01-01', '2026-12-31')$q$, 'permission denied');
select tes.gagal('anon buat order', $q$select public.buat_order('{}')$q$, 'permission denied');
reset role;

\echo
\echo '== T3 Akun login yang bukan admin tidak melihat data usaha'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  perform tes.sama('bukan admin: is_admin false', public.is_admin()::text, 'false');
  perform tes.sama('bukan admin: 0 pengrajin terlihat', (select count(*) from public.craftsmen)::text, '0');
  perform tes.sama('bukan admin: 0 kategori terlihat', (select count(*) from public.jewelry_categories)::text, '0');
  perform tes.sama('bukan admin: 0 riwayat terlihat', (select count(*) from public.activity_logs)::text, '0');
  perform tes.sama('bukan admin: pengaturan tidak terlihat', (select count(*) from public.app_settings)::text, '0');
  perform tes.sama('bukan admin: hanya profil sendiri', (select count(*) from public.profiles)::text, '1');
  update public.craftsmen set name = 'Diubah orang lain';
  get diagnostics n = row_count;
  perform tes.sama('bukan admin: tidak bisa mengubah pengrajin', n::text, '0');
  perform tes.gagal('bukan admin: tambah pengrajin', $q$insert into public.craftsmen (code, name) values ('IDS 010', 'X')$q$, 'row-level security');
  perform tes.gagal('bukan admin: buat order', $q$select public.buat_order('{"order_number":"1","customer_name":"x","items":[{}]}')$q$, 'bukan administrator');
  perform tes.gagal('bukan admin: statistik', $q$select public.statistik_dashboard('2026-01-01', '2026-12-31')$q$, 'bukan administrator');
  perform tes.gagal('bukan admin: menaikkan peran sendiri', $q$update public.profiles set role = 'admin' where id = auth.uid()$q$, 'permission denied');
  perform tes.gagal('bukan admin: memanggil jadikan_admin', $q$select public.jadikan_admin('staf@ids.test')$q$, 'permission denied');
  perform tes.gagal('bukan admin: hapus pengrajin', 'delete from public.craftsmen', 'permission denied');
end $$;
reset role;
do $$ begin
  perform tes.sama('nama pengrajin tetap utuh', (select name from public.craftsmen where code = 'IDS 001'), 'Haji Iskandar');
end $$;

-- ---------------------------------------------------- mulai sebagai admin
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

\echo
\echo '== T4 Admin melihat semua data'
do $$ begin
  perform tes.sama('admin: is_admin true', public.is_admin()::text, 'true');
  perform tes.sama('admin: 9 pengrajin di halaman pengrajin', (select count(*) from public.v_craftsmen)::text, '9');
  perform tes.sama('admin: 8 kategori', (select count(*) from public.jewelry_categories)::text, '8');
  update public.profiles set full_name = 'Admin IDS' where id = auth.uid();
  perform tes.sama('admin bisa mengubah nama profilnya', (select full_name from public.profiles where id = auth.uid()), 'Admin IDS');
end $$;

\echo
\echo '== T5 Order satu barang'
do $$
declare v uuid; i uuid;
begin
  v := public.buat_order(jsonb_build_object(
    'order_number', '2574', 'customer_name', '  Ibu   Siti ', 'customer_whatsapp', '0812-3456-7890',
    'items', jsonb_build_array(tes.item('IDS 001', 'PREMIUM', 'LADY', '2026-09-03', '{"description":"Cincin batu safir"}'))));
  perform tes.simpan('o2574', v);
  i := tes.barang(v, 1);
  perform tes.simpan('i2574_1', i);
  perform tes.sama('nama pelanggan dirapikan', (select customer_name from public.orders where id = v), 'Ibu Siti');
  perform tes.sama('nomor WA jadi format 62', (select customer_whatsapp from public.orders where id = v), '6281234567890');
  perform tes.sama('jumlah barang 1', (select quantity from public.v_orders where id = v)::text, '1');
  perform tes.sama('status awal Dalam Proses', (select status::text from public.order_items where id = i), 'dalam_proses');
  perform tes.sama('bulan produksi otomatis dari tanggal diberikan', (select production_month::text from public.order_items where id = i), '2026-09-01');
  perform tes.sama('bulan produksi bukan manual', (select production_month_manual::text from public.order_items where id = i), 'false');
  perform tes.sama('tanggal selesai masih kosong', (select (completed_at is null)::text from public.order_items where id = i), 'true');
  perform tes.sama('tanggal serah masih kosong', (select (delivered_at is null)::text from public.order_items where id = i), 'true');
  perform tes.sama('tanggal order', (select order_date::text from public.v_orders where id = v), '2026-09-03');
  perform tes.sama('label status', (select status_label from public.v_items where id = i), 'Dalam Proses');
  perform tes.sama('riwayat order_dibuat atas nama admin',
    (select actor_email from public.activity_logs where action = 'order_dibuat' and order_id = v), 'admin@ids.test');
  perform tes.sama('riwayat pengrajin_ditugaskan tercatat',
    (select new_value ->> 'kode' from public.activity_logs where action = 'pengrajin_ditugaskan' and item_id = i), 'IDS 001');
end $$;

\echo
\echo '== T6 Order banyak barang (jumlah 3)'
do $$
declare v uuid;
begin
  v := public.buat_order(jsonb_build_object(
    'order_number', '2575', 'customer_name', 'Bapak Ahmad', 'customer_whatsapp', '+62 813 1111 2222',
    'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03', '{"quantity":3}'))));
  perform tes.simpan('o2575', v);
  perform tes.sama('jumlah barang 3', (select quantity from public.v_orders where id = v)::text, '3');
  perform tes.sama('nomor barang 1,2,3', (select string_agg(item_no::text, ',' order by item_no) from public.order_items where order_id = v), '1,2,3');
  perform tes.sama('tiap barang bisa dilacak sendiri', (select count(distinct id) from public.order_items where order_id = v)::text, '3');
  perform tes.sama('WA +62 dirapikan', (select customer_whatsapp from public.orders where id = v), '6281311112222');
  perform tes.sama('riwayat barang_ditambahkan 3x', (select count(*) from public.activity_logs where order_id = v and action = 'barang_ditambahkan')::text, '3');
end $$;

\echo
\echo '== T7 Nomor order ganda terdeteksi'
do $$ begin
  perform tes.sama('cek nomor " 2574 " menemukan order lama', (select count(*) from public.cek_nomor_order(' 2574 '))::text, '1');
  perform tes.sama('cek nomor mengecualikan order sendiri saat edit', (select count(*) from public.cek_nomor_order('2574', tes.id('o2574')))::text, '0');
  perform tes.sama('cek nomor baru kosong', (select count(*) from public.cek_nomor_order('9999'))::text, '0');
  perform tes.gagal('simpan nomor yang sama ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '2574', 'customer_name', 'X',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03')))), 'sudah dipakai');
  perform tes.gagal('nomor dengan spasi " 25 74 " juga ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', ' 25 74 ', 'customer_name', 'X',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03')))), 'sudah dipakai');
  perform tes.gagal('insert langsung ke tabel juga dijaga',
    $q$insert into public.orders (order_number, customer_name) values ('2574', 'X')$q$, 'duplicate key');
end $$;

\echo
\echo '== T8 Tambah barang ke order yang sudah ada'
do $$
declare n int;
begin
  n := public.tambah_barang(tes.id('o2574'), tes.item('IDS 002', 'COUPLE', 'LADY', '2026-09-04'));
  perform tes.sama('1 barang ditambahkan', n::text, '1');
  perform tes.sama('jumlah order 2574 jadi 2', (select quantity from public.v_orders where id = tes.id('o2574'))::text, '2');
  perform tes.simpan('i2574_2', tes.barang(tes.id('o2574'), 2));
  perform tes.sama('barang kedua bernomor 2', (select item_no::text from public.order_items where id = tes.id('i2574_2')), '2');
end $$;

\echo
\echo '== T9 Status: selesai TIDAK sama dengan sudah diserahkan'
do $$
declare i uuid := tes.id('i2574_1'); n int;
begin
  n := public.ubah_status(array[i], 'selesai', '2026-09-23 10:00+08');
  perform tes.sama('ubah_status mengubah 1 barang', n::text, '1');
  perform tes.sama('tanggal selesai tercatat (WITA)', (select to_char(completed_at at time zone 'Asia/Makassar', 'YYYY-MM-DD HH24:MI') from public.order_items where id = i), '2026-09-23 10:00');
  perform tes.sama('selesai belum berarti diserahkan', (select (delivered_at is null)::text from public.order_items where id = i), 'true');
  perform tes.sama('status order jadi sebagian', (select order_status from public.v_orders where id = tes.id('o2574')), 'sebagian');
  n := public.ubah_status(array[i], 'diserahkan');
  perform tes.sama('tanggal serah tercatat otomatis', (select (delivered_at is not null and delivered_at <= now())::text from public.order_items where id = i), 'true');
  perform tes.sama('tanggal selesai tidak berubah saat diserahkan', (select to_char(completed_at at time zone 'Asia/Makassar', 'YYYY-MM-DD HH24:MI') from public.order_items where id = i), '2026-09-23 10:00');
  n := public.ubah_status(array(select id from public.order_items where order_id = tes.id('o2575')), 'selesai');
  perform tes.sama('3 barang sekaligus jadi selesai', n::text, '3');
  perform tes.sama('order 2575 berstatus selesai', (select order_status from public.v_orders where id = tes.id('o2575')), 'selesai');
  perform tes.sama('order 2575: 0 diserahkan', (select qty_diserahkan from public.v_orders where id = tes.id('o2575'))::text, '0');
  n := public.ubah_status(array(select id from public.order_items where order_id = tes.id('o2575')), 'selesai');
  perform tes.sama('mengulang status yang sama tidak mengubah apa pun', n::text, '0');
end $$;

\echo
\echo '== T10 Ubah status langsung di tabel juga mengisi tanggal otomatis'
do $$
declare i uuid := tes.id('i2574_2');
begin
  update public.order_items set status = 'selesai' where id = i;
  perform tes.sama('tanggal selesai terisi otomatis', (select (completed_at is not null)::text from public.order_items where id = i), 'true');
  perform tes.sama('semua barang 2574 selesai (satu sudah diserahkan): order selesai', (select order_status from public.v_orders where id = tes.id('o2574')), 'selesai');
end $$;

\echo
\echo '== T11 Data tidak masuk akal ditolak'
do $$
declare i uuid := tes.id('i2574_2');
begin
  perform tes.gagal('selesai sebelum tanggal diberikan',
    format($q$update public.order_items set completed_at = '2026-09-01 10:00+08' where id = %L$q$, i), 'sebelum tanggal diberikan');
  perform tes.gagal('selesai di masa depan',
    format($q$update public.order_items set completed_at = now() + interval '2 days' where id = %L$q$, i), 'masa depan');
  perform tes.gagal('diserahkan sebelum selesai',
    format($q$update public.order_items set delivered_at = '2026-09-20 10:00+08' where id = %L$q$, tes.id('i2574_1')), 'sebelum tanggal selesai');
  perform tes.gagal('tanggal diberikan di masa depan',
    format('select public.tambah_barang(%L, %L)', tes.id('o2575'), tes.item('IDS 001', 'HIGH', 'MAN', (current_date + 3)::text)), 'masa depan');
  perform tes.gagal('nomor WA huruf ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '3001', 'customer_name', 'X', 'customer_whatsapp', 'abc',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03')))), 'tidak valid');
  perform tes.gagal('nomor WA terlalu pendek ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '3001', 'customer_name', 'X', 'customer_whatsapp', '12345',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03')))), 'tidak valid');
  perform tes.gagal('order tanpa barang ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '3001', 'customer_name', 'X', 'items', '[]'::jsonb)), 'minimal satu barang');
  perform tes.gagal('jumlah 0 ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '3001', 'customer_name', 'X',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03', '{"quantity":0}')))), 'Jumlah barang');
  perform tes.gagal('nama pelanggan kosong ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '3001', 'customer_name', '   ',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03')))), 'customer_name');
  perform tes.gagal('gender selain LADY/MAN ditolak',
    format('select public.buat_order(%L)', jsonb_build_object('order_number', '3001', 'customer_name', 'X',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'ANAK', '2026-09-03')))), 'invalid input value');
  perform tes.sama('order 3001 tidak tersimpan sebagian', (select count(*) from public.orders where order_number = '3001')::text, '0');
end $$;

\echo
\echo '== T12 Koreksi tanggal selesai tercatat di riwayat'
do $$
declare i uuid := tes.id('i2574_2');
begin
  update public.order_items set completed_at = '2026-09-25 09:00+08' where id = i;
  perform tes.sama('riwayat tanggal_selesai_diubah ada',
    (select count(*) from public.activity_logs where item_id = i and action = 'tanggal_selesai_diubah')::text, '1');
  perform tes.sama('nilai baru di riwayat',
    (select to_char((new_value ->> 'tanggal_selesai')::timestamptz at time zone 'Asia/Makassar', 'YYYY-MM-DD HH24:MI')
     from public.activity_logs where item_id = i and action = 'tanggal_selesai_diubah'), '2026-09-25 09:00');
  perform tes.sama('nilai lama di riwayat tidak kosong',
    (select (old_value ->> 'tanggal_selesai' is not null)::text from public.activity_logs where item_id = i and action = 'tanggal_selesai_diubah'), 'true');
  update public.order_items set delivered_at = '2026-09-28 13:00+08' where id = tes.id('i2574_1');
  perform tes.sama('riwayat tanggal_serah_diubah ada',
    (select count(*) from public.activity_logs where item_id = tes.id('i2574_1') and action = 'tanggal_serah_diubah')::text, '1');
end $$;

\echo
\echo '== T13 Kembali ke Dalam Proses menghapus tanggal dan tercatat'
do $$
declare i uuid := tes.id('i2574_2');
begin
  perform public.ubah_status(array[i], 'dalam_proses');
  perform tes.sama('tanggal selesai dikosongkan', (select (completed_at is null)::text from public.order_items where id = i), 'true');
  perform tes.sama('riwayat status lama selesai',
    (select old_value ->> 'status' from public.activity_logs where item_id = i and action = 'status_diubah' order by created_at desc, id limit 1), 'selesai');
  perform tes.gagal('tanggal selesai tanpa status selesai ditolak',
    format('update public.order_items set completed_at = now() where id = %L', i), 'order_items_status_dates_ck');
  -- diserahkan -> selesai: tanggal selesai lama tetap
  perform public.ubah_status(array[tes.id('i2574_1')], 'selesai');
  perform tes.sama('dari diserahkan ke selesai: tanggal selesai tetap',
    (select to_char(completed_at at time zone 'Asia/Makassar', 'YYYY-MM-DD HH24:MI') from public.order_items where id = tes.id('i2574_1')), '2026-09-23 10:00');
  perform tes.sama('dari diserahkan ke selesai: tanggal serah dikosongkan',
    (select (delivered_at is null)::text from public.order_items where id = tes.id('i2574_1')), 'true');
  perform public.ubah_status(array[tes.id('i2574_1')], 'diserahkan', '2026-09-28 13:00+08');
end $$;

\echo
\echo '== T14 Ganti pengrajin tercatat'
do $$
declare i uuid := tes.id('i2574_2');
begin
  update public.order_items set craftsman_id = tes.p('IDS 003') where id = i;
  perform tes.sama('riwayat pengrajin lama IDS 002',
    (select old_value ->> 'kode' from public.activity_logs where item_id = i and action = 'pengrajin_ditugaskan' and old_value is not null), 'IDS 002');
  perform tes.sama('riwayat pengrajin baru IDS 003',
    (select new_value ->> 'kode' from public.activity_logs where item_id = i and action = 'pengrajin_ditugaskan' and old_value is not null), 'IDS 003');
end $$;

\echo
\echo '== T15 Kelola pengrajin: nonaktif, ganti nama dan ID, tambah, arsip'
do $$
declare n int; v uuid;
begin
  update public.craftsmen set is_active = false where code = 'IDS 003';
  perform tes.sama('riwayat pengrajin_dinonaktifkan',
    (select count(*) from public.activity_logs where action = 'pengrajin_dinonaktifkan' and craftsman_id = tes.p('IDS 003'))::text, '1');
  perform tes.gagal('barang baru ke pengrajin nonaktif ditolak',
    format('select public.tambah_barang(%L, %L)', tes.id('o2575'), tes.item('IDS 003', 'HIGH', 'MAN', '2026-09-05')), 'nonaktif');
  n := public.ubah_status(array[tes.id('i2574_2')], 'selesai');
  perform tes.sama('barang lama pengrajin nonaktif tetap bisa diperbarui', n::text, '1');
  perform tes.sama('pengrajin nonaktif tetap tampil di daftar', (select is_active::text from public.v_craftsmen where code = 'IDS 003'), 'false');
  perform tes.sama('riwayat barangnya tetap', (select total_items::text from public.v_craftsmen where code = 'IDS 003'), '1');

  update public.craftsmen set code = 'ids   010', name = 'Nama Uji' where code = 'IDS 008';
  perform tes.sama('ID pengrajin bisa diganti dan dirapikan', (select count(*) from public.craftsmen where code = 'IDS 010')::text, '1');
  update public.craftsmen set code = 'IDS 008', name = null where code = 'IDS 010';
  perform tes.sama('dikembalikan ke IDS 008 tanpa nama', (select coalesce(name, '-') from public.craftsmen where code = 'IDS 008'), '-');
  perform tes.sama('perubahan ID dan nama tercatat 2x',
    (select count(*) from public.activity_logs where action = 'pengrajin_diubah' and craftsman_id = tes.p('IDS 008'))::text, '2');
  perform tes.gagal('ID pengrajin ganda ditolak', $q$update public.craftsmen set code = 'ids 001' where code = 'IDS 009'$q$, 'duplicate key');

  insert into public.craftsmen (code, name, phone) values ('IDS 010', 'Pengrajin Uji', '0812 9999 0000') returning id into v;
  perform tes.sama('pengrajin baru bisa ditambah', (select count(*) from public.v_craftsmen)::text, '10');
  perform tes.sama('nomor HP pengrajin dirapikan', (select phone from public.craftsmen where id = v), '6281299990000');
  update public.craftsmen set deleted_at = now() where id = v;
  perform tes.sama('pengrajin diarsipkan tidak tampil', (select count(*) from public.v_craftsmen)::text, '9');
  perform tes.sama('pengrajin diarsipkan otomatis nonaktif', (select is_active::text from public.craftsmen where id = v), 'false');
  perform tes.gagal('pengrajin arsip tidak bisa diubah', format($q$update public.craftsmen set name = 'X' where id = %L$q$, v), 'diarsipkan');
end $$;

\echo
\echo '== T16 Data tidak bisa dihapus permanen'
do $$ begin
  perform tes.gagal('admin hapus pengrajin', 'delete from public.craftsmen', 'permission denied');
  perform tes.gagal('admin hapus order', 'delete from public.orders', 'permission denied');
  perform tes.gagal('admin hapus barang', 'delete from public.order_items', 'permission denied');
  perform tes.gagal('admin ubah riwayat', $q$update public.activity_logs set action = 'x'$q$, 'permission denied');
  perform tes.gagal('admin hapus riwayat', 'delete from public.activity_logs', 'permission denied');
end $$;
reset role;
do $$ begin
  perform tes.gagal('pemilik database hapus pengrajin', 'delete from public.craftsmen', 'tidak boleh dihapus permanen');
  perform tes.gagal('pemilik database hapus order', 'delete from public.orders', 'tidak boleh dihapus permanen');
  perform tes.gagal('pemilik database hapus barang', 'delete from public.order_items', 'tidak boleh dihapus permanen');
  perform tes.gagal('pemilik database ubah riwayat', $q$update public.activity_logs set action = 'x'$q$, 'tidak boleh diubah');
  perform tes.gagal('pemilik database hapus riwayat', 'delete from public.activity_logs', 'tidak boleh diubah');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

\echo
\echo '== T17 Batalkan dan pulihkan order'
do $$
declare v uuid := tes.id('o2575');
begin
  perform tes.gagal('batal tanpa alasan ditolak', format($q$select public.batalkan_order(%L, '  ')$q$, v), 'Alasan');
  perform public.batalkan_order(v, 'Pembeli membatalkan');
  perform tes.sama('order berstatus dibatalkan', (select order_status from public.v_orders where id = v), 'dibatalkan');
  perform tes.sama('riwayat order_dibatalkan', (select new_value ->> 'alasan' from public.activity_logs where order_id = v and action = 'order_dibatalkan'), 'Pembeli membatalkan');
  perform tes.sama('barang order batal tidak aktif', (select bool_or(is_active)::text from public.v_items where order_id = v), 'false');
  perform tes.gagal('status barang order batal tidak bisa diubah',
    format($q$select public.ubah_status(array(select id from public.order_items where order_id = %L), 'diserahkan')$q$, v), 'dibatalkan');
  perform tes.gagal('tambah barang ke order batal ditolak',
    format('select public.tambah_barang(%L, %L)', v, tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-05')), 'dibatalkan');
  perform tes.sama('data order batal tidak hilang', (select count(*) from public.order_items where order_id = v)::text, '3');
  perform public.pulihkan_order(v);
  perform tes.sama('order dipulihkan kembali selesai', (select order_status from public.v_orders where id = v), 'selesai');
  perform tes.sama('riwayat order_dipulihkan', (select count(*) from public.activity_logs where order_id = v and action = 'order_dipulihkan')::text, '1');
end $$;

\echo
\echo '== T18 Kategori bisa diubah tanpa merusak riwayat'
do $$ begin
  update public.jewelry_categories set name = 'premium gold' where name = 'PREMIUM';
  perform tes.sama('nama kategori dirapikan huruf besar', (select count(*) from public.jewelry_categories where name = 'PREMIUM GOLD')::text, '1');
  perform tes.sama('order lama ikut nama baru', (select category_name from public.v_items where id = tes.id('i2574_1')), 'PREMIUM GOLD');
  perform tes.sama('riwayat kategori_diubah', (select count(*) from public.activity_logs where action = 'kategori_diubah')::text, '1');
  update public.jewelry_categories set name = 'PREMIUM' where name = 'PREMIUM GOLD';
  update public.jewelry_categories set is_active = false where name = 'LIONTIN';
  perform tes.gagal('kategori nonaktif tidak bisa dipakai barang baru',
    format('select public.tambah_barang(%L, %L)', tes.id('o2574'), tes.item('IDS 001', 'LIONTIN', 'LADY', '2026-09-05')), 'nonaktif');
  update public.jewelry_categories set is_active = true where name = 'LIONTIN';
  perform tes.gagal('nama kategori ganda ditolak', $q$insert into public.jewelry_categories (name) values (' high ')$q$, 'duplicate key');
  perform tes.gagal('kategori tidak bisa dihapus', $q$delete from public.jewelry_categories where name = 'HIGH'$q$, 'permission denied');
end $$;

\echo
\echo '== T19 Bulan produksi: otomatis atau koreksi manual'
do $$
declare a uuid; b uuid;
begin
  a := public.buat_order(jsonb_build_object('order_number', '2600', 'customer_name', 'Uji Bulan',
    'items', jsonb_build_array(tes.item('IDS 002', 'LUXURY', 'LADY', '2026-09-02', '{"production_month":"2026-08-15"}'))));
  perform tes.sama('bulan manual disimpan sebagai tanggal 1', (select production_month::text from public.order_items where order_id = a), '2026-08-01');
  perform tes.sama('ditandai manual', (select production_month_manual::text from public.order_items where order_id = a), 'true');
  update public.order_items set assigned_date = '2026-09-05' where order_id = a;
  perform tes.sama('bulan manual tidak berubah saat tanggal diganti', (select production_month::text from public.order_items where order_id = a), '2026-08-01');
  b := public.buat_order(jsonb_build_object('order_number', '2601', 'customer_name', 'Uji Bulan 2',
    'items', jsonb_build_array(tes.item('IDS 002', 'LUXURY', 'MAN', '2026-09-02'))));
  update public.order_items set assigned_date = '2026-10-01' where order_id = b;
  perform tes.sama('bulan otomatis ikut tanggal baru', (select production_month::text from public.order_items where order_id = b), '2026-10-01');
  update public.order_items set production_month = '2026-11-20' where order_id = b;
  perform tes.sama('koreksi manual lewat ubah data', (select production_month::text || '/' || production_month_manual::text from public.order_items where order_id = b), '2026-11-01/true');
  update public.order_items set production_month = '2026-10-01' where order_id = b;
  perform tes.sama('kembali sama dengan bulan otomatis = bukan manual', (select production_month_manual::text from public.order_items where order_id = b), 'false');
  perform tes.gagal('mulai produksi sebelum tanggal diberikan',
    format($q$update public.order_items set production_start_date = '2026-09-01' where order_id = %L$q$, b), 'mulai produksi');
  update public.order_items set production_start_date = '2026-10-02' where order_id = b;
  perform tes.sama('tanggal mulai produksi tersimpan', (select production_start_date::text from public.order_items where order_id = b), '2026-10-02');
end $$;

\echo
\echo '== T20 Perhitungan dashboard tepat (data 2025 khusus tes)'
do $$
declare s1 uuid; s4 uuid; s5 uuid; r jsonb; t text;
begin
  -- S1: 2 barang IDS 004 PREMIUM LADY, 10 Jan 2025: (a) selesai 20 Jan, (b) selesai 25 Jan & diserahkan 3 Feb
  s1 := public.buat_order(jsonb_build_object('order_number', 'S1', 'customer_name', 'Statistik 1', 'items', jsonb_build_array(
    tes.item('IDS 004', 'PREMIUM', 'LADY', '2025-01-10', '{"status":"selesai","completed_at":"2025-01-20 12:00+08"}'),
    tes.item('IDS 004', 'PREMIUM', 'LADY', '2025-01-10', '{"status":"diserahkan","completed_at":"2025-01-25 10:00+08","delivered_at":"2025-02-03 10:00+08"}'))));
  -- S2: 1 barang IDS 005 HIGH MAN, 14 Feb 2025, masih dalam proses
  perform public.buat_order(jsonb_build_object('order_number', 'S2', 'customer_name', 'Statistik 2', 'items', jsonb_build_array(
    tes.item('IDS 005', 'HIGH', 'MAN', '2025-02-14'))));
  -- S3: IDS 004 SULTAN LADY, 28 Feb 2025; selesai 31 Mar 23:30 WITA; diserahkan 1 Apr 00:30 WITA (batas zona waktu)
  perform public.buat_order(jsonb_build_object('order_number', 'S3', 'customer_name', 'Statistik 3', 'items', jsonb_build_array(
    tes.item('IDS 004', 'SULTAN', 'LADY', '2025-02-28', '{"status":"diserahkan","completed_at":"2025-03-31 15:30:00+00","delivered_at":"2025-03-31 16:30:00+00"}'))));
  -- S4: dibatalkan, tidak boleh terhitung
  s4 := public.buat_order(jsonb_build_object('order_number', 'S4', 'customer_name', 'Statistik 4', 'items', jsonb_build_array(
    tes.item('IDS 005', 'HIGH', 'MAN', '2025-01-05'))));
  perform public.batalkan_order(s4, 'tes');
  -- S5: 2 barang IDS 004 LUXURY MAN, 10 Mar 2025; satu dibatalkan
  s5 := public.buat_order(jsonb_build_object('order_number', 'S5', 'customer_name', 'Statistik 5', 'items', jsonb_build_array(
    tes.item('IDS 004', 'LUXURY', 'MAN', '2025-03-10', '{"quantity":2}'))));
  perform public.batalkan_barang(tes.barang(s5, 2), 'salah input');

  r := public.statistik_dashboard('2025-01-01', '2025-12-31');
  perform tes.sama('2025: total order (S4 batal tidak dihitung)', r ->> 'total_order', '4');
  perform tes.sama('2025: total barang (barang batal tidak dihitung)', r ->> 'total_barang', '5');
  perform tes.sama('2025: dalam proses', r ->> 'dalam_proses', '2');
  perform tes.sama('2025: selesai belum diserahkan', r ->> 'selesai_belum_diserahkan', '1');
  perform tes.sama('2025: sudah diserahkan', r ->> 'sudah_diserahkan', '2');
  perform tes.sama('2025: selesai dikerjakan (selesai + diserahkan)', r ->> 'selesai_dikerjakan', '3');
  perform tes.sama('2025: belum diserahkan', r ->> 'belum_diserahkan', '3');
  perform tes.sama('2025: selesai pada periode', r ->> 'selesai_pada_periode', '3');
  perform tes.sama('2025: diserahkan pada periode', r ->> 'diserahkan_pada_periode', '2');
  perform tes.sama('pengrajin aktif = 8 (IDS 003 nonaktif)', r ->> 'pengrajin_aktif',
    (select count(*) from public.craftsmen where is_active and deleted_at is null)::text);
  perform tes.sama('angka saat ini cocok dengan hitungan langsung', r -> 'saat_ini' ->> 'dalam_proses',
    (select count(*) from public.v_items where is_active and status = 'dalam_proses')::text);
  perform tes.sama('angka siap diserahkan cocok', r -> 'saat_ini' ->> 'siap_diserahkan',
    (select count(*) from public.v_items where is_active and status = 'selesai')::text);

  r := public.statistik_dashboard('2025-01-01', '2025-01-31');
  perform tes.sama('Jan 2025: 1 order', r ->> 'total_order', '1');
  perform tes.sama('Jan 2025: 2 barang', r ->> 'total_barang', '2');
  perform tes.sama('Jan 2025: 2 selesai pada periode', r ->> 'selesai_pada_periode', '2');
  perform tes.sama('Jan 2025: 0 diserahkan pada periode (diserahkan Feb)', r ->> 'diserahkan_pada_periode', '0');

  r := public.statistik_dashboard('2025-03-31', '2025-03-31');
  perform tes.sama('31 Mar: selesai 23:30 WITA terhitung 31 Mar', r ->> 'selesai_pada_periode', '1');
  perform tes.sama('31 Mar: diserahkan 00:30 WITA 1 Apr tidak terhitung', r ->> 'diserahkan_pada_periode', '0');
  r := public.statistik_dashboard('2025-04-01', '2025-04-01');
  perform tes.sama('1 Apr: diserahkan terhitung 1 Apr', r ->> 'diserahkan_pada_periode', '1');

  select string_agg(to_char(bulan, 'YYYY-MM') || ':' || order_masuk || '/' || barang_masuk || '/' || barang_selesai || '/' || barang_diserahkan, ' ' order by bulan)
    into t from public.statistik_bulanan('2025-01-15', '2025-04-02');
  perform tes.sama('grafik bulanan Jan-Apr 2025', t, '2025-01:1/2/2/0 2025-02:2/2/0/1 2025-03:1/1/1/0 2025-04:0/0/0/1');

  select ditugaskan || '/' || selesai_pada_periode || '/' || diserahkan_pada_periode || '/' || sedang_dikerjakan || '/' || rata_hari_selesai
    into t from public.produktivitas_pengrajin('2025-01-01', '2025-12-31') where code = 'IDS 004';
  perform tes.sama('produktivitas IDS 004 (tugas/selesai/serah/proses/rata hari)', t, '4/3/2/1/18.7');
  select ditugaskan || '/' || selesai_pada_periode || '/' || diserahkan_pada_periode || '/' || sedang_dikerjakan || '/' || coalesce(rata_hari_selesai::text, '-')
    into t from public.produktivitas_pengrajin('2025-01-01', '2025-12-31') where code = 'IDS 005';
  perform tes.sama('produktivitas IDS 005 (order batal tidak dihitung)', t, '1/0/0/1/-');
  perform tes.sama('jumlah tugas semua pengrajin = total barang',
    (select sum(ditugaskan)::text from public.produktivitas_pengrajin('2025-01-01', '2025-12-31')), '5');
  perform tes.sama('semua pengrajin tampil di produktivitas', (select count(*)::text from public.produktivitas_pengrajin('2025-01-01', '2025-12-31')), '9');

  select string_agg(category_name || ' ' || gender || '=' || jumlah, ', ') into t from public.statistik_kategori('2025-01-01', '2025-12-31');
  perform tes.sama('rincian kategori dan gender 2025', t, 'PREMIUM LADY=2, HIGH MAN=1, SULTAN LADY=1, LUXURY MAN=1');

  perform tes.gagal('rentang tanggal terbalik ditolak', $q$select public.statistik_dashboard('2025-12-31', '2025-01-01')$q$, 'tidak valid');
end $$;

\echo
\echo '== T21 Pencarian global'
do $$ begin
  perform tes.sama('cari nomor order 2574', (select count(*) from public.cari_global('2574'))::text, '2');
  perform tes.sama('cari nama pengrajin "iskandar"', (select count(*) from public.cari_global('iskandar'))::text,
    (select count(*) from public.v_items where craftsman_code = 'IDS 001')::text);
  perform tes.sama('cari ID pengrajin "ids001" tanpa spasi', (select count(*) from public.cari_global('ids001'))::text,
    (select count(*) from public.v_items where craftsman_code = 'IDS 001')::text);
  perform tes.sama('cari ID pengrajin "IDS 004"', (select count(*) from public.cari_global('IDS 004'))::text,
    (select count(*) from public.v_items where craftsman_code = 'IDS 004')::text);
  perform tes.sama('cari nama pelanggan "siti"', (select count(*) from public.cari_global('siti'))::text, '2');
  perform tes.sama('cari WA dengan 0 di depan "0812 3456"', (select count(*) from public.cari_global('0812 3456'))::text, '2');
  perform tes.sama('cari kategori "sultan"', (select count(*) from public.cari_global('sultan'))::text, '1');
  perform tes.sama('cari status "sudah diserahkan"', (select count(*) from public.cari_global('sudah diserahkan'))::text,
    (select count(*) from public.v_items where status = 'diserahkan')::text);
  perform tes.sama('cari gabungan "iskandar premium"', (select count(*) from public.cari_global('iskandar premium'))::text, '1');
  perform tes.sama('pencarian kosong tidak mengembalikan apa pun', (select count(*) from public.cari_global('   '))::text, '0');
  perform tes.sama('hasil aktif di urutan atas', (select is_active::text from public.cari_global('S4') limit 1), 'false');
end $$;

\echo
\echo '== T22 Pengaturan'
do $$ begin
  update public.app_settings set business_whatsapp = '0811 2222 3333', business_address = 'Jl. Contoh No. 1' where id = 1;
  perform tes.sama('WA usaha dirapikan', (select business_whatsapp from public.app_settings), '6281122223333');
  perform tes.sama('riwayat pengaturan_diubah', (select count(*) from public.activity_logs where action = 'pengaturan_diubah')::text, '1');
  perform tes.gagal('zona waktu salah ditolak', $q$update public.app_settings set timezone = 'Mars/Olympus' where id = 1$q$, 'tidak dikenal');
  perform tes.gagal('baris pengaturan kedua ditolak', $q$insert into public.app_settings (id) values (2)$q$, 'permission denied');
end $$;
reset role;

\echo
\echo '== T23 Sinkronisasi, penyimpanan foto, riwayat'
do $$ begin
  perform tes.sama('6 tabel ikut Realtime',
    (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
    'activity_logs,app_settings,craftsmen,jewelry_categories,order_items,orders');
  perform tes.sama('bucket foto privat', (select string_agg(id || ':' || public, ',' order by id) from storage.buckets), 'foto-barang:false,identitas:false');
  perform tes.sama('semua riwayat punya pelaku', (select count(*) from public.activity_logs where actor_email is null)::text, '0');
  perform tes.sama('riwayat admin tercatat atas nama admin',
    (select count(*) from public.activity_logs where actor_id = '00000000-0000-0000-0000-00000000000a' and actor_email <> 'admin@ids.test')::text, '0');
  perform tes.sama('RLS aktif di semua tabel',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)::text, '0');
  perform tes.sama('anon tidak punya hak tabel apa pun',
    (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')::text, '0');
  perform tes.sama('tidak ada hak DELETE untuk akun login',
    (select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE')::text, '0');
end $$;

\echo
\echo '== SEMUA TES LULUS'
