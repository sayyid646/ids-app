import { useEffect, useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { db } from '../../lib/supabase'
import type { Barang, PengrajinRingkas } from '../../lib/types'
import { formatTanggalHari, hariIni, lokalKeIso } from '../../lib/format'
import { formatBerat } from '../../lib/orderSchema'
import { pesanGalat } from '../../lib/errors'
import { useSinkron } from '../../sync/SyncProvider'
import { Jendela } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Isian, Pemuat, Tombol, cx } from '../../components/ui/ui'

type Pilihan = Pick<PengrajinRingkas, 'id' | 'code' | 'name'>

/**
 * SELESAI PENGERJAAN: menandai barang yang sedang dikerjakan seorang pengrajin menjadi "Selesai Dikerjakan"
 * sekaligus, tanpa membuka order satu per satu. Riwayatnya tetap tercatat per barang.
 */
export function DialogSelesaiPengerjaan({ pengrajin, idOrder, tutup, berubah }: {
  pengrajin: Pilihan | null
  /** Bila diisi, hanya barang dari order ini. */
  idOrder?: string
  tutup: () => void
  berubah?: () => void
}) {
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const [barang, setBarang] = useState<Barang[] | null>(null)
  const [pilih, setPilih] = useState<Set<string>>(new Set())
  const [tanggal, setTanggal] = useState(() => hariIni(zona))
  const [galat, setGalat] = useState<string | null>(null)
  const [simpan, setSimpan] = useState(false)

  useEffect(() => {
    if (!pengrajin) return
    setBarang(null)
    setGalat(null)
    setTanggal(hariIni(zona))
    let q = db().from('v_items').select('*').eq('craftsman_id', pengrajin.id).eq('status', 'dalam_proses').eq('is_active', true)
    if (idOrder) q = q.eq('order_id', idOrder)
    q.order('assigned_date').order('order_number').order('item_no').then(({ data, error }) => {
      if (error) { setGalat(pesanGalat(error)); setBarang([]); return }
      const daftar = (data ?? []) as Barang[]
      setBarang(daftar)
      setPilih(new Set(daftar.map((b) => b.id)))
    })
  }, [pengrajin, idOrder, zona])

  const jalankan = async () => {
    if (!pengrajin || pilih.size === 0) return
    setSimpan(true)
    setGalat(null)
    try {
      // Hari ini: pakai jam sekarang. Tanggal lain: jam 12.00 waktu usaha.
      const waktu = tanggal === hariIni(zona) ? null : lokalKeIso(`${tanggal}T12:00`, zona)
      const { data, error } = await db().rpc('ubah_status', { p_items: [...pilih], p_status: 'selesai', p_waktu: waktu })
      if (error) throw error
      beri(`${Number(data ?? pilih.size)} barang ${pengrajin.code} ditandai selesai dikerjakan.`)
      berubah?.()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setSimpan(false)
    }
  }

  const ganti = (id: string) => setPilih((s) => { const b = new Set(s); if (b.has(id)) b.delete(id); else b.add(id); return b })

  return (
    <Jendela terbuka={pengrajin !== null} tutup={tutup} terkunci={simpan}
      judul={pengrajin ? `Selesai pengerjaan · ${pengrajin.code}${pengrajin.name ? ` ${pengrajin.name}` : ''}` : 'Selesai pengerjaan'}
      kaki={<>
        <Tombol ragam="hantu" onClick={tutup} disabled={simpan}>Batal</Tombol>
        <Tombol ikon={<CheckCheck className="h-4 w-4" />} memuat={simpan} disabled={!barang || pilih.size === 0} onClick={() => void jalankan()}>
          Tandai selesai ({pilih.size})
        </Tombol>
      </>}>
      {barang === null ? <Pemuat /> : barang.length === 0 ? (
        <p className="rounded-xl bg-ok-50 p-4 text-sm text-ok-700">Tidak ada barang yang sedang dikerjakan{idOrder ? ' di order ini' : ''}. Semua sudah selesai.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">Barang yang dicentang berubah menjadi <strong className="text-navy-900">Selesai Dikerjakan</strong>. Riwayat setiap barang tetap tersimpan.</p>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-navy-900">{barang.length} barang dalam proses</span>
            <button type="button" className="font-semibold text-navy-800 underline-offset-2 hover:underline"
              onClick={() => setPilih(pilih.size === barang.length ? new Set() : new Set(barang.map((b) => b.id)))}>
              {pilih.size === barang.length ? 'Kosongkan pilihan' : 'Pilih semua'}
            </button>
          </div>
          <ul className="max-h-[45vh] divide-y divide-ice-200 overflow-y-auto rounded-xl border border-ice-200">
            {barang.map((b) => (
              <li key={b.id}>
                <label className={cx('flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm', pilih.has(b.id) && 'bg-gold-50/50')}>
                  <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={pilih.has(b.id)} onChange={() => ganti(b.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-navy-900">Order {b.order_number} · #{b.item_no}</span>
                    <span className="block text-xs text-ink-soft">{b.category_name} {b.gender} · diberikan {formatTanggalHari(b.assigned_date)}</span>
                  </span>
                  {b.weight_grams != null && <span className="text-xs font-semibold tabular-nums text-gold-700">{formatBerat(b.weight_grams)}</span>}
                </label>
              </li>
            ))}
          </ul>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-navy-900">Tanggal selesai</span>
            <Isian type="date" max={hariIni(zona)} value={tanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
          </label>
        </div>
      )}
      {galat && <p role="alert" className="mt-3 rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
    </Jendela>
  )
}
