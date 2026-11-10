import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { db } from '../lib/supabase'
import type { Riwayat as TRiwayat } from '../lib/types'
import { LABEL_AKSI } from '../lib/types'
import { formatAngka } from '../lib/format'
import { useMuat } from '../sync/useMuat'
import { useSinkron, useVersiData } from '../sync/SyncProvider'
import { DaftarRiwayat } from '../components/DaftarRiwayat'
import { Isian, KepalaHalaman, KotakGalat, Pemuat, Tombol } from '../components/ui/ui'

const PER_HALAMAN = 30

export default function Riwayat() {
  const { zona } = useSinkron()
  const versi = useVersiData(['activity_logs'])
  const [aksi, setAksi] = useState('')
  const [cari, setCari] = useState('')
  const [cariAktif, setCariAktif] = useState('')
  const [halaman, setHalaman] = useState(0)

  useEffect(() => {
    const t = window.setTimeout(() => { setCariAktif(cari.replace(/[,()%*\\:"']/g, '').trim()); setHalaman(0) }, 300)
    return () => window.clearTimeout(t)
  }, [cari])

  const data = useMuat(async () => {
    let q = db()
      .from('activity_logs')
      .select('id, created_at, actor_email, action, entity_type, order_number, old_value, new_value, note', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(halaman * PER_HALAMAN, halaman * PER_HALAMAN + PER_HALAMAN - 1)
    if (aksi) q = q.eq('action', aksi)
    if (cariAktif) q = q.ilike('order_number', `%${cariAktif}%`)
    const { data, error, count } = await q
    if (error) throw error
    return { baris: (data ?? []) as TRiwayat[], total: count ?? 0 }
  }, [versi, aksi, cariAktif, halaman])

  const total = data.data?.total ?? 0
  return (
    <>
      <KepalaHalaman judul="Riwayat aktivitas" sub="Setiap perubahan tercatat otomatis dan tidak bisa diubah atau dihapus." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Isian aria-label="Cari nomor order" placeholder="Cari nomor order" className="pl-10" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <select aria-label="Jenis aktivitas" value={aksi} onChange={(e) => { setAksi(e.target.value); setHalaman(0) }}
          className="h-11 rounded-xl border border-ice-300 bg-white px-3 text-sm sm:w-72">
          <option value="">Semua jenis aktivitas</option>
          {Object.entries(LABEL_AKSI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {data.galat && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
      {data.memuat && !data.data ? <Pemuat /> : data.data && (
        <>
          <DaftarRiwayat data={data.data.baris} zona={zona} />
          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-soft">
            <span>{total ? `${formatAngka(halaman * PER_HALAMAN + 1)}–${formatAngka(Math.min(total, (halaman + 1) * PER_HALAMAN))} dari ${formatAngka(total)}` : '0 catatan'}</span>
            <div className="flex gap-2">
              <Tombol kecil ragam="kedua" aria-label="Halaman sebelumnya" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}><ChevronLeft className="h-4 w-4" /></Tombol>
              <Tombol kecil ragam="kedua" aria-label="Halaman berikutnya" disabled={(halaman + 1) * PER_HALAMAN >= total} onClick={() => setHalaman((h) => h + 1)}><ChevronRight className="h-4 w-4" /></Tombol>
            </div>
          </div>
        </>
      )}
    </>
  )
}
