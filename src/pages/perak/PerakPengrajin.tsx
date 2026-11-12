import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Coins, Plus, Printer, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatBulan, formatGram, formatTanggalHari, hariIni } from '../../lib/format'
import type { Pengrajin } from '../../lib/types'
import { useMuat } from '../../sync/useMuat'
import { useSinkron, useVersiData } from '../../sync/SyncProvider'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Konfirmasi } from '../../components/ui/Dialog'
import { Kartu, KotakGalat, Pemuat, Tombol, cx } from '../../components/ui/ui'
import { DialogBeliPerak } from './DialogBeliPerak'
import { awalBulanDari, muatLaporanPerak, muatRiwayatPerak, type Pembelian } from './perak'

/** Bagian "Perak" di halaman detail pengrajin: stok, pembelian, dan pemakaian per bulan. */
export function PerakPengrajin({ pengrajin }: { pengrajin: Pick<Pengrajin, 'id' | 'code' | 'name' | 'is_active'> }) {
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const versi = useVersiData(['silver_purchases', 'order_items', 'orders'])
  const [bulan, setBulan] = useState(() => hariIni(zona).slice(0, 7))
  const [beli, setBeli] = useState(false)
  const [hapus, setHapus] = useState<Pembelian | null>(null)
  const bagian = useRef<HTMLElement>(null)

  useEffect(() => {
    if (window.location.hash.endsWith('#perak')) window.setTimeout(() => bagian.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [])

  const data = useMuat(async () => {
    const [laporan, riwayat] = await Promise.all([muatLaporanPerak(bulan), muatRiwayatPerak(bulan, pengrajin.id)])
    return { r: laporan.find((x) => x.craftsman_id === pengrajin.id) ?? null, ...riwayat }
  }, [bulan, versi, pengrajin.id])
  const r = data.data?.r

  return (
    <section ref={bagian} id="perak" className="mt-8 scroll-mt-24" aria-labelledby="judul-perak">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="judul-perak" className="flex items-center gap-2 font-display text-2xl font-semibold text-navy-900"><Coins className="h-5 w-5 text-gold-600" /> Perak</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input type="month" aria-label="Bulan" value={bulan} onChange={(e) => e.target.value && setBulan(e.target.value)}
            className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300" />
          <Link to={`/cetak-perak?bulan=${bulan}&pengrajin=${pengrajin.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-gold-300 bg-white px-3 text-sm font-semibold text-navy-900 hover:bg-gold-50">
            <Printer className="h-4 w-4" /> Laporan
          </Link>
          {pengrajin.is_active && <Tombol kecil ikon={<Plus className="h-4 w-4" />} onClick={() => setBeli(true)}>Catat pembelian</Tombol>}
        </div>
      </div>

      {data.memuat && !data.data && <Pemuat />}
      {data.galat && !data.data && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
      {data.data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {([['Sisa awal bulan', r?.stok_awal ?? 0], ['Dibeli', r?.beli_bulan ?? 0], ['Dipakai', r?.pakai_bulan ?? 0],
              ['Sisa akhir bulan', r?.stok_akhir ?? 0], ['Sisa sekarang', r?.stok_sekarang ?? 0]] as const).map(([l, n], i) => (
              <Kartu key={l} className={cx('kartu-pantul p-4', i === 3 && 'ring-1 ring-gold-300')}>
                <p className="text-xs font-semibold tracking-wide text-ink-muted">{l.toUpperCase()}</p>
                <p className={cx('mt-1 font-display text-2xl font-semibold tabular-nums', n < 0 ? 'text-bad-700' : 'text-navy-900')}>{formatGram(n)}</p>
              </Kartu>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">{formatBulan(awalBulanDari(bulan))}. Sisa = pembelian − pemakaian. Pemakaian otomatis dari berat setiap barang yang diberikan ke {pengrajin.code}.</p>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Kartu className="p-4 sm:p-5">
              <h3 className="font-semibold text-navy-900">Riwayat pembelian</h3>
              {data.data.beli.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum ada pembelian di bulan ini.</p> : (
                <ul className="mt-2 divide-y divide-ice-200">
                  {data.data.beli.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-navy-900">{formatTanggalHari(b.tanggal)}</span>
                        {b.notes && <span className="block truncate text-xs text-ink-muted">{b.notes}</span>}
                      </span>
                      <span className="font-semibold tabular-nums text-navy-900">+{formatGram(b.gram)}</span>
                      <button type="button" aria-label={`Hapus pembelian ${formatTanggalHari(b.tanggal)}`} onClick={() => setHapus(b)}
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-bad-50 hover:text-bad-700"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
            <Kartu className="p-4 sm:p-5">
              <h3 className="font-semibold text-navy-900">Riwayat pemakaian</h3>
              {data.data.pakai.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Belum ada pemakaian di bulan ini.</p> : (
                <ul className="mt-2 divide-y divide-ice-200">
                  {data.data.pakai.map((p) => (
                    <li key={p.item_id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-navy-900">{formatTanggalHari(p.tanggal)}</span>
                        <Link to={`/order/${p.order_id}`} className="block truncate text-xs text-ink-soft hover:underline">
                          Order {p.order_number} · barang #{p.item_no} · {p.category_name} {p.gender}
                        </Link>
                      </span>
                      <span className="font-semibold tabular-nums text-gold-700">−{formatGram(p.gram)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          </div>
        </>
      )}

      <DialogBeliPerak terbuka={beli} tutup={() => setBeli(false)} pengrajin={pengrajin} />
      <Konfirmasi
        terbuka={hapus !== null}
        tutup={() => setHapus(null)}
        judul="Hapus pembelian perak?"
        pesan={<p>Pembelian {hapus ? formatGram(hapus.gram) : ''} tanggal {hapus ? formatTanggalHari(hapus.tanggal) : ''} pindah ke <strong className="text-navy-900">Sampah</strong> dan stok dihitung ulang. Bisa dipulihkan selama 7 hari.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          if (!hapus) return
          const { error } = await db().rpc('hapus_pembelian_perak', { p_id: hapus.id })
          if (error) throw error
          beri('Pembelian dipindah ke Sampah.')
        }}
      />
    </section>
  )
}
