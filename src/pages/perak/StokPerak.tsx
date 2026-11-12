import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Printer } from 'lucide-react'
import { formatBulan, formatGram, hariIni } from '../../lib/format'
import { useMuat } from '../../sync/useMuat'
import { useSinkron, useVersiData } from '../../sync/SyncProvider'
import { useMaster } from '../../sync/useMaster'
import { Kartu, KepalaHalaman, KotakGalat, Pemuat, Tombol, cx } from '../../components/ui/ui'
import { DialogBeliPerak } from './DialogBeliPerak'
import { awalBulanDari, muatLaporanPerak } from './perak'

/** Angka gram berwarna: sisa minus tampil merah (pemakaian lebih banyak dari pembelian). */
export function Gram({ n, tebal, minusMerah }: { n: number; tebal?: boolean; minusMerah?: boolean }) {
  return <span className={cx('tabular-nums', tebal && 'font-bold', minusMerah && n < 0 && 'text-bad-700')}>{formatGram(n)}</span>
}

export default function StokPerak() {
  const { zona } = useSinkron()
  const versi = useVersiData(['silver_purchases', 'order_items', 'orders', 'craftsmen'])
  const master = useMaster()
  const [bulan, setBulan] = useState(() => hariIni(zona).slice(0, 7))
  const [beli, setBeli] = useState(false)

  const data = useMuat(() => muatLaporanPerak(bulan), [bulan, versi])
  const baris = data.data ?? []
  const jumlah = (k: 'beli_bulan' | 'pakai_bulan' | 'stok_akhir' | 'stok_sekarang') => baris.reduce((t, r) => t + r[k], 0)

  return (
    <>
      <KepalaHalaman
        judul="Stok perak"
        sub="Stok perak setiap pengrajin dihitung otomatis: pembelian dikurangi pemakaian. Pemakaian diambil dari berat barang di setiap order."
        aksi={
          <div className="flex flex-wrap gap-2">
            <Link to={`/cetak-perak?bulan=${bulan}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-gold-300 bg-white px-4 text-sm font-semibold text-navy-900 hover:bg-gold-50">
              <Printer className="h-4 w-4" /> Cetak laporan
            </Link>
            <Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => setBeli(true)}>Catat pembelian</Tombol>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          Bulan
          <input type="month" value={bulan} onChange={(e) => e.target.value && setBulan(e.target.value)}
            className="h-11 rounded-xl border border-ice-300 bg-white px-3 text-sm font-normal focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300" />
        </label>
        <span className="text-sm text-ink-soft">{formatBulan(awalBulanDari(bulan))}</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Dibeli bulan ini', jumlah('beli_bulan'), 'text-navy-900'], ['Dipakai bulan ini', jumlah('pakai_bulan'), 'text-gold-700'],
          ['Sisa akhir bulan', jumlah('stok_akhir'), 'text-ok-700'], ['Sisa sekarang', jumlah('stok_sekarang'), 'text-navy-900']] as const).map(([l, n, w]) => (
          <Kartu key={l} className="kartu-pantul p-4">
            <p className="text-xs font-semibold tracking-wide text-ink-muted">{l.toUpperCase()}</p>
            <p className={cx('mt-1 font-display text-2xl font-semibold sm:text-3xl', n < 0 ? 'text-bad-700' : w)}>{formatGram(n)}</p>
            <p className="text-xs text-ink-muted">semua pengrajin</p>
          </Kartu>
        ))}
      </div>

      {data.memuat && !data.data && <Pemuat />}
      {data.galat && !data.data && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
      {baris.length > 0 && (
        <>
          {/* Komputer: tabel */}
          <Kartu className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-ice-50 text-left text-xs font-semibold tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3">Pengrajin</th>
                  <th className="px-4 py-3 text-right">Sisa awal bulan</th>
                  <th className="px-4 py-3 text-right">Dibeli</th>
                  <th className="px-4 py-3 text-right">Dipakai</th>
                  <th className="px-4 py-3 text-right">Sisa akhir bulan</th>
                  <th className="px-4 py-3 text-right">Sisa sekarang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ice-200">
                {baris.map((r) => (
                  <tr key={r.craftsman_id} className={cx('hover:bg-ice-50/60', !r.is_active && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <Link to={`/pengrajin/${r.craftsman_id}#perak`} className="font-semibold text-navy-900 hover:underline">{r.code}</Link>
                      <span className="ml-2 text-ink-soft">{r.name ?? '(nama belum diisi)'}</span>
                    </td>
                    <td className="px-4 py-3 text-right"><Gram n={r.stok_awal} minusMerah /></td>
                    <td className="px-4 py-3 text-right"><Gram n={r.beli_bulan} /></td>
                    <td className="px-4 py-3 text-right"><Gram n={r.pakai_bulan} /></td>
                    <td className="px-4 py-3 text-right"><Gram n={r.stok_akhir} tebal minusMerah /></td>
                    <td className="px-4 py-3 text-right"><Gram n={r.stok_sekarang} minusMerah /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Kartu>
          {/* HP: kartu */}
          <ul className="grid gap-3 md:hidden">
            {baris.map((r) => (
              <li key={r.craftsman_id}>
                <Link to={`/pengrajin/${r.craftsman_id}#perak`} className="block">
                  <Kartu className={cx('kartu-pantul p-4', !r.is_active && 'opacity-60')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold text-navy-900">{r.code} <span className="font-normal text-ink-soft">{r.name ?? ''}</span></p>
                      <p className={cx('font-display text-xl font-semibold tabular-nums', r.stok_akhir < 0 ? 'text-bad-700' : 'text-ok-700')}>{formatGram(r.stok_akhir)}</p>
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      Awal <Gram n={r.stok_awal} minusMerah /> · Beli <Gram n={r.beli_bulan} /> · Pakai <Gram n={r.pakai_bulan} />
                    </p>
                  </Kartu>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">
            Sisa minus (merah) berarti pemakaian lebih banyak dari pembelian yang dicatat. Catat pembelian perak supaya sisanya sesuai.
          </p>
        </>
      )}

      <DialogBeliPerak terbuka={beli} tutup={() => setBeli(false)} daftar={master.data?.pengrajin ?? []} />
    </>
  )
}
