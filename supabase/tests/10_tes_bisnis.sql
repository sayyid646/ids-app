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
  perform public.buat_order(jsonb_build_object('order_number', '3099', 'customer_name', '   ',
      'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-09-03'))));
  perform tes.sama('nama pelanggan kosong boleh (tidak lagi diisi)',
    (select coalesce(customer_name, 'kosong') from public.orders where order_number = '3099'), 'kosong');
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
  perform tes.gagal('pengrajin arsip tidak bisa diubah', format($q$update public.craftsmen set name = 'X' where id = %L$q$, v), 'ada di Sampah');
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
  perform tes.sama('9 tabel ikut Realtime',
    (select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
    'activity_logs,app_settings,craftsmen,jewelry_categories,manual_notes,order_items,orders,products,silver_purchases');
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
\echo '== T24 Sampah 7 hari: hapus dan pulihkan order dan barang'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare v uuid; i1 uuid; i2 uuid; sebelum jsonb; sesudah jsonb;
begin
  sebelum := public.statistik_dashboard('2026-10-01', '2026-10-31');
  v := public.buat_order(jsonb_build_object('order_number', '7700', 'customer_name', 'Uji Sampah',
    'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-10-05'), tes.item('IDS 001', 'LUXURY', 'LADY', '2026-10-05'))));
  perform tes.simpan('o7700', v);
  i1 := tes.barang(v, 1); i2 := tes.barang(v, 2);
  perform tes.simpan('i7700_2', i2);
  perform tes.sama('order uji 2 barang', (select quantity from public.v_orders where id = v)::text, '2');

  -- hapus satu barang (salah ketik)
  perform public.hapus_barang(i2);
  perform tes.sama('barang terhapus hilang dari daftar barang', (select count(*) from public.v_items where id = i2)::text, '0');
  perform tes.sama('jumlah barang order jadi 1', (select quantity from public.v_orders where id = v)::text, '1');
  perform tes.sama('barang terhapus tidak dihitung dashboard',
    ((public.statistik_dashboard('2026-10-01', '2026-10-31') ->> 'total_barang')::int - (sebelum ->> 'total_barang')::int)::text, '1');
  perform tes.sama('barang terhapus tidak ikut pencarian', (select count(*) from public.cari_global('7700') c where c.id = i2)::text, '0');
  perform tes.sama('barang ada di Sampah', (select jenis || ':' || item_no from public.v_sampah where id = i2), 'barang:2');
  perform tes.sama('Sampah menyebut batas 7 hari',
    (select (hilang_pada - deleted_at)::text from public.v_sampah where id = i2), '7 days');
  perform tes.sama('riwayat barang_dihapus', (select count(*) from public.activity_logs where item_id = i2 and action = 'barang_dihapus')::text, '1');
  perform tes.gagal('barang di Sampah tidak bisa diubah', format($q$update public.order_items set notes = 'x' where id = %L$q$, i2), 'ada di Sampah');
  perform tes.gagal('barang di Sampah tidak bisa diubah statusnya', format($q$select public.ubah_status(array[%L::uuid], 'selesai')$q$, i2), 'Sampah|tidak ditemukan|0');
  perform tes.gagal('hapus dua kali ditolak', format('select public.hapus_barang(%L)', i2), 'sudah di Sampah');

  -- pulihkan barang
  perform public.pulihkan_sampah('barang', i2);
  perform tes.sama('barang kembali', (select quantity from public.v_orders where id = v)::text, '2');
  perform tes.sama('barang keluar dari Sampah', (select count(*) from public.v_sampah where id = i2)::text, '0');
  perform tes.sama('riwayat barang_dipulihkan_sampah', (select count(*) from public.activity_logs where item_id = i2 and action = 'barang_dipulihkan_sampah')::text, '1');
  perform tes.sama('barang dipulihkan tidak tercatat barang_diubah', (select count(*) from public.activity_logs where item_id = i2 and action = 'barang_diubah')::text, '0');

  -- hapus seluruh order
  perform public.hapus_order(v);
  perform tes.sama('order terhapus hilang dari daftar order', (select count(*) from public.v_orders where id = v)::text, '0');
  perform tes.sama('barang order terhapus hilang', (select count(*) from public.v_items where order_id = v)::text, '0');
  perform tes.sama('order terhapus tidak dihitung dashboard',
    (public.statistik_dashboard('2026-10-01', '2026-10-31') ->> 'total_barang'), sebelum ->> 'total_barang');
  perform tes.sama('order ada di Sampah dengan 2 barang', (select jenis || ':' || jumlah_barang from public.v_sampah where id = v), 'order:2');
  perform tes.sama('barangnya tidak tampil terpisah di Sampah', (select count(*) from public.v_sampah where order_id = v and jenis = 'barang')::text, '0');
  perform tes.sama('riwayat order_dihapus', (select count(*) from public.activity_logs where order_id = v and action = 'order_dihapus')::text, '1');
  perform tes.gagal('order di Sampah tidak bisa diubah', format($q$update public.orders set customer_name = 'Y' where id = %L$q$, v), 'ada di Sampah');
  perform tes.gagal('tambah barang ke order di Sampah ditolak', format('select public.tambah_barang(%L, %L)', v, tes.item('IDS 001', 'HIGH', 'MAN', '2026-10-06')), '.');
  perform tes.gagal('barang dari order di Sampah tidak bisa dipulihkan sendiri', format($q$select public.pulihkan_sampah('barang', %L)$q$, i1), 'tidak ditemukan');
  perform tes.sama('nomor order bisa dipakai lagi selama di Sampah', (select count(*) from public.cek_nomor_order('7700'))::text, '0');
