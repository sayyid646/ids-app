import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db } from '../lib/supabase'
import { pesanGalat } from '../lib/errors'
import { useAuth } from '../auth/AuthProvider'
import { Bidang, Isian, Tombol } from '../components/ui/ui'
import { HalamanTamu } from './HalamanTamu'

const skema = z
  .object({
    sandi: z.string().min(8, 'Minimal 8 karakter').max(72, 'Maksimal 72 karakter'),
    ulangi: z.string(),
  })
  .refine((d) => d.sandi === d.ulangi, { message: 'Kata sandi tidak sama', path: ['ulangi'] })
type Masukan = z.infer<typeof skema>

/** Muncul setelah membuka tautan reset kata sandi dari email. */
export function SandiBaru() {
  const { selesaiPemulihan } = useAuth()
  const [galat, setGalat] = useState<string | null>(null)
  const [beres, setBeres] = useState(false)
  const { register, handleSubmit, formState } = useForm<Masukan>({ resolver: zodResolver(skema) })

  const kirim = handleSubmit(async (d) => {
    setGalat(null)
    try {
      const { error } = await db().auth.updateUser({ password: d.sandi })
      if (error) throw error
      setBeres(true)
    } catch (e) {
      setGalat(pesanGalat(e))
    }
  })

  return (
    <HalamanTamu judul="Buat kata sandi baru" sub="Gunakan minimal 8 karakter.">
      {beres ? (
        <div className="space-y-4">
          <p className="text-ink-soft">Kata sandi berhasil diganti.</p>
          <Tombol className="w-full" onClick={() => { selesaiPemulihan(); window.location.hash = '#/' }}>Lanjut ke aplikasi</Tombol>
        </div>
      ) : (
        <form onSubmit={kirim} className="space-y-4" noValidate>
          <Bidang label="Kata sandi baru" id="sandi" galat={formState.errors.sandi?.message}>
            <Isian id="sandi" type="password" autoComplete="new-password" salah={!!formState.errors.sandi} {...register('sandi')} />
          </Bidang>
          <Bidang label="Ulangi kata sandi" id="ulangi" galat={formState.errors.ulangi?.message}>
            <Isian id="ulangi" type="password" autoComplete="new-password" salah={!!formState.errors.ulangi} {...register('ulangi')} />
          </Bidang>
          {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
          <Tombol type="submit" className="w-full" memuat={formState.isSubmitting}>Simpan kata sandi</Tombol>
        </form>
      )}
    </HalamanTamu>
  )
}
