import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, Printer, X } from 'lucide-react'
import { db } from '../lib/supabase'
import type { Barang } from '../lib/types'
import { akhirBulan, bacaRupiah, formatRupiah, formatTanggalHari, hariIni as tglHariIni, ketikRupiah, lokalKeIso } from '../lib/format'
import { useMuat } from '../sync/useMuat'
import { useSinkron } from '../sync/SyncProvider'
import { KotakGalat, Pemuat, cx } from '../components/ui/ui'
import { LogoResmi } from '../components/ui/LogoResmi'
import { kelompokPengrajin } from '../lib/nota'

// NOTA PEMBAYARAN pengrajin.
//   /cetak/pengrajin/<id order>                 semua pengrajin di satu order (satu halaman per pengrajin)
//   /cetak/pembayaran/<id pengrajin>?dari&sampai barang pengrajin yang selesai dalam periode itu
// Harga satuan kosong dan diketik langsung di nota; ketikan disimpan di perangkat ini per barang.

type Kertas = 'A4' | 'A5' | '80mm' | '58mm'
const KUNCI_HARGA = 'ids-harga-nota'

function bacaHarga(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KUNCI_HARGA) ?? '{}') as Record<string, number> } catch { return {} }
}
function simpanHarga(peta: Record<string, number>): void {
  try { localStorage.setItem(KUNCI_HARGA, JSON.stringify(peta)) } catch { /* abaikan */ }
}

function Baris({ label, isi }: { label: string; isi: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="w-40 shrink-0">{label}</span>
      <span className="font-semibold">: {isi}</span>
    </div>
  )
}

interface Kelompok { id: string; kode: string; nama: string | null; barang: Barang[] }

