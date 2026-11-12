import { useMemo, useState } from 'react'
import { formatBerat } from '../lib/orderSchema'
import { Link } from 'react-router-dom'
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react'
import { formatAngka, formatBulan, formatTanggal, formatTanggalPanjang, formatTanggalWaktu, hariIni as tglHariIni, tglLokal } from '../lib/format'
import { barangDalamRentang, buatCsv, jumlahkan, produktivitas, ringkasBulanan, ringkasHarian, ringkasTahunan, type BarisBarang } from '../lib/laporan'
import { unduh } from '../lib/unduh'
import { unduhPdf } from '../lib/pdf'
import { pesanGalat } from '../lib/errors'
import { useSinkron } from '../sync/SyncProvider'
import { useSemuaBarang } from '../sync/useSemuaBarang'
import { useMaster } from '../sync/useMaster'
import { Kartu, KepalaHalaman, KotakGalat, Pemuat, Tombol, cx } from '../components/ui/ui'
import { PilihPeriode, periodeAwal, type NilaiPeriode } from '../components/PilihPeriode'
import { useNotifikasi } from '../components/ui/Notifikasi'

type Jenis = 'harian' | 'bulanan' | 'tahunan' | 'pengrajin' | 'selesai' | 'proses' | 'diserahkan' | 'belum'
const JENIS: { k: Jenis; label: string }[] = [
  { k: 'harian', label: 'Order harian' },
  { k: 'bulanan', label: 'Order bulanan' },
  { k: 'tahunan', label: 'Order tahunan' },
  { k: 'pengrajin', label: 'Produktivitas pengrajin' },
  { k: 'selesai', label: 'Barang selesai' },
  { k: 'proses', label: 'Barang dalam proses' },
  { k: 'diserahkan', label: 'Barang diserahkan' },
  { k: 'belum', label: 'Barang belum diserahkan' },
]

interface Tabel { kepala: string[]; baris: (string | number)[][]; kaki?: (string | number)[]; angka: number[] }

