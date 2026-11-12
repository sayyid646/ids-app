import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Printer, Save, Trash2, X } from 'lucide-react'
import { db } from '../../lib/supabase'
import { bacaRupiah, formatRupiah, formatTanggalHari, hariIni, ketikRupiah } from '../../lib/format'
import { pesanGalat } from '../../lib/errors'
import { useSinkron } from '../../sync/SyncProvider'
import { useMuat } from '../../sync/useMuat'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Konfirmasi } from '../../components/ui/Dialog'
import { KotakGalat, Pemuat, Tombol, cx } from '../../components/ui/ui'
import { LogoResmi } from '../../components/ui/LogoResmi'

// Nota manual: diketik bebas, jumlah = banyaknya x harga, total otomatis.
// Disimpan di database supaya bisa dibuka, diubah, dan dicetak lagi dari perangkat mana pun.

interface BarisKetik { banyak: string; nama: string; harga: string }
interface NotaTersimpan {
  id: string
  note_no: number
  note_date: string
  recipient: string | null
  lines: { banyak: number; nama: string; harga: number; jumlah: number }[]
  total: number
}
type Kertas = 'A4' | 'A5'

const barisKosong = (): BarisKetik => ({ banyak: '', nama: '', harga: '' })
const angka = (t: string): number => {
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}
const jumlahBaris = (b: BarisKetik) => Math.round(angka(b.banyak) * (bacaRupiah(b.harga) ?? 0) * 100) / 100

