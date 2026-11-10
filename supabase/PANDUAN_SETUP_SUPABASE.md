# Panduan Setup Database IDS di Supabase (bisa dari HP)

Waktu: sekitar 15 menit. Semua langkah bisa dilakukan dari browser HP (Safari atau Chrome).

## 1. Buat proyek Supabase

1. Buka **supabase.com**, tekan **Start your project**, lalu daftar (bisa memakai akun GitHub atau email).
2. Tekan **New project**.
   - **Name:** `IDS`
   - **Database Password:** buat kata sandi yang kuat dan **simpan baik-baik**. Ini kunci utama database.
   - **Region:** pilih **Southeast Asia (Singapore)** supaya cepat dari Indonesia.
3. Tunggu sekitar 2 menit sampai proyek siap.

## 2. Pasang struktur database

1. Di menu kiri, buka **SQL Editor**, lalu tekan **New query**.
2. Buka file `SETUP_LENGKAP.sql`, salin **seluruh** isinya, lalu tempel ke kotak SQL Editor.
3. Tekan **Run**.
4. Hasil yang benar: **Success. No rows returned**.

File ini aman dijalankan ulang. Kalau terputus di tengah jalan, jalankan lagi dari awal.

## 3. Buat akun administrator

1. Buka **Authentication**, lalu **Sign In / Providers** (atau **Providers**, lalu **Email**).
   Matikan **Allow new users to sign up**, supaya orang lain tidak bisa mendaftar sendiri.
2. Buka **Authentication**, lalu **Users**, lalu **Add user**, lalu **Create new user**.
   - Isi email dan kata sandi untuk login aplikasi IDS.
   - Centang **Auto Confirm User**.
3. Kembali ke **SQL Editor**, buat query baru, lalu jalankan (ganti emailnya):

```sql
select public.jadikan_admin('email-anda@gmail.com');
```

Hasil yang benar: `Berhasil: email-anda@gmail.com sekarang administrator IDS.`

## 4. Periksa hasilnya

Jalankan di SQL Editor:

```sql
select code as id_pengrajin, coalesce(name, '(belum ada nama)') as nama, is_active as aktif
from public.craftsmen order by code;
```

Harus muncul 9 baris, dari IDS 001 Haji Iskandar sampai IDS 009 (belum ada nama).

```sql
select name as kategori from public.jewelry_categories order by sort_order;
```

Harus muncul 8 kategori: PREMIUM, HIGH, SULTAN, LUXURY, LIONTIN, COUPLE, BRACELET, SPESIAL ITEM.

## 5. Catat dua nilai untuk fase berikutnya

Buka **Project Settings**, lalu **API** (atau **API Keys**). Catat:

- **Project URL** (contoh: `https://abcdefgh.supabase.co`)
- **anon public key** atau **publishable key** (diawali `eyJ...` atau `sb_publishable_...`)

Dua nilai ini aman dipasang di aplikasi. Data tetap terlindungi oleh login dan aturan keamanan (RLS).

**Jangan pernah membagikan** `service_role key`, `secret key`, atau Database Password kepada siapa pun, termasuk ke dalam chat.

## Cadangan data

- Paket gratis Supabase tidak menyimpan cadangan otomatis yang bisa Anda unduh. Aplikasi IDS nanti punya tombol **Ekspor CSV** untuk cadangan rutin.
- Paket berbayar Supabase menyimpan cadangan harian otomatis (**Database**, lalu **Backups**).
- Proyek gratis yang tidak dipakai selama 7 hari akan dijeda. Buka dashboard Supabase lalu tekan **Restore** untuk mengaktifkannya lagi. Datanya tidak hilang.