end $$;

-- nomor dipakai order baru, lalu order lama dipulihkan: harus ditolak
do $$
declare b uuid;
begin
  b := public.buat_order(jsonb_build_object('order_number', '7700', 'customer_name', 'Pengganti',
    'items', jsonb_build_array(tes.item('IDS 001', 'PREMIUM', 'MAN', '2026-10-07'))));
  perform tes.gagal('pulihkan order bernomor kembar ditolak', format($q$select public.pulihkan_sampah('order', %L)$q$, tes.id('o7700')), 'sudah dipakai');
  perform public.hapus_order(b);
  perform public.pulihkan_sampah('order', tes.id('o7700'));
  perform tes.sama('order dipulihkan lengkap', (select quantity from public.v_orders where id = tes.id('o7700'))::text, '2');
  perform tes.sama('riwayat order_dipulihkan_sampah', (select count(*) from public.activity_logs where order_id = tes.id('o7700') and action = 'order_dipulihkan_sampah')::text, '1');
  perform tes.sama('order lain tetap di Sampah', (select count(*) from public.v_sampah where id = b)::text, '1');
  perform tes.simpan('o7700b', b);
  -- order batal juga bisa dihapus
  perform public.batalkan_order(tes.id('o7700'), 'Uji batal');
  perform public.hapus_order(tes.id('o7700'));
  perform tes.sama('order batal masuk Sampah', (select count(*) from public.v_sampah where id = tes.id('o7700'))::text, '1');
  perform public.pulihkan_sampah('order', tes.id('o7700'));
  perform tes.sama('order batal dipulihkan tetap batal', (select order_status from public.v_orders where id = tes.id('o7700')), 'dibatalkan');
  perform public.hapus_barang(tes.id('i7700_2'));
end $$;
reset role;

-- lewat 7 hari (dimundurkan langsung sebagai pemilik database, tanpa pemicu)
set session_replication_role = replica;
update public.orders set deleted_at = now() - interval '8 days' where id = tes.id('o7700b');
update public.order_items set deleted_at = now() - interval '8 days' where id = tes.id('i7700_2');
set session_replication_role = origin;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  perform tes.sama('lewat 7 hari tidak tampil di Sampah', (select count(*) from public.v_sampah where id in (tes.id('o7700b'), tes.id('i7700_2')))::text, '0');
  perform tes.gagal('order lewat 7 hari tidak bisa dipulihkan', format($q$select public.pulihkan_sampah('order', %L)$q$, tes.id('o7700b')), 'lebih dari 7 hari');
  perform tes.gagal('barang lewat 7 hari tidak bisa dipulihkan', format($q$select public.pulihkan_sampah('barang', %L)$q$, tes.id('i7700_2')), 'lebih dari 7 hari');
  perform tes.gagal('jenis Sampah tak dikenal', format($q$select public.pulihkan_sampah('x', %L)$q$, tes.id('o7700b')), 'tidak dikenal');
  perform tes.gagal('hapus permanen tetap ditolak', format('delete from public.orders where id = %L', tes.id('o7700b')), 'permission denied|tidak boleh');
  update public.app_settings set receipt_paper = 'A5' where id = 1;
  perform tes.sama('kertas nota A5 diterima', (select receipt_paper from public.app_settings), 'A5');
  perform tes.gagal('kertas A3 ditolak', $q$update public.app_settings set receipt_paper = 'A3' where id = 1$q$, 'check');
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  perform tes.gagal('bukan admin: hapus order', format('select public.hapus_order(%L)', tes.id('o7700')), 'bukan administrator');
  perform tes.gagal('bukan admin: pulihkan', format($q$select public.pulihkan_sampah('order', %L)$q$, tes.id('o7700')), 'bukan administrator');
  perform tes.sama('bukan admin: Sampah kosong', (select count(*) from public.v_sampah)::text, '0');
