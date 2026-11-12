# IDS — Intan Dua Saudara

**Smart Jewelry Management.** Aplikasi pencatatan order perhiasan yang dibagikan ke 9 pengrajin: dari barang diberikan ke pengrajin, selesai dikerjakan, sampai diserahkan ke pembeli.

Alamat aplikasi: **https://intanduasaudara.github.io/**

## Status pengerjaan

Dikerjakan bertahap. Setiap fase baru dianggap selesai bila tesnya lulus.

| Fase | Isi | Status |
|---|---|---|
| 1 | Database: tabel, aturan bisnis, keamanan RLS, riwayat, statistik | Selesai, 193 pemeriksaan lulus |
| 2 | Koneksi Supabase, login admin, lupa kata sandi, sesi, sinkronisasi realtime | Selesai |
| 3 | Pendataan 9 pengrajin dan order (satu/banyak barang, cek nomor ganda) | Selesai |
| 4 | Status barang, tanggal otomatis, koreksi tanggal dengan riwayat | Selesai |
| 5 | Dashboard dan grafik, laporan (CSV, PDF, cetak), cari dan saring | Selesai |
| 6 | Nota pengrajin, nota serah terima (A4 / thermal), WhatsApp | Selesai |
| 7 | Animasi pembuka, kursor pemandu, tampilan desktop dan HP, PWA | Selesai |
| 8 | Tes otomatis database dan logika aplikasi di setiap perubahan | Selesai |

## Teknologi

React 18, TypeScript, Vite, Tailwind CSS, React Router, React Hook Form, Zod, Lucide, Supabase (PostgreSQL, Auth, Realtime, Storage). Framer Motion (animasi), Recharts (grafik), jsPDF (ekspor PDF), PWA (pasang di layar utama).

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
   - **Site URL:** `https://intanduasaudara.github.io/`
   - **Redirect URLs:** tambahkan `https://intanduasaudara.github.io/**`
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
