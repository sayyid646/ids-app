import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { db } from '../../lib/supabase'
import { pesanGalat } from '../../lib/errors'
import { kodeSama, skemaPengrajin, type DataPengrajin, type MasukanPengrajin } from '../../lib/pengrajinSchema'
import type { Pengrajin } from '../../lib/types'
import { tampilkanWa } from '../../lib/wa'
import { Jendela } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Bidang, Isian, IsianPanjang, Tombol } from '../../components/ui/ui'

interface Props {
  terbuka: boolean
  tutup: () => void
  /** Pengrajin yang diubah. Kosong = tambah pengrajin baru. */
  pengrajin: Pengrajin | null
  /** Daftar pengrajin yang ada, untuk mencegah ID ganda sebelum menyimpan. */
  semua: Pick<Pengrajin, 'id' | 'code'>[]
  tersimpan: (id: string) => void
}

function nilaiAwal(p: Pengrajin | null, semua: Pick<Pengrajin, 'code'>[]): MasukanPengrajin {
  if (p) {
    return { code: p.code, name: p.name ?? '', phone: p.phone ? tampilkanWa(p.phone) : '', address: p.address ?? '', notes: p.notes ?? '' }
  }
  // Usulan ID berikutnya: angka terbesar + 1, mis. IDS 010.
  const angka = semua.map((s) => /^IDS\s*(\d+)$/i.exec(s.code)?.[1]).filter(Boolean).map(Number)
  const berikut = angka.length ? Math.max(...angka) + 1 : 1
  return { code: `IDS ${String(berikut).padStart(3, '0')}`, name: '', phone: '', address: '', notes: '' }
}

export function FormPengrajin({ terbuka, tutup, pengrajin, semua, tersimpan }: Props) {
  const { beri } = useNotifikasi()
  const [galat, setGalat] = useState<string | null>(null)
  const ubah = pengrajin !== null
  const { register, handleSubmit, formState, reset, setError } = useForm<MasukanPengrajin, unknown, DataPengrajin>({
    resolver: zodResolver(skemaPengrajin),
    defaultValues: nilaiAwal(pengrajin, semua),
  })

  useEffect(() => {
    if (terbuka) {
      reset(nilaiAwal(pengrajin, semua))
      setGalat(null)
    }
    // Hanya saat jendela dibuka, supaya ketikan tidak terhapus oleh pembaruan realtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terbuka, pengrajin?.id])

  const simpan = handleSubmit(async (d) => {
    setGalat(null)
    if (semua.some((s) => s.id !== pengrajin?.id && kodeSama(s.code, d.code))) {
      setError('code', { message: `ID ${d.code} sudah dipakai pengrajin lain.` })
      return
    }
    try {
      const data = { code: d.code, name: d.name, phone: d.phone, address: d.address, notes: d.notes }
      if (ubah) {
        const { error } = await db().from('craftsmen').update(data).eq('id', pengrajin.id)
        if (error) throw error
        beri('Data pengrajin disimpan.')
        tersimpan(pengrajin.id)
      } else {
        const { data: baru, error } = await db().from('craftsmen').insert(data).select('id').single()
        if (error) throw error
        beri(`Pengrajin ${d.code} ditambahkan.`)
        tersimpan((baru as { id: string }).id)
      }
      tutup()
    } catch (e) {
      const pesan = pesanGalat(e)
      if (/ID pengrajin sudah dipakai/.test(pesan)) setError('code', { message: pesan })
      else setGalat(pesan)
    }
  })

  const e = formState.errors
  return (
    <Jendela
      terbuka={terbuka}
      tutup={tutup}
      terkunci={formState.isSubmitting}
      judul={ubah ? `Ubah ${pengrajin.code}` : 'Tambah pengrajin'}
      kaki={
        <>
          <Tombol ragam="hantu" onClick={tutup} disabled={formState.isSubmitting}>Batal</Tombol>
          <Tombol type="submit" form="form-pengrajin" memuat={formState.isSubmitting}>Simpan</Tombol>
        </>
      }
    >
      <form id="form-pengrajin" onSubmit={simpan} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Bidang label="ID pengrajin" id="code" wajib galat={e.code?.message}>
            <Isian id="code" autoCapitalize="characters" salah={!!e.code} {...register('code')} />
          </Bidang>
          <Bidang label="Nama pengrajin" id="name" galat={e.name?.message} bantuan="Boleh dikosongkan bila nama belum diketahui.">
            <Isian id="name" autoComplete="off" salah={!!e.name} {...register('name')} />
          </Bidang>
        </div>
        {ubah && (
          <p className="rounded-xl bg-ice-100 px-3 py-2 text-sm text-ink-soft">
            Mengganti ID atau nama tidak memutus riwayat. Semua order lama tetap terhubung ke pengrajin ini.
          </p>
        )}
        <Bidang label="Nomor HP / WhatsApp" id="phone" galat={e.phone?.message} bantuan="Opsional.">
          <Isian id="phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0812 3456 7890" salah={!!e.phone} {...register('phone')} />
        </Bidang>
        <Bidang label="Alamat" id="address" galat={e.address?.message} bantuan="Opsional.">
          <IsianPanjang id="address" rows={2} salah={!!e.address} {...register('address')} />
        </Bidang>
        <Bidang label="Catatan" id="notes" galat={e.notes?.message}>
          <IsianPanjang id="notes" rows={3} placeholder="Keahlian khusus, jadwal, dan lain-lain" salah={!!e.notes} {...register('notes')} />
        </Bidang>
        {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      </form>
    </Jendela>
  )
}