end $$;
reset role;

\echo
\echo '== T25 Berat minimal, order tanpa pelanggan, hapus pengrajin'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare v uuid; i uuid; p uuid;
begin
  perform tes.sama('berat minimal bawaan 6 gram', (select trim_scale(min_weight_grams)::text from public.app_settings), '6');
  v := public.buat_order(jsonb_build_object('order_number', '8800',
    'items', jsonb_build_array(tes.item('IDS 001', 'HIGH', 'MAN', '2026-10-08', '{"weight_grams": 6.5}'))));
  perform tes.sama('order tanpa nama pelanggan tersimpan', (select coalesce(customer_name, 'kosong') from public.orders where id = v), 'kosong');
  perform tes.sama('berat barang tersimpan', (select trim_scale(weight_grams)::text from public.v_items where order_id = v), '6.5');
  perform tes.gagal('berat di bawah 6 gram ditolak', format('select public.tambah_barang(%L, %L)', v,
    tes.item('IDS 001', 'HIGH', 'MAN', '2026-10-08', '{"weight_grams": 5.9}')), 'Berat minimal order 6 gram');
  i := tes.barang(v, 1);
  perform tes.gagal('ubah berat di bawah minimal ditolak', format('update public.order_items set weight_grams = 3 where id = %L', i), 'Berat minimal');
  update public.order_items set weight_grams = 8 where id = i;
  perform tes.sama('ubah berat tercatat di riwayat', (select count(*) from public.activity_logs where item_id = i and action = 'barang_diubah')::text, '1');
  update public.app_settings set min_weight_grams = 10 where id = 1;
  perform tes.sama('barang lama tetap sah setelah minimal dinaikkan', (select count(*) from public.v_items where id = i)::text, '1');
  perform tes.gagal('minimal baru 10 gram berlaku', format('select public.tambah_barang(%L, %L)', v,
    tes.item('IDS 001', 'HIGH', 'MAN', '2026-10-08', '{"weight_grams": 8}')), 'Berat minimal order 10 gram');
  perform public.tambah_barang(v, tes.item('IDS 001', 'HIGH', 'MAN', '2026-10-08'));
  perform tes.sama('barang tanpa berat tetap bisa (data lama)', (select count(*) from public.v_items where order_id = v)::text, '2');
  perform tes.gagal('minimal 0 ditolak', 'update public.app_settings set min_weight_grams = 0 where id = 1', 'check');
  update public.app_settings set min_weight_grams = 6 where id = 1;
  update public.orders set customer_name = '  ' where id = v;
  perform tes.sama('nama kosong disimpan sebagai kosong', (select coalesce(customer_name, 'kosong') from public.orders where id = v), 'kosong');

  -- hapus pengrajin
  p := tes.p('IDS 009');
  perform public.hapus_pengrajin(p);
  perform tes.sama('pengrajin terhapus hilang dari daftar', (select count(*) from public.v_craftsmen where id = p)::text, '0');
  perform tes.sama('pengrajin ada di Sampah', (select jenis || ':' || craftsman_code from public.v_sampah where id = p), 'pengrajin:IDS 009');
  perform tes.sama('riwayat pengrajin_dihapus', (select count(*) from public.activity_logs where craftsman_id = p and action = 'pengrajin_dihapus')::text, '1');
  perform tes.gagal('pengrajin terhapus tidak bisa diberi barang', format('select public.tambah_barang(%L, %L)', v,
    jsonb_build_object('craftsman_id', p, 'category_id', tes.k('HIGH'), 'gender', 'MAN', 'assigned_date', '2026-10-08', 'weight_grams', 7)), '.');
  perform tes.gagal('pengrajin di Sampah tidak bisa diubah', format($q$update public.craftsmen set name = 'X' where id = %L$q$, p), 'ada di Sampah');
  perform public.pulihkan_sampah('pengrajin', p);
  perform tes.sama('pengrajin dipulihkan', (select count(*) from public.v_craftsmen where id = p)::text, '1');
  perform tes.sama('riwayat pengrajin_dipulihkan', (select count(*) from public.activity_logs where craftsman_id = p and action = 'pengrajin_dipulihkan')::text, '1');
  -- ID dipakai pengrajin baru, lalu yang lama dipulihkan: ditolak
  perform public.hapus_pengrajin(p);
  insert into public.craftsmen (code, name) values ('IDS 009', 'Pengganti');
  perform tes.gagal('pulihkan pengrajin ber-ID kembar ditolak', format($q$select public.pulihkan_sampah('pengrajin', %L)$q$, p), 'sudah dipakai');