export default function EditorNota() {
  const { id } = useParams()
  const baru = !id
  const navigasi = useNavigate()
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const [tanggal, setTanggal] = useState(() => hariIni(zona))
  const [kepada, setKepada] = useState('')
  const [baris, setBaris] = useState<BarisKetik[]>(() => [barisKosong(), barisKosong(), barisKosong()])
  const [nomor, setNomor] = useState<number | null>(null)
  const [berubah, setBerubah] = useState(false)
  const [menyimpan, setMenyimpan] = useState(false)
  const [tanyaHapus, setTanyaHapus] = useState(false)
  const [kertas, setKertas] = useState<Kertas>('A5')

  const data = useMuat(async () => {
    if (!id) return null
    const { data, error } = await db().from('manual_notes').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (error) throw error
    return data as NotaTersimpan | null
  }, [id])

  useEffect(() => {
    const n = data.data
    if (!n) return
    setTanggal(n.note_date)
    setKepada(n.recipient ?? '')
    setNomor(n.note_no)
    setBaris(n.lines.length
      ? n.lines.map((b) => ({ banyak: b.banyak ? String(b.banyak).replace('.', ',') : '', nama: b.nama, harga: b.harga ? ketikRupiah(String(b.harga)) : '' }))
      : [barisKosong()])
    setBerubah(false)
  }, [data.data])

  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = kertas === 'A4' ? '@page { size: A4; margin: 14mm; }' : '@page { size: A5; margin: 10mm; }'
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [kertas])

  const total = useMemo(() => baris.reduce((t, b) => t + jumlahBaris(b), 0), [baris])
  const ubah = (i: number, k: keyof BarisKetik, v: string) => {
    setBaris((s) => s.map((b, j) => (j === i ? { ...b, [k]: v } : b)))
    setBerubah(true)
  }

  const simpan = async (): Promise<boolean> => {
    setMenyimpan(true)
    try {
      const isi = baris
        .filter((b) => b.nama.trim() || b.banyak.trim() || b.harga.trim())
        .map((b) => ({ banyak: angka(b.banyak), nama: b.nama.trim(), harga: bacaRupiah(b.harga) ?? 0 }))
      const muatan = { note_date: tanggal, recipient: kepada.trim() || null, lines: isi }
      if (baru) {
        const { data: d, error } = await db().from('manual_notes').insert(muatan).select('id, note_no').single()
        if (error) throw error
        setBerubah(false)
        beri(`Nota No. ${d.note_no} disimpan.`)
        navigasi(`/nota/${d.id as string}`, { replace: true })
      } else {
        const { error } = await db().from('manual_notes').update(muatan).eq('id', id)
        if (error) throw error
        setBerubah(false)
        beri('Nota disimpan.')
      }
      return true
    } catch (e) {
      beri(pesanGalat(e), 'galat')
      return false
    } finally {
      setMenyimpan(false)
    }
  }

  const cetak = async () => {
    if (berubah || baru) {
      const ok = await simpan()
      if (!ok) return
    }
    window.setTimeout(() => window.print(), 150)
  }

  if (!baru && data.memuat && !data.data) return <Pemuat />
  if (!baru && data.galat) return <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />
  if (!baru && !data.memuat && !data.data) return <KotakGalat pesan="Nota tidak ditemukan atau sudah dihapus." />

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link to="/nota" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Daftar nota</Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select aria-label="Ukuran kertas" value={kertas} onChange={(e) => setKertas(e.target.value as Kertas)} className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm">
            <option value="A5">A5</option><option value="A4">A4</option>
          </select>
          {!baru && <Tombol ragam="hantu" className="text-bad-700 hover:bg-bad-50" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setTanyaHapus(true)}>Hapus</Tombol>}
          <Tombol ragam="kedua" ikon={<Save className="h-4 w-4" />} memuat={menyimpan} disabled={!berubah && !baru} onClick={() => void simpan()}>
            {berubah || baru ? 'Simpan' : 'Tersimpan'}
          </Tombol>
          <Tombol ikon={<Printer className="h-4 w-4" />} disabled={menyimpan} onClick={() => void cetak()}>Cetak</Tombol>
        </div>
      </div>

      <div className={cx('kaca mx-auto rounded-xl2 border border-ice-200 bg-white p-5 text-black shadow-card sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none',
        kertas === 'A5' ? 'max-w-[148mm] text-[12.5px]' : 'max-w-[190mm] text-[13.5px]')}>
        <div className="flex flex-col items-center border-b-2 border-black pb-3">
          <LogoResmi className="max-h-12" />
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <label className="flex min-w-[12rem] flex-1 items-end gap-2">
            <span className="shrink-0">Kepada Yth.</span>
            <input value={kepada} onChange={(e) => { setKepada(e.target.value); setBerubah(true) }} maxLength={120} placeholder="(boleh dikosongkan)"
              className="isian-nota min-w-0 flex-1 border-b border-dotted border-black/50 bg-transparent px-1 font-semibold focus:outline-none" />
          </label>
          <div className="text-right">
            <p>No. <span className="font-semibold">{nomor != null ? String(nomor).padStart(4, '0') : 'baru'}</span></p>
            <p className="flex items-center justify-end gap-1">
              <span className="hidden print:inline">{formatTanggalHari(tanggal)}</span>
              <input type="date" value={tanggal} onChange={(e) => { if (e.target.value) { setTanggal(e.target.value); setBerubah(true) } }}
                aria-label="Tanggal nota" className="rounded border border-ice-300 px-1 print:hidden" />
            </p>
          </div>
        </div>

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="border-y-2 border-black text-left">
              <th className="w-20 py-1.5 pr-2">Banyaknya</th>
              <th className="py-1.5 pr-2">Nama Barang</th>
              <th className="w-28 py-1.5 pr-2 text-right">Harga</th>
              <th className="w-28 py-1.5 text-right">Jumlah</th>
              <th className="w-6 print:hidden" aria-label="Hapus baris" />
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={i} className="border-b border-black/30 align-middle">
                <td className="py-1 pr-2">
                  <input inputMode="decimal" aria-label={`Banyaknya baris ${i + 1}`} value={b.banyak}
                    onChange={(e) => ubah(i, 'banyak', e.target.value.replace(/[^\d,.]/g, ''))}
                    className="isian-nota w-full rounded border border-dashed border-ice-400 bg-gold-50/40 px-1.5 py-0.5 text-center tabular-nums" />
                </td>
                <td className="py-1 pr-2">
                  <input aria-label={`Nama barang baris ${i + 1}`} value={b.nama} maxLength={200} onChange={(e) => ubah(i, 'nama', e.target.value)}
                    className="isian-nota w-full rounded border border-dashed border-ice-400 bg-gold-50/40 px-1.5 py-0.5" />
                </td>
                <td className="py-1 pr-2">
                  <input inputMode="numeric" aria-label={`Harga baris ${i + 1}`} value={b.harga} onChange={(e) => ubah(i, 'harga', ketikRupiah(e.target.value))}
                    className="isian-nota w-full rounded border border-dashed border-ice-400 bg-gold-50/40 px-1.5 py-0.5 text-right tabular-nums" />
                </td>
                <td className="py-1 text-right tabular-nums">{jumlahBaris(b) ? formatRupiah(jumlahBaris(b)) : ''}</td>
                <td className="pl-1 print:hidden">
                  <button type="button" title="Hapus baris" disabled={baris.length === 1}
                    onClick={() => { setBaris((s) => s.filter((_, j) => j !== i)); setBerubah(true) }}
                    className="rounded p-0.5 text-ink-muted hover:bg-bad-50 hover:text-bad-700 disabled:opacity-30"><X className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-y-2 border-black font-bold">
              <td colSpan={3} className="py-2 pr-2 text-right tracking-[0.15em]">TOTAL</td>
              <td className="py-2 text-right tabular-nums">{formatRupiah(total)}</td>
              <td className="print:hidden" />
            </tr>
          </tfoot>
        </table>
        <button type="button" onClick={() => { setBaris((s) => [...s, barisKosong()]); setBerubah(true) }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-navy-800 hover:bg-ice-100 print:hidden">
          <Plus className="h-4 w-4" /> Tambah baris
        </button>

        {/* Area tanda tangan, logo di sebelah kanan garis */}
        <div className="mt-12 flex items-end justify-end gap-5 break-inside-avoid">
          <div className="w-48 text-center">
            <p>Hormat kami,</p>
            <div className="mt-16 border-b border-black" />
          </div>
          <LogoResmi className="mb-0.5 max-h-9" />
        </div>
      </div>

      <Konfirmasi
        terbuka={tanyaHapus}
        tutup={() => setTanyaHapus(false)}
        judul="Hapus nota ini?"
        pesan={<p>Nota pindah ke <strong className="text-navy-900">Sampah</strong> dan bisa dipulihkan selama 7 hari.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          const { error } = await db().rpc('hapus_nota', { p_id: id })
          if (error) throw error
          beri('Nota dipindah ke Sampah.')
          navigasi('/nota', { replace: true })
        }}
      />
    </>
  )
}
