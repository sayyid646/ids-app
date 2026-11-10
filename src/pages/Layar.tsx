import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Tombol } from '../components/ui/ui'
import { HalamanTamu } from './HalamanTamu'
import { TandaIDS } from '../components/layout/Logo'

export function LayarMemuat() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-navy-900" role="status">
      <TandaIDS className="h-14 w-14" />
      <Loader2 className="h-5 w-5 animate-spin text-gold-300" aria-hidden />
      <span className="sr-only">Memuat</span>
    </div>
  )
}

export function BelumDiatur() {
  return (
    <HalamanTamu judul="Belum tersambung ke database" sub="Aplikasi sudah terpasang, tinggal disambungkan.">
      <div className="space-y-3 text-[15px] text-ink-soft">
        <p>Alamat dan kunci publik Supabase belum diisi saat aplikasi ini dibangun.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Selesaikan setup Supabase sesuai panduan.</li>
          <li>Isi <code className="rounded bg-ice-100 px-1">VITE_SUPABASE_URL</code> dan <code className="rounded bg-ice-100 px-1">VITE_SUPABASE_ANON_KEY</code> di GitHub: Settings, Secrets and variables, Actions, tab Variables.</li>
          <li>Jalankan ulang workflow &quot;Tes dan terbitkan&quot;.</li>
        </ol>
      </div>
    </HalamanTamu>
  )
}

export function BukanAdmin() {
  const { email, keluar, cekUlang } = useAuth()
  return (
    <HalamanTamu judul="Akses ditolak" sub="Akun ini belum menjadi administrator IDS.">
      <div className="space-y-4 text-[15px] text-ink-soft">
        <p>Anda masuk sebagai <strong className="text-navy-900">{email}</strong>.</p>
        <p>Jalankan perintah ini di Supabase, SQL Editor:</p>
        <pre className="overflow-x-auto rounded-xl bg-navy-900 p-3 text-xs text-gold-200">select public.jadikan_admin('{email}');</pre>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Tombol onClick={cekUlang}>Periksa lagi</Tombol>
          <Tombol ragam="kedua" onClick={() => void keluar()}>Keluar</Tombol>
        </div>
      </div>
    </HalamanTamu>
  )
}

export function GalatAuth() {
  const { galat, cekUlang, keluar } = useAuth()
  return (
    <HalamanTamu judul="Tidak bisa memeriksa akun" sub="Koneksi ke database bermasalah.">
      <div className="space-y-4">
        <p className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Tombol onClick={cekUlang}>Coba lagi</Tombol>
          <Tombol ragam="kedua" onClick={() => void keluar()}>Keluar</Tombol>
        </div>
      </div>
    </HalamanTamu>
  )
}

export function TidakDitemukan() {
  return (
    <div className="py-20 text-center">
      <p className="font-display text-4xl font-semibold text-navy-900">Halaman tidak ditemukan</p>
      <Link to="/" className="mt-4 inline-block font-semibold text-gold-600">Kembali ke awal</Link>
    </div>
  )
}