end $$;
reset role;

\echo
\echo '== T26 Stok perak per pengrajin dan nota manual'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare v uuid; p uuid; i1 uuid; i2 uuid; b1 uuid; n uuid; no1 int; r record;
begin
  perform tes.sama('perak standar lady 6 dan man 12',
    (select trim_scale(silver_lady_grams) || '/' || trim_scale(silver_man_grams) from public.app_settings), '6/12');
  insert into public.craftsmen (code, name) values ('IDS 020', 'Uji Perak') returning id into p;
  perform set_config('tes.pengrajin_perak', p::text, false);

  -- pembelian
  insert into public.silver_purchases (craftsman_id, purchase_date, grams) values (p, '2026-10-20', 50);
  insert into public.silver_purchases (craftsman_id, purchase_date, grams) values (p, '2026-11-02', 100) returning id into b1;
  insert into public.silver_purchases (craftsman_id, purchase_date, grams) values (p, '2026-11-03', 50);
  perform tes.gagal('pembelian 30 gram ditolak', format('insert into public.silver_purchases (craftsman_id, grams) values (%L, 30)', p), 'check');
  perform tes.gagal('pembelian 75 gram ditolak (bukan kelipatan 50)', format('insert into public.silver_purchases (craftsman_id, grams) values (%L, 75)', p), 'check');
  perform tes.gagal('tanggal pembelian masa depan ditolak',
    format($q$insert into public.silver_purchases (craftsman_id, purchase_date, grams) values (%L, public.hari_ini() + 1, 50)$q$, p), 'melewati hari ini');
  perform tes.gagal('pembelian untuk pengrajin tak dikenal ditolak',
    $q$insert into public.silver_purchases (craftsman_id, grams) values ('00000000-0000-0000-0000-000000000999', 50)$q$, 'tidak ditemukan|foreign key');

  -- pemakaian dari order: Lady 6 + Man 12 pada 2 November
  v := public.buat_order(jsonb_build_object('order_number', '9900', 'items', jsonb_build_array(
        jsonb_build_object('craftsman_id', p, 'category_id', tes.k('HIGH'), 'gender', 'LADY', 'assigned_date', '2026-11-02', 'weight_grams', 6),
        jsonb_build_object('craftsman_id', p, 'category_id', tes.k('HIGH'), 'gender', 'MAN',  'assigned_date', '2026-11-02', 'weight_grams', 12))));
  i1 := tes.barang(v, 1); i2 := tes.barang(v, 2);
  perform tes.sama('pemakaian tercatat per tanggal dan order',
    (select string_agg(tanggal || ' ' || order_number || '#' || item_no || ' ' || gender || ' ' || trim_scale(gram), ', ' order by item_no)
       from public.v_pemakaian_perak where craftsman_id = p), '2026-11-02 9900#1 LADY 6, 2026-11-02 9900#2 MAN 12');

  select * into r from public.laporan_perak('2026-11-15') where craftsman_id = p;
  perform tes.sama('laporan November: stok awal 50', trim_scale(r.stok_awal)::text, '50');
  perform tes.sama('laporan November: beli 150', trim_scale(r.beli_bulan)::text, '150');
  perform tes.sama('laporan November: pakai 18', trim_scale(r.pakai_bulan)::text, '18');
  perform tes.sama('laporan November: sisa akhir bulan 182', trim_scale(r.stok_akhir)::text, '182');
  perform tes.sama('stok sekarang = 200 - 18', trim_scale(r.stok_sekarang)::text, '182');
  select * into r from public.laporan_perak('2026-10-01') where craftsman_id = p;
  perform tes.sama('laporan Oktober: beli 50, pakai 0, sisa 50',
    trim_scale(r.beli_bulan) || '/' || trim_scale(r.pakai_bulan) || '/' || trim_scale(r.stok_akhir), '50/0/50');
  perform tes.sama('stok pengrajin lain tidak tercampur',
    (select count(*) from public.v_pembelian_perak where craftsman_id <> p and gram in (100))::text, '0');

  -- perubahan berat, batal, hapus ikut mengubah pemakaian (tanpa pencatatan ganda)
  update public.order_items set weight_grams = 7.5 where id = i1;
  perform tes.sama('ubah berat mengubah pemakaian', (select trim_scale(pakai_bulan)::text from public.laporan_perak('2026-11-01') where craftsman_id = p), '19.5');
  perform public.batalkan_barang(i2, 'uji batal');
  perform tes.sama('barang batal tidak dihitung', (select trim_scale(pakai_bulan)::text from public.laporan_perak('2026-11-01') where craftsman_id = p), '7.5');
  perform public.hapus_barang(i1);
  perform tes.sama('barang di Sampah tidak dihitung', (select trim_scale(pakai_bulan)::text from public.laporan_perak('2026-11-01') where craftsman_id = p), '0');
  perform public.pulihkan_sampah('barang', i1);

  -- selesai pengerjaan tidak mengubah pemakaian
  perform public.ubah_status(array[i1], 'selesai');
  perform tes.sama('selesai pengerjaan: status selesai', (select status::text from public.order_items where id = i1), 'selesai');
  perform tes.sama('selesai pengerjaan tidak mengubah pemakaian', (select trim_scale(pakai_bulan)::text from public.laporan_perak('2026-11-01') where craftsman_id = p), '7.5');

  -- hapus dan pulihkan pembelian
  perform public.hapus_pembelian_perak(b1);
  perform tes.sama('pembelian terhapus tidak dihitung', (select trim_scale(beli_bulan)::text from public.laporan_perak('2026-11-01') where craftsman_id = p), '50');
  perform tes.sama('pembelian ada di Sampah', (select jenis || ':' || jumlah_barang || ':' || craftsman_code from public.v_sampah where id = b1), 'pembelian:100:IDS 020');
  perform public.pulihkan_sampah('pembelian', b1);
  perform tes.sama('pembelian dipulihkan', (select trim_scale(beli_bulan)::text from public.laporan_perak('2026-11-01') where craftsman_id = p), '150');
  perform tes.sama('riwayat pembelian perak', (select string_agg(action, ',' order by created_at) from public.activity_logs where entity_id = b1),
    'perak_dibeli,perak_dihapus,perak_dipulihkan');

  -- nota manual
  insert into public.manual_notes (recipient, lines, total) values ('  Toko Uji ',
    '[{"banyak": 2, "nama": "Cincin perak", "harga": 150000, "jumlah": 1}, {"banyak": 1, "nama": "Liontin", "harga": 50000}]', 999)
    returning id, note_no into n, no1;
  perform tes.sama('total nota dihitung otomatis (total palsu diabaikan)', (select trim_scale(total)::text from public.manual_notes where id = n), '350000');
  perform tes.sama('jumlah per baris dihitung otomatis', (select trim_scale((lines -> 0 ->> 'jumlah')::numeric)::text from public.manual_notes where id = n), '300000');
  perform tes.sama('nama penerima dirapikan', (select recipient from public.manual_notes where id = n), 'Toko Uji');
  perform tes.gagal('harga minus ditolak', $q$insert into public.manual_notes (lines) values ('[{"banyak": 1, "nama": "x", "harga": -5}]')$q$, 'minus');
  perform tes.gagal('harga bukan angka ditolak', $q$insert into public.manual_notes (lines) values ('[{"banyak": 1, "nama": "x", "harga": "abc"}]')$q$, 'angka');
  update public.manual_notes set lines = '[{"banyak": 3, "nama": "Gelang", "harga": 100000}]', note_no = 999 where id = n;
  perform tes.sama('ubah nota: total baru, nomor tetap', (select trim_scale(total) || '/' || (note_no = no1) from public.manual_notes where id = n), '300000/true');
  perform public.hapus_nota(n);
  perform tes.sama('nota ada di Sampah', (select jenis from public.v_sampah where id = n), 'nota');
  perform public.pulihkan_sampah('nota', n);
  perform tes.gagal('hapus permanen nota ditolak', format('delete from public.manual_notes where id = %L', n), 'permission denied|tidak boleh');
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  perform tes.sama('bukan admin: pembelian perak tidak terlihat', (select count(*) from public.silver_purchases)::text, '0');
  perform tes.sama('bukan admin: nota tidak terlihat', (select count(*) from public.manual_notes)::text, '0');
  perform tes.gagal('bukan admin: tidak bisa membeli perak',
    $q$insert into public.silver_purchases (craftsman_id, grams) values (current_setting('tes.pengrajin_perak')::uuid, 50)$q$, 'row-level security|bukan administrator|violates|tidak ditemukan');
  perform tes.sama('bukan admin: laporan perak kosong', (select count(*) from public.laporan_perak('2026-11-01'))::text, '0');