export default function Laporan() {
  const { zona, pengaturan } = useSinkron()
  const { beri } = useNotifikasi()
  const hariIni = tglHariIni(zona)
  const [periode, setPeriode] = useState<NilaiPeriode>(() => periodeAwal('bulan', hariIni))
  const [jenis, setJenis] = useState<Jenis>('harian')
  const [pdf, setPdf] = useState(false)
  const semua = useSemuaBarang()
  const master = useMaster()
  const r = periode.rentang

  const tabel = useMemo<Tabel | null>(() => {
    const rows: BarisBarang[] = semua.data ?? []
    if (!semua.data || !master.data) return null
    const kepalaRingkas = ['Order masuk', 'Barang masuk', 'Selesai dikerjakan', 'Diserahkan']
    const keBaris = (label: string, x: { order_masuk: number; barang_masuk: number; barang_selesai: number; barang_diserahkan: number }) =>
      [label, x.order_masuk, x.barang_masuk, x.barang_selesai, x.barang_diserahkan]
    if (jenis === 'harian' || jenis === 'bulanan' || jenis === 'tahunan') {
      const data = jenis === 'harian' ? ringkasHarian(rows, r, zona) : jenis === 'bulanan' ? ringkasBulanan(rows, r, zona) : ringkasTahunan(rows, r, zona)
      const label = (k: string) => (jenis === 'harian' ? formatTanggal(k) : jenis === 'bulanan' ? formatBulan(`${k}-01`) : k)
      const t = jumlahkan(data)
      return {
        kepala: [jenis === 'harian' ? 'Tanggal' : jenis === 'bulanan' ? 'Bulan' : 'Tahun', ...kepalaRingkas],
        baris: data.map((x) => keBaris(label(x.kunci), x)),
        kaki: keBaris('Total', t),
        angka: [1, 2, 3, 4],
      }
    }
    if (jenis === 'pengrajin') {
      const p = produktivitas(rows, master.data.pengrajin, r, zona).filter((x) => master.data!.pengrajin.find((y) => y.id === x.craftsman_id)?.is_active || x.ditugaskan || x.selesai || x.diserahkan || x.sedang_dikerjakan)
      const t = p.reduce((a, x) => ({ d: a.d + x.ditugaskan, s: a.s + x.selesai, z: a.z + x.diserahkan, p: a.p + x.sedang_dikerjakan }), { d: 0, s: 0, z: 0, p: 0 })
      return {
        kepala: ['ID', 'Pengrajin', 'Barang diterima', 'Selesai dikerjakan', 'Diserahkan', 'Sedang dikerjakan (sekarang)', 'Rata-rata hari selesai'],
        baris: p.map((x) => [x.code, x.name ?? '(nama belum diisi)', x.ditugaskan, x.selesai, x.diserahkan, x.sedang_dikerjakan, x.rata_hari === null ? '-' : String(x.rata_hari).replace('.', ',')]),
        kaki: ['', 'Total', t.d, t.s, t.z, t.p, ''],
        angka: [2, 3, 4, 5, 6],
      }
    }
    // Daftar barang
    let daftar: BarisBarang[]
    if (jenis === 'selesai') daftar = rows.filter((b) => b.completed_at && tglLokal(b.completed_at, zona) >= r.dari && tglLokal(b.completed_at, zona) <= r.sampai)
    else if (jenis === 'diserahkan') daftar = rows.filter((b) => b.delivered_at && tglLokal(b.delivered_at, zona) >= r.dari && tglLokal(b.delivered_at, zona) <= r.sampai)
    else if (jenis === 'proses') daftar = barangDalamRentang(rows, r, 'dalam_proses')
    else daftar = barangDalamRentang(rows, r, 'belum_diserahkan')
    daftar = [...daftar].sort((a, b) => (a.assigned_date + a.order_number).localeCompare(b.assigned_date + b.order_number) || a.item_no - b.item_no)
    return {
      kepala: ['Order', 'Berat', 'Pengrajin', 'Kategori', 'Gender', 'Diterima', 'Status', 'Selesai', 'Diserahkan'],
      baris: daftar.map((b) => [`${b.order_number} #${b.item_no}`, formatBerat(b.weight_grams), `${b.craftsman_code}${b.craftsman_name ? ` ${b.craftsman_name}` : ''}`,
        b.category_name, b.gender, formatTanggal(b.assigned_date),
        b.status === 'dalam_proses' ? 'Dalam Proses' : b.status === 'selesai' ? 'Selesai Dikerjakan' : 'Sudah Diserahkan',
        formatTanggalWaktu(b.completed_at, zona), formatTanggalWaktu(b.delivered_at, zona)]),
      kaki: [`${daftar.length} barang`, '', '', '', '', '', '', '', ''],
      angka: [],
    }
  }, [semua.data, master.data, jenis, r, zona])

  const judul = JENIS.find((j) => j.k === jenis)!.label
  const sub = `Periode ${formatTanggalPanjang(r.dari)} sampai ${formatTanggalPanjang(r.sampai)}`
  const berkas = `ids-${jenis}-${r.dari}-${r.sampai}`
  const definisi =
    jenis === 'proses' || jenis === 'belum'
      ? 'Barang yang diberikan ke pengrajin dalam periode ini dan statusnya saat ini sesuai judul.'
      : jenis === 'selesai' ? 'Barang yang tanggal selesai dikerjakannya jatuh dalam periode ini.'
      : jenis === 'diserahkan' ? 'Barang yang tanggal diserahkannya jatuh dalam periode ini.'
      : jenis === 'pengrajin' ? 'Diterima dihitung dari tanggal diberikan; selesai dan diserahkan dari tanggalnya masing-masing. Sedang dikerjakan = keadaan sekarang.'
      : 'Order dan barang masuk dihitung dari tanggal diberikan ke pengrajin. Selesai dan diserahkan dihitung dari tanggalnya masing-masing.'

  return (
    <>
      <KepalaHalaman
        judul="Laporan"
        sub="Semua angka dihitung langsung dari data order. Barang dan order yang dibatalkan tidak dihitung."
        aksi={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Tombol ragam="kedua" ikon={<FileSpreadsheet className="h-4 w-4" />} disabled={!tabel}
              onClick={() => { if (!tabel) return; unduh(new Blob([buatCsv(tabel.kepala, tabel.kaki ? [...tabel.baris, tabel.kaki] : tabel.baris)], { type: 'text/csv;charset=utf-8' }), `${berkas}.csv`); beri('CSV diunduh.') }}>
              Excel (CSV)
            </Tombol>
            <Tombol ragam="kedua" ikon={<FileDown className="h-4 w-4" />} disabled={!tabel} memuat={pdf}
              onClick={async () => {
                if (!tabel) return
                setPdf(true)
                try {
                  await unduhPdf({ judul, sub, usaha: pengaturan?.business_name ?? 'Intan Dua Saudara', kepala: tabel.kepala, baris: tabel.baris, kaki: tabel.kaki, namaBerkas: `${berkas}.pdf`, mendatar: tabel.kepala.length > 7 })
                  beri('PDF diunduh.')
                } catch (e) { beri(pesanGalat(e), 'galat') } finally { setPdf(false) }
              }}>
              PDF
            </Tombol>
            <Tombol ikon={<Printer className="h-4 w-4" />} disabled={!tabel} onClick={() => window.print()}>Cetak</Tombol>
          </div>
        }
      />

      <PilihPeriode nilai={periode} ubah={setPeriode} hariIni={hariIni} />
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 print:hidden" role="tablist" aria-label="Jenis laporan">
        {JENIS.map((j) => (
          <button key={j.k} type="button" role="tab" aria-selected={jenis === j.k} onClick={() => setJenis(j.k)}
            className={cx('shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold', jenis === j.k ? 'border-gold-400 bg-gold-50 text-navy-900' : 'border-ice-300 bg-white text-ink-soft hover:border-gold-300')}>
            {j.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {(semua.galat || master.galat) && <KotakGalat pesan={(semua.galat || master.galat)!} ulangi={() => { semua.muatUlang(); master.muatUlang() }} />}
        {!tabel ? <Pemuat teks="Menghitung laporan..." /> : (
          <Kartu className="overflow-hidden print:border-0 print:shadow-none">
            <div className="border-b border-ice-200 px-5 py-4">
              <p className="hidden text-xs font-semibold tracking-[0.2em] print:block">IDS · {(pengaturan?.business_name ?? 'INTAN DUA SAUDARA').toUpperCase()}</p>
              <h2 className="font-display text-2xl font-semibold text-navy-900">{judul}</h2>
              <p className="text-sm text-ink-soft">{sub}</p>
              <p className="mt-1 text-xs text-ink-muted">{definisi}</p>
            </div>
            {tabel.baris.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">Tidak ada data pada periode ini. <Link to="/order/baru" className="font-semibold text-gold-600 print:hidden">Masukkan order</Link></p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ice-50 text-xs font-semibold text-ink-muted">
                    <tr>{tabel.kepala.map((k, i) => <th key={k} className={cx('px-4 py-2.5', tabel.angka.includes(i) && 'text-right')}>{k}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-ice-100">
                    {tabel.baris.map((b, i) => (
                      <tr key={i} className="break-inside-avoid">
                        {b.map((v, j) => <td key={j} className={cx('px-4 py-2', tabel.angka.includes(j) && 'text-right tabular-nums', j === 0 && 'font-semibold text-navy-900')}>{typeof v === 'number' ? formatAngka(v) : v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  {tabel.kaki && (
                    <tfoot className="border-t-2 border-ice-200 bg-ice-50 font-bold text-navy-900">
                      <tr>{tabel.kaki.map((v, j) => <td key={j} className={cx('px-4 py-2.5', tabel.angka.includes(j) && 'text-right tabular-nums')}>{typeof v === 'number' ? formatAngka(v) : v}</td>)}</tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Kartu>
        )}
      </div>
    </>
  )
}
