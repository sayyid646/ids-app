import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db } from '../lib/supabase'
import { pesanGalat } from '../lib/errors'
import { Bidang, Isian, Tombol } from '../components/ui/ui'
import { HalamanTamu } from './HalamanTamu'

const skema = z.object({ email: z.string().trim().min(1, 'Email wajib diisi').email('Format email tidak valid') })
type Masukan = z.infer<typeof skema>

/** Alamat kembali setelah klik tautan di email: halaman utama aplikasi ini. */
export function alamatAplikasi(): string {
  return window.location.origin + window.location.pathname
}

export function LupaSandi() {
  const [terkirim, setTerkirim] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const { register, handleSubmit, formState } = useForm<Masukan>({ resolver: zodResolver(skema) })

  const kirim = handleSubmit(async (d) => {
    setGalat(null)
    try {
      const { error } = await db().auth.resetPasswordForEmail(d.email, { redirectTo: alamatAplikasi() })
      if (error) throw error
      setTerkirim(true)
    } catch (e) {
      setGalat(pesanGalat(e))
    }
  })

  return (
    <HalamanTamu judul="Lupa kata sandi" sub="Kami kirim tautan untuk membuat kata sandi baru.">
      {terkirim ? (
        <div className="space-y-4">
          <p className="text-ink-soft">
            Bila email tersebut terdaftar, tautan sudah dikirim. Buka email lalu tekan tautannya
            <strong className="text-navy-900"> di HP atau browser yang sama dengan yang Anda pakai sekarang.</strong>
          </p>
          <Link to="/masuk" className="font-semibold text-gold-600">Kembali ke halaman masuk</Link>
        </div>
      ) : (
        <form onSubmit={kirim} className="space-y-4" noValidate>
          <Bidang label="Email administrator" id="email" galat={formState.errors.email?.message}>
            <Isian id="email" type="email" autoComplete="email" inputMode="email" salah={!!formState.errors.email} {...register('email')} />
          </Bidang>
          {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
          <Tombol type="submit" className="w-full" memuat={formState.isSubmitting}>Kirim tautan</Tombol>
          <p className="text-center text-sm">
            <Link to="/masuk" className="font-semibold text-gold-600">Kembali ke halaman masuk</Link>
          </p>
        </form>
      )}
    </HalamanTamu>
  )
}
