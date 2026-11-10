# IDS — Intan Dua Saudara

**Smart Jewelry Management.** Aplikasi pencatatan order perhiasan yang dibagikan ke 9 pengrajin: dari barang diberikan ke pengrajin, selesai dikerjakan, sampai diserahkan ke pembeli.

Alamat aplikasi: **https://sayyid646.github.io/ids-app/**

## Status pengerjaan

Dikerjakan bertahap. Setiap fase baru dianggap selesai bila tesnya lulus.

| Fase | Isi | Status |
|---|---|---|
| 1 | Database: tabel, aturan bisnis, keamanan RLS, riwayat, statistik | Selesai, 192 pemeriksaan lulus |
| 2 | Koneksi Supabase, login admin, lupa kata sandi, sesi, sinkronisasi realtime | Selesai |
| 3a | Pendataan pengrajin: daftar, tambah, ubah, aktif/nonaktif, detail, riwayat | Selesai |
| 3b | Pendataan order: satu dan banyak barang, cek nomor ganda | Berikutnya |
| 4 | Status barang dan koreksi tanggal | |
| 5 | Dashboard, laporan, pencarian | |
| 6 | Nota pengrajin, nota serah terima, WhatsApp | |
| 7 | Animasi, penyempurnaan tampilan, PWA | |
| 8 | Pengujian menyeluruh | |

## Teknologi

React 18, TypeScript, Vite, Tailwind CSS, React Router, React Hook Form, Zod, Lucide, Supabase (PostgreSQL, Auth, Realtime, Storage). Paket lain (Framer Motion, Recharts, PWA) ditambahkan di fase yang memakainya.

## Struktur folder

```
ids-app/
  .github/workflows/tes-dan-terbitkan.yml   tes database + periksa + bangun + terbitkan
  supabase/
    SETUP_LENGKAP.sql             semua migrasi dalam satu file (untuk SQL Editor)
    PANDUAN_SETUP_SUPABASE.md     langkah setup dari HP
    FASE_1_DATABASE.md            penjelasan tabel, aturan, dan angka dashboard
    migrations/                   8 file migrasi berurutan
    tests/                        tes otomatis database
  src/
    auth/AuthProvider.tsx         login, keluar, cek administrator, pemulihan sandi
    sync/SyncProvider.tsx         sinkronisasi realtime antarperangkat
    sync/useMuat.ts               pemuatan data
    lib/                          supabase, format tanggal, WhatsApp, pesan galat, tipe data
    components/ui/                tombol, isian, dialog, konfirmasi, notifikasi
    components/layout/            sidebar komputer, navigasi bawah HP, logo
    pages/                        halaman masuk, lupa sandi, sandi baru, pengrajin
```

## Menyiapkan (sekali saja)

1. **Database:** ikuti `supabase/PANDUAN_SETUP_SUPABASE.md`.
2. **Alamat login:** di Supabase, buka **Authentication**, lalu **URL Configuration**.
   - **Site URL:** `https://sayyid646.github.io/ids-app/`
   - **Redirect URLs:** tambahkan `https://sayyid646.github.io/ids-app/**`
3. **Sambungkan aplikasi:** isi Project URL dan anon/publishable key di file `.env.production`, lalu simpan ke cabang `main`. Kunci ini memang publik. Jangan pernah memasukkan service_role key atau secret key.
4. GitHub Actions membangun dan menerbitkan otomatis. Setelah hijau, aplikasi siap di alamat di atas.

## Cara kerja tanpa komputer

Setiap perubahan kode di cabang `main` otomatis:

1. menguji semua aturan database di PostgreSQL 16,
2. memeriksa tipe TypeScript dan menjalankan tes unit,
3. membangun aplikasi,
4. menerbitkannya ke GitHub Pages, **hanya bila semua tes lulus**.

Hasilnya bisa dilihat di tab **Actions** dari aplikasi GitHub di HP.

## Menjalankan di komputer (opsional)

Butuh Node.js 20 atau lebih baru.

```bash
npm install
cp .env.example .env     # lalu isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev              # buka alamat yang muncul
npm run typecheck        # periksa tipe
npm test                 # tes unit
npm run build            # hasil di folder dist/
```

Tes database (butuh PostgreSQL 16 dan psql):

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres bash supabase/tests/jalankan_tes.sh
```

## Keamanan

- Hanya akun yang dijadikan administrator lewat SQL Editor yang bisa membuka data.
- Pendaftaran akun baru dimatikan di Supabase.
- Kunci yang ada di aplikasi hanya kunci publik. Data dilindungi Row Level Security di database.
- Data usaha tidak bisa dihapus permanen dari aplikasi. Yang ada hanya batalkan, nonaktifkan, dan arsipkan.
- Setiap perubahan tercatat di riwayat aktivitas yang tidak bisa diubah.

## Lupa kata sandi

Tekan **Lupa kata sandi?** di halaman masuk, lalu buka tautan dari email **di HP atau browser yang sama** dengan tempat Anda menekan tombol itu.

## Cadangan data

Lihat bagian **Cadangan data** di `supabase/PANDUAN_SETUP_SUPABASE.md`. Ekspor CSV ditambahkan di fase laporan.