function HalamanNota({ g, sempit, zona, harga, ubahHarga }: {
  g: Kelompok
  sempit: boolean
  zona: string
  harga: Record<string, number>
  ubahHarga: (id: string, n: number | null) => void
}) {
  const [tglBayar, setTglBayar] = useState(() => tglHariIni(zona))
  const [sembunyi, setSembunyi] = useState<Set<string>>(new Set())
  const barang = g.barang.filter((b) => !sembunyi.has(b.id))
  const total = barang.reduce((t, b) => t + (harga[b.id] ?? 0), 0)
  // Kode OR: nomor order; bila satu order punya beberapa barang pengrajin ini, ditambah nomor barangnya.
  const kembar = new Map<string, number>()
  g.barang.forEach((b) => kembar.set(b.order_number, (kembar.get(b.order_number) ?? 0) + 1))

  return (
    <>
      <div className="flex flex-col items-center gap-2 border-b-2 border-black pb-3 text-center">
        <LogoResmi className={sempit ? 'max-h-8' : 'max-h-12'} />
        <h1 className={cx('mt-1 font-bold tracking-[0.2em]', sempit ? 'text-sm' : 'text-xl')}>NOTA PEMBAYARAN</h1>
      </div>
      <div className="mt-3 space-y-0.5">
        <Baris label="Nama pengrajin" isi={g.nama ?? '(nama belum diisi)'} />
        <Baris label="ID pengrajin" isi={g.kode} />
        <Baris label="Tanggal pembayaran" isi={
          <>
            <span className="hidden print:inline">{formatTanggalHari(tglBayar)}</span>
            <input type="date" value={tglBayar} onChange={(e) => setTglBayar(e.target.value)} aria-label="Tanggal pembayaran"
              className="rounded border border-ice-300 px-1 font-semibold print:hidden" />
            <span className="ml-2 text-xs font-normal text-ink-muted print:hidden">{formatTanggalHari(tglBayar)}</span>
          </>
        } />
      </div>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-y-2 border-black text-left">
            <th className="w-8 py-1.5 pr-2">No</th>
            <th className="py-1.5 pr-2">Kode OR</th>
            <th className="py-1.5 pr-2">Kategori + Gender</th>
            <th className="py-1.5 text-right">Harga Satuan</th>
            <th className="w-6 print:hidden" aria-label="Sembunyikan" />
          </tr>
        </thead>
        <tbody>
          {barang.map((b, i) => (
            <tr key={b.id} className="break-inside-avoid border-b border-black/40 align-middle">
              <td className="py-1.5 pr-2">{i + 1}</td>
              <td className="py-1.5 pr-2 font-semibold">{b.order_number}{(kembar.get(b.order_number) ?? 0) > 1 && <span className="font-normal">-{b.item_no}</span>}</td>
              <td className="py-1.5 pr-2">{b.category_name} {b.gender}</td>
              <td className="py-1 text-right">
                <input
                  inputMode="numeric"
                  aria-label={`Harga satuan barang ${i + 1}`}
                  placeholder="ketik harga"
                  value={harga[b.id] != null ? ketikRupiah(String(harga[b.id])) : ''}
                  onChange={(e) => ubahHarga(b.id, bacaRupiah(e.target.value.replace(/\./g, '')))}
                  className="isian-nota w-full max-w-[9rem] rounded border border-dashed border-ice-400 bg-gold-50/40 px-1.5 py-0.5 text-right tabular-nums placeholder:text-ink-muted/70"
                />
              </td>
              <td className="pl-1 print:hidden">
                <button type="button" title="Sembunyikan dari nota" onClick={() => setSembunyi((s) => new Set(s).add(b.id))}
                  className="rounded p-0.5 text-ink-muted hover:bg-bad-50 hover:text-bad-700"><X className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
          {barang.length === 0 && (
            <tr><td colSpan={4} className="py-4 text-center italic">Tidak ada barang.</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-y-2 border-black font-bold">
            <td colSpan={3} className="py-2 pr-2 text-right tracking-[0.15em]">TOTAL</td>
            <td className="py-2 text-right tabular-nums">{formatRupiah(total)}</td>
            <td className="print:hidden" />
          </tr>
        </tfoot>
      </table>
      {sembunyi.size > 0 && (
        <button type="button" onClick={() => setSembunyi(new Set())} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-navy-800 print:hidden">
          <Eye className="h-3.5 w-3.5" /> Tampilkan lagi {sembunyi.size} barang yang disembunyikan
        </button>
      )}

      <div className={cx('mt-10 flex items-end gap-4', sempit ? 'flex-col items-center text-center' : 'justify-between')}>
        <LogoResmi className={sempit ? 'max-h-7' : 'max-h-10'} />
        <p className="text-[11px]">Diterbitkan pada: <span className="font-semibold">{formatTanggalHari(tglHariIni(zona))}</span></p>
      </div>
    </>
  )
}

export default function Nota() {
  const { jenis = 'pengrajin', id = '' } = useParams()
  const [cari, setCari] = useSearchParams()
  const { pengaturan, zona } = useSinkron()
  const [kertas, setKertas] = useState<Kertas>('A4')
  const [harga, setHarga] = useState<Record<string, number>>(bacaHarga)
  const periode = jenis === 'pembayaran'
  const awalBulan = `${tglHariIni(zona).slice(0, 8)}01`
  const dari = cari.get('dari') ?? awalBulan
  const sampai = cari.get('sampai') ?? akhirBulan(awalBulan)

  useEffect(() => { if (pengaturan) setKertas(pengaturan.receipt_paper) }, [pengaturan])

  const ubahHarga = (idBarang: string, n: number | null) => {
    setHarga((h) => {
      const baru = { ...h }
      if (n == null) delete baru[idBarang]; else baru[idBarang] = n
      simpanHarga(baru)
      return baru
    })
  }

  const data = useMuat(async () => {
    if (periode) {
      const [p, b] = await Promise.all([
        db().from('craftsmen').select('id, code, name').eq('id', id).maybeSingle(),
        db().from('v_items').select('*').eq('craftsman_id', id).eq('is_active', true).in('status', ['selesai', 'diserahkan'])
          .gte('completed_at', lokalKeIso(`${dari}T00:00`, zona) ?? dari)
          .lte('completed_at', lokalKeIso(`${sampai}T23:59`, zona) ?? sampai)
          .order('completed_at'),
      ])
      if (p.error) throw p.error
      if (b.error) throw b.error
      if (!p.data) return { kelompok: [] as Kelompok[], kembali: '/pengrajin' }
      return {
        kelompok: [{ id: p.data.id as string, kode: p.data.code as string, nama: (p.data.name as string | null) ?? null, barang: (b.data ?? []) as Barang[] }],
        kembali: `/pengrajin/${id}`,
      }
    }
    const b = await db().from('v_items').select('*').eq('order_id', id).eq('is_active', true).order('item_no')
    if (b.error) throw b.error
    const semua = (b.data ?? []) as Barang[]
    const pengrajin = cari.get('pengrajin')
    return { kelompok: kelompokPengrajin(semua).filter((g) => !pengrajin || g.id === pengrajin), kembali: `/order/${id}` }
  }, [id, periode, dari, sampai, zona])

  // Ukuran kertas untuk dialog cetak browser.
  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = kertas === 'A4' ? '@page { size: A4; margin: 14mm; }' : kertas === 'A5' ? '@page { size: A5; margin: 10mm; }' : `@page { size: ${kertas} auto; margin: 3mm; }`
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [kertas])

  const kelompok = useMemo(() => data.data?.kelompok ?? [], [data.data])

  if (jenis === 'serah') return <Navigate to={`/order/${id}`} replace />
  if (data.memuat && !data.data) return <Pemuat />
  if (data.galat) return <div className="p-6"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>
  if (!kelompok.length && !periode) return <div className="p-6"><KotakGalat pesan="Order tidak ditemukan atau belum punya barang aktif." /></div>
  if (!kelompok.length) return <div className="p-6"><KotakGalat pesan="Pengrajin tidak ditemukan." /></div>

  const sempit = kertas === '80mm' || kertas === '58mm'
  const lebar = kertas === 'A4' ? 'max-w-[190mm]' : kertas === 'A5' ? 'max-w-[128mm]' : kertas === '80mm' ? 'max-w-[74mm]' : 'max-w-[52mm]'

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={data.data?.kembali ?? '/beranda'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <div className="ml-auto flex items-center gap-2">
          <select aria-label="Ukuran kertas" value={kertas} onChange={(e) => setKertas(e.target.value as Kertas)} className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm">
            <option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Thermal 80 mm</option><option value="58mm">Thermal 58 mm</option>
          </select>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Cetak
          </button>
        </div>
        {periode && (
          <div className="flex w-full flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-soft">Barang selesai dari</span>
            <input type="date" value={dari} onChange={(e) => e.target.value && setCari((c) => { c.set('dari', e.target.value); return c }, { replace: true })}
              className="h-9 rounded-lg border border-ice-300 px-2" />
            <span className="text-ink-soft">sampai</span>
            <input type="date" value={sampai} onChange={(e) => e.target.value && setCari((c) => { c.set('sampai', e.target.value); return c }, { replace: true })}
              className="h-9 rounded-lg border border-ice-300 px-2" />
          </div>
        )}
        <p className="w-full text-xs text-ink-muted">
          Ketik harga satuan langsung di nota; totalnya dihitung otomatis dan harga tersimpan di perangkat ini. Tanda × menyembunyikan barang dari nota.
          Tombol Cetak membuka pilihan printer, atau pilih "Simpan sebagai PDF".
        </p>
      </div>

      <div className={cx('mx-auto my-6 bg-white p-6 text-black shadow-card print:my-0 print:max-w-none print:p-0 print:shadow-none', lebar, sempit ? 'text-[11px]' : kertas === 'A5' ? 'text-[12px]' : 'text-[13px]')}>
        {kelompok.map((g, gi, arr) => (
          <section key={g.id} className={cx(gi < arr.length - 1 && 'break-after-page pb-12 print:pb-0')}>
            <HalamanNota g={g} sempit={sempit} zona={zona} harga={harga} ubahHarga={ubahHarga} />
          </section>
        ))}
      </div>
    </div>
  )
}
