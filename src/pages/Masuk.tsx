import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '../auth/AuthProvider'
import { pesanGalat } from '../lib/errors'
import { Bidang, Isian, Tombol } from '../components/ui/ui'
import { HalamanTamu } from './HalamanTamu'

const skema = z.object({
  email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  sandi: z.string().min(1, 'Kata sandi wajib diisi'),
})
type Masukan = z.infer<typeof skema>

export function Masuk() {
  const { status, masuk } = useAuth()
  const [galat, setGalat] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Masukan>({ resolver: zodResolver(skema) })

  // Setelah masuk, halaman utama yang memutuskan: admin lanjut, akun lain melihat pesan akses ditolak.
  if (status === 'admin' || status === 'bukan_admin' || status === 'galat') return <Navigate to="/" replace />

  const kirim = handleSubmit(async (d) => {
    setGalat(null)
    try {
      await masuk(d.email, d.sandi)
    } catch (e) {
      setGalat(pesanGalat(e))
    }
  })

  return (
    <HalamanTamu judul="Masuk administrator" sub="Gunakan akun administrator IDS.">
      <form onSubmit={kirim} className="space-y-4" noValidate>
        <Bidang label="Email" id="email" galat={formState.errors.email?.message}>
          <Isian id="email" type="email" autoComplete="email" inputMode="email" placeholder="nama@gmail.com"
            salah={!!formState.errors.email} {...register('email')} />
        </Bidang>
        <Bidang label="Kata sandi" id="sandi" galat={formState.errors.sandi?.message}>
          <Isian id="sandi" type="password" autoComplete="current-password" salah={!!formState.errors.sandi} {...register('sandi')} />
        </Bidang>
        {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
        <Tombol type="submit" className="w-full" memuat={formState.isSubmitting}>Masuk</Tombol>
        <p className="text-center text-sm">
          <Link to="/lupa-sandi" className="font-semibold text-gold-600 hover:text-gold-700">Lupa kata sandi?</Link>
        </p>
      </form>
    </HalamanTamu>
  )
}
