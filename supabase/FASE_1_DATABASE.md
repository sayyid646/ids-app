# Fase 1: Database IDS

## Tabel

| Tabel | Isi |
|---|---|
| `profiles` | Akun login. Hanya peran `admin` yang bisa membuka data usaha. |
| `app_settings` | Pengaturan usaha (nama, alamat, WA, logo, nota, template WhatsApp, zona waktu). Selalu satu baris. |
| `jewelry_categories` | 8 kategori perhiasan. Bisa diganti nama atau dinonaktifkan, tidak dihapus. |
| `craftsmen` | Pengrajin. 9 slot awal, IDS 008 dan IDS 009 tanpa nama. |
| `orders` | Satu nomor order milik satu pelanggan. |
| `order_items` | Setiap barang di dalam order. Status, pengrajin, kategori, gender, dan tanggal dicatat per barang. |
| `activity_logs` | Riwayat semua perubahan. Tidak bisa diubah atau dihapus. |

View siap pakai untuk aplikasi: `v_items` (barang lengkap dengan order, pengrajin, kategori), `v_orders` (order dengan jumlah dan status gabungan), `v_craftsmen` (pengrajin dengan total barang per status).

## Aturan yang dijaga database

1. **Tiga tanggal tidak tercampur:** tanggal diberikan ke pengrajin, waktu selesai dikerjakan, waktu diserahkan ke pembeli.
2. **Selesai tidak sama dengan diserahkan.** Status dan tanggal selalu cocok:
   - Dalam Proses: belum ada tanggal selesai dan tanggal serah.
   - Selesai Dikerjakan: tanggal selesai terisi otomatis, tanggal serah kosong.
   - Sudah Diserahkan: tanggal serah terisi otomatis.
3. **Tanggal yang tidak masuk akal ditolak:** selesai sebelum diberikan, diserahkan sebelum selesai, atau tanggal di masa depan.
4. **Bulan produksi** otomatis dari tanggal diberikan. Bisa dikoreksi manual, dan koreksi manual tidak tertimpa.
5. **Nomor order tidak boleh ganda** (spasi dan huruf besar kecil diabaikan). Barang tambahan masuk ke order yang sama.
6. **Pengrajin dan kategori nonaktif** tidak bisa menerima barang baru. Barang lamanya tetap aman.
7. **Tidak ada hapus permanen** untuk pengrajin, kategori, order, barang, dan riwayat. Yang ada: batalkan, nonaktifkan, arsipkan.
8. **Riwayat otomatis** untuk: order dibuat, diubah, dibatalkan, dipulihkan; barang ditambahkan, diubah, dibatalkan; pengrajin ditugaskan; status diubah; tanggal selesai dan tanggal serah dikoreksi; pengrajin ditambah, diubah, diaktifkan, dinonaktifkan; kategori dan pengaturan diubah. Setiap catatan menyimpan waktu, email admin, jenis aksi, order terkait, nilai lama, dan nilai baru.
9. **Nomor WhatsApp** dirapikan ke format 62 (`0812-3456-7890` menjadi `6281234567890`). Nomor tidak valid ditolak.
10. **Keamanan:** RLS aktif di semua tabel. Pengunjung yang belum login tidak bisa apa-apa. Akun login yang bukan admin tidak melihat satu baris pun. Peran admin hanya bisa diberikan dari SQL Editor.

## Fungsi untuk aplikasi

| Fungsi | Kegunaan |
|---|---|
| `buat_order(data)` | Membuat order beserta barangnya dalam satu kali simpan (jumlah bawaan 1). |
| `tambah_barang(order, data)` | Menambah barang ke order yang sudah ada. |
| `cek_nomor_order(nomor)` | Peringatan nomor ganda sebelum menyimpan. |
| `ubah_status(barang[], status, waktu)` | Mengubah status satu atau banyak barang. Tanggal terisi otomatis. |
| `batalkan_order`, `pulihkan_order`, `batalkan_barang` | Pembatalan dengan alasan wajib. |
| `statistik_dashboard(dari, sampai)` | Semua angka kartu dashboard. |
| `statistik_bulanan(dari, sampai)` | Grafik per bulan. |
| `produktivitas_pengrajin(dari, sampai)` | Grafik dan tabel produktivitas. |
| `statistik_kategori(dari, sampai)` | Rincian kategori dan gender. |
| `cari_global(kata)` | Pencarian cepat di semua kolom penting. |

## Definisi angka dashboard

Barang aktif = barang yang tidak dibatalkan, dari order yang tidak dibatalkan.

| Angka | Arti |
|---|---|
| Total order | Order yang punya barang diberikan ke pengrajin dalam periode. |
| Total barang | Barang yang diberikan ke pengrajin dalam periode. |
| Dalam proses | Barang periode itu yang masih dikerjakan. |
| Selesai belum diserahkan | Barang periode itu yang sudah selesai tapi belum diambil pembeli. |
| Sudah diserahkan | Barang periode itu yang sudah diterima pembeli. |
| Selesai dikerjakan | Selesai belum diserahkan + sudah diserahkan. |
| Belum diserahkan | Dalam proses + selesai belum diserahkan. |
| Selesai pada periode | Barang yang tanggal selesainya jatuh di periode (kapan pun diberikan). |
| Diserahkan pada periode | Barang yang tanggal serahnya jatuh di periode. |
| Pengrajin aktif | Pengrajin berstatus aktif saat ini. |
| Order bulan ini | Order dengan barang diberikan sejak tanggal 1 bulan ini. |
| Saat ini | Keadaan seluruh barang aktif sekarang, tanpa filter periode. |

Semua tanggal dihitung dalam zona waktu usaha (bawaan WITA, bisa diubah di pengaturan). Contoh: selesai pukul 23.30 WITA tanggal 31 Maret dihitung 31 Maret, bukan 1 April.

## Tes otomatis

`supabase/tests/jalankan_tes.sh` membuat database baru, menjalankan semua migrasi, lalu menguji aturan di atas, termasuk RLS dengan akun admin, akun bukan admin, dan pengunjung. Hasil terakhir: lihat `tests/HASIL_TES_FASE_1.txt`.