end $$;
reset role;

\echo
\echo '== T27 Stok barang jadi (katalog)'
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare p uuid; b uuid; n int;
begin
  perform tes.sama('katalog terisi 49 model', (select count(*) from public.products where deleted_at is null)::text, '49');
  perform tes.sama('semua stok awal 0', (select sum(stock) from public.products)::text, '0');
  perform tes.sama('contoh model', (select name || '/' || class || '/' || kind || '/' || coalesce(gender::text, '-') from public.products where code = 'PR-GW01'),
    'Giwang Premium 01/PREMIUM/Giwang/LADY');
  select id into p from public.products where code = 'HI-M01';
  n := public.ubah_stok_produk(p, 5, 'Barang jadi dari pengrajin');
  perform tes.sama('tambah stok 5', n::text, '5');
  n := public.ubah_stok_produk(p, -2, 'Terjual');
  perform tes.sama('kurangi stok 2 -> 3', (select stock from public.products where id = p)::text, '3');
  perform tes.sama('riwayat stok tercatat', (select string_agg(delta || '>' || stock_after, ',' order by created_at) from public.product_stock_moves where product_id = p), '5>5,-2>3');
  perform tes.gagal('stok tidak boleh minus', format('select public.ubah_stok_produk(%L, -4)', p), 'tidak bisa dikurangi');
  perform tes.gagal('perubahan nol ditolak', format('select public.ubah_stok_produk(%L, 0)', p), 'tidak boleh nol');
  perform tes.gagal('stok tidak bisa diubah langsung', format('update public.products set stock = 99 where id = %L', p), 'tombol tambah');
  perform tes.gagal('riwayat stok tidak bisa diubah', format('update public.product_stock_moves set delta = 9 where product_id = %L', p), 'permission denied|tidak boleh');
  perform tes.sama('riwayat aktivitas stok', (select count(*) from public.activity_logs where entity_id = p and action = 'stok_produk_diubah')::text, '2');

  insert into public.products (code, name, class, kind, gender) values (' lx m09 ', 'Luxury  Man 09', 'LUXURY', 'Cincin', 'MAN') returning id into b;
  perform tes.sama('kode dirapikan', (select code || '|' || name from public.products where id = b), 'LX-M09|Luxury Man 09');
  perform tes.gagal('kode kembar ditolak', $q$insert into public.products (code, name, class) values ('LX-M09', 'X', 'LUXURY')$q$, 'sudah dipakai');
  perform tes.gagal('barang baru tidak boleh langsung berisi stok', $q$insert into public.products (code, name, class, stock) values ('ZZ-01', 'X', 'LUXURY', 5)$q$, 'stok 0');
  perform public.hapus_produk(b);
  perform tes.sama('barang terhapus masuk Sampah', (select jenis || ':' || order_number from public.v_sampah where id = b), 'produk:LX-M09');
  perform public.pulihkan_sampah('produk', b);
  perform tes.sama('barang dipulihkan', (select count(*) from public.products where id = b and deleted_at is null)::text, '1');
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  perform tes.sama('bukan admin: katalog tidak terlihat', (select count(*) from public.products)::text, '0');
  perform tes.gagal('bukan admin: tidak bisa ubah stok', $q$select public.ubah_stok_produk(gen_random_uuid(), 1)$q$, 'bukan administrator');
end $$;
reset role;

\echo
\echo '== SEMUA TES LULUS'
