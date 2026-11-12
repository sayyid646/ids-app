import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { formatBulan, formatGram, formatTanggalHari, hariIni } from '../../lib/format'
import { useMuat } from '../../sync/useMuat'
import { useSinkron } from '../../sync/SyncProvider'
import { KotakGalat, Pemuat } from '../../components/ui/ui'
import { LogoResmi } from '../../components/ui/LogoResmi'
import { awalBulanDari, muatLaporanPerak, muatRiwayatPerak } from './perak'

// Laporan perak bulanan siap cetak: ringkasan semua pengrajin, lalu satu halaman per pengrajin
// berisi pembelian dan pemakaian berdasarkan tanggal dan order.
export default function CetakPerak() {
  const [cari] = useSearchParams()
  const { zona } = useSinkron()
  const bulan = cari.get('bulan') ?? hariIni(zona).slice(0, 7)
  const satu = cari.get('pengrajin')

  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = '@page { size: A4; margin: 14mm; }'
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [])

  const data = useMuat(async () => {
    const [laporan, riwayat] = await Promise.all([muatLaporanPerak(bulan), muatRiwayatPerak(bulan, satu ?? undefined)])
    return { laporan: satu ? laporan.filter((r) => r.craftsman_id === satu) : laporan, ...riwayat }
  }, [bulan, satu])

  if (data.memuat && !data.data) return <Pemuat />
  if (data.galat) return <div className="p-6"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>
  const d = data.data!
  const judulBulan = formatBulan(awalBulanDari(bulan))
  const kembali = satu ? `/pengrajin/${satu}#perak` : '/perak'
  const jml = (k: 'beli_bulan' | 'pakai_bulan' | 'stok_akhir') => d.laporan.reduce((t, r) => t + r[k], 0)

  const Kepala = ({ sub }: { sub: string }) => (
    <div className="flex flex-col items-center gap-1 border-b-2 border-black pb-3 text-center">
      <LogoResmi className="max-h-11" />
      <h1 className="mt-1 text-lg font-bold tracking-[0.18em]">LAPORAN PERAK BULANAN</h1>
      <p className="font-semibold">{sub}</p>
    </div>
  )

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={kembali} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Cetak
        </button>
      </div>

      <div className="mx-auto my-6 max-w-[190mm] bg-white p-6 text-[12.5px] text-black shadow-card print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {!satu && (
          <section className="break-after-page pb-10 print:pb-0">
            <Kepala sub={`${judulBulan} · semua pengrajin`} />
            <table className="mt-4 w-full border-collapse">
              <thead>
                <tr className="border-y-2 border-black text-left">
                  <th className="py-1.5 pr-2">Pengrajin</th>
                  <th className="py-1.5 pr-2 text-right">Sisa awal</th>
                  <th className="py-1.5 pr-2 text-right">Dibeli</th>
                  <th className="py-1.5 pr-2 text-right">Dipakai</th>
                  <th className="py-1.5 text-right">Sisa akhir</th>
                </tr>
              </thead>
              <tbody>
                {d.laporan.map((r) => (
                  <tr key={r.craftsman_id} className="border-b border-black/30">
                    <td className="py-1.5 pr-2"><b>{r.code}</b> {r.name ?? ''}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatGram(r.stok_awal)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatGram(r.beli_bulan)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{formatGram(r.pakai_bulan)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{formatGram(r.stok_akhir)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-y-2 border-black font-bold">
                  <td className="py-2 pr-2 tracking-[0.15em]">TOTAL</td>
                  <td />
                  <td className="py-2 pr-2 text-right tabular-nums">{formatGram(jml('beli_bulan'))}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{formatGram(jml('pakai_bulan'))}</td>
                  <td className="py-2 text-right tabular-nums">{formatGram(jml('stok_akhir'))}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-6 text-right text-[11px]">Dicetak {formatTanggalHari(hariIni(zona))}</p>
          </section>
        )}

        {d.laporan.map((r, i, arr) => {
          const beli = d.beli.filter((b) => b.craftsman_id === r.craftsman_id)
          const pakai = d.pakai.filter((p) => p.craftsman_id === r.craftsman_id)
          return (
            <section key={r.craftsman_id} className={i < arr.length - 1 ? 'break-after-page pb-10 print:pb-0' : ''}>
              <Kepala sub={judulBulan} />
              <div className="mt-3 space-y-0.5">
                <p><span className="inline-block w-36">Nama pengrajin</span>: <b>{r.name ?? '(nama belum diisi)'}</b></p>
                <p><span className="inline-block w-36">ID pengrajin</span>: <b>{r.code}</b></p>
              </div>
              <table className="mt-3 w-full border-collapse">
                <tbody>
                  {([['Sisa awal bulan', r.stok_awal], ['Total pembelian perak', r.beli_bulan], ['Total pemakaian perak', r.pakai_bulan], ['Sisa stok perak (akhir bulan)', r.stok_akhir]] as const).map(([l, n], j) => (
                    <tr key={l} className={j === 3 ? 'border-y-2 border-black font-bold' : 'border-b border-black/30'}>
                      <td className="py-1.5">{l}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatGram(n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 className="mt-5 font-bold">Riwayat pembelian</h2>
              <table className="mt-1 w-full border-collapse">
                <thead><tr className="border-y border-black text-left"><th className="py-1 pr-2">Tanggal</th><th className="py-1 pr-2">Catatan</th><th className="py-1 text-right">Gram</th></tr></thead>
                <tbody>
                  {beli.length === 0 && <tr><td colSpan={3} className="py-2 italic">Tidak ada pembelian.</td></tr>}
                  {beli.map((b) => (
                    <tr key={b.id} className="border-b border-black/30"><td className="py-1 pr-2">{formatTanggalHari(b.tanggal)}</td><td className="py-1 pr-2">{b.notes ?? '-'}</td><td className="py-1 text-right tabular-nums">{formatGram(b.gram)}</td></tr>
                  ))}
                </tbody>
              </table>

              <h2 className="mt-5 font-bold">Riwayat pemakaian</h2>
              <table className="mt-1 w-full border-collapse">
                <thead><tr className="border-y border-black text-left"><th className="py-1 pr-2">Tanggal</th><th className="py-1 pr-2">Order</th><th className="py-1 pr-2">Barang</th><th className="py-1 text-right">Gram</th></tr></thead>
                <tbody>
                  {pakai.length === 0 && <tr><td colSpan={4} className="py-2 italic">Tidak ada pemakaian.</td></tr>}
                  {pakai.map((p) => (
                    <tr key={p.item_id} className="border-b border-black/30">
                      <td className="py-1 pr-2">{formatTanggalHari(p.tanggal)}</td>
                      <td className="py-1 pr-2">{p.order_number} #{p.item_no}</td>
                      <td className="py-1 pr-2">{p.category_name} {p.gender}</td>
                      <td className="py-1 text-right tabular-nums">{formatGram(p.gram)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6 text-right text-[11px]">Dicetak {formatTanggalHari(hariIni(zona))}</p>
            </section>
          )
        })}
      </div>
    </div>
  )
}
