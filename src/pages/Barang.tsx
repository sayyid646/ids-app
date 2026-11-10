import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react'
import { db } from '../lib/supabase'
import type { Barang as TBarang, StatusBarang } from '../lib/types'
import { LABEL_STATUS } from '../lib/types'
import { NAMA_BULAN, formatAngka, formatTanggal, formatTanggalPendek, formatTanggalWaktu, tglLokal } from '../lib/format'
import { normalisasiWa, tampilkanWa } from '../lib/wa'
import { buatCsv } from '../lib/laporan'
import { pesanGalat } from '../lib/errors'
import { unduh } from '../lib/unduh'
import { useMuat } from '../sync/useMuat'
import { useSinkron, useVersiData } from '../sync/SyncProvider'
import { useMaster, labelPengrajin } from '../sync/useMaster'
import { Isian, Kartu, KepalaHalaman, KodePengrajin, Kosong, KotakGalat, LencanaStatus, Pemuat, Tombol, cx } from '../components/ui/ui'
import { useNotifikasi } from '../components/ui/Notifikasi'

const PER_HALAMAN = 25
const KELAS_PILIH = 'h-11 w-full rounded-xl border border-ice-300 bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold-300'
const SARING = ['pengrajin', 'kategori', 'gender', 'status', 'tahun', 'bulan', 'dari', 'sampai'] as const

function bersihkan(q: string): string {
  return q.replace(/[,()%*\\:"']/g, ' ').trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Kueri = any

/** Menerapkan kata cari dan saringan ke kueri v_items. Dipakai untuk tampilan dan ekspor. */
function terapkan(q: Kueri, p: URLSearchParams): Kueri {
  const cari = bersihkan(p.get('q') ?? '')
  if (cari) {
    // Setiap kata harus cocok di salah satu kolom: and(or(kata1...), or(kata2...)).
    const kata = cari.split(/\s+/).filter(Boolean).slice(0, 4)
    const grup: string[] = []
    for (const k of kata) {
      const s = `"%${k}%"`
      const syarat = [`order_number.ilike.${s}`, `customer_name.ilike.${s}`, `craftsman_code.ilike.${s}`, `craftsman_name.ilike.${s}`,
        `category_name.ilike.${s}`, `status_label.ilike.${s}`, `description.ilike.${s}`, `gender.ilike.${s}`]
      const wa = normalisasiWa(k)
      if (/^\+?\d{4,}$/.test(k) && wa) syarat.push(`customer_whatsapp.ilike."%${wa}%"`, `customer_whatsapp.ilike."%${k.replace(/\D/g, '')}%"`)
      // "ids001" tanpa spasi juga cocok dengan "IDS 001"
      const kode = /^ids\s*0*(\d+)$/i.exec(k)
      if (kode) syarat.push(`craftsman_code.ilike."%${kode[1].padStart(3, '0')}%"`)
      grup.push(`or(${syarat.join(',')})`)
    }
    q = q.or(`and(${grup.join(',')})`)
  }
  if (p.get('batal') !== '1') q = q.eq('is_active', true)
  if (p.get('pengrajin')) q = q.eq('craftsman_id', p.get('pengrajin'))
  if (p.get('kategori')) q = q.eq('category_id', p.get('kategori'))
  if (p.get('gender')) q = q.eq('gender', p.get('gender'))
  const st = p.get('status')
  if (st === 'belum_diserahkan') q = q.neq('status', 'diserahkan')
  else if (st) q = q.eq('status', st)
  if (p.get('tahun')) q = q.eq('production_year', Number(p.get('tahun')))
  if (p.get('bulan')) q = q.eq('production_month_no', Number(p.get('bulan')))
  if (p.get('dari')) q = q.gte('assigned_date', p.get('dari'))
  if (p.get('sampai')) q = q.lte('assigned_date', p.get('sampai'))
  return q
}

export default function Barang() {
  const [param, setParam] = useSearchParams()
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const master = useMaster()
  const versi = useVersiData(['orders', 'order_items', 'craftsmen', 'jewelry_categories'])
  const [ketik, setKetik] = useState(param.get('q') ?? '')
  const [halaman, setHalaman] = useState(0)
  const [ekspor, setEkspor] = useState(false)
  const kunci = param.toString()

  const ubah = (k: string, v: string) => {
    const p = new URLSearchParams(param)
    if (v) p.set(k, v)
    else p.delete(k)
    setParam(p, { replace: true })
    setHalaman(0)
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((param.get('q') ?? '') !== ketik.trim()) ubah('q', ketik.trim())
    }, 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ketik])
  useEffect(() => {
    setKetik(param.get('q') ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param.get('q')])

  const data = useMuat(async () => {
    let q = db().from('v_items').select('*', { count: 'exact' })
    q = terapkan(q, param)
    const { data, error, count } = await q
      .order('assigned_date', { ascending: false })
      .order('order_number', { ascending: false })
      .order('item_no')
      .range(halaman * PER_HALAMAN, halaman * PER_HALAMAN + PER_HALAMAN - 1)
    if (error) throw error
    return { baris: (data ?? []) as TBarang[], total: count ?? 0 }
  }, [versi, kunci, halaman])

  const tahunIni = Number(tglLokal(new Date(), zona).slice(0, 4))
  const tahun = Array.from({ length: 6 }, (_, i) => tahunIni - i)
  const adaSaringan = SARING.some((k) => param.get(k)) || param.get('batal') === '1' || !!param.get('q')
  const total = data.data?.total ?? 0

  const eksporCsv = async () => {
    setEkspor(true)
    try {
      const semua: TBarang[] = []
      for (let dari = 0; dari < 20000; dari += 1000) {
        const { data, error } = await terapkan(db().from('v_items').select('*'), param).order('assigned_date').order('order_number').order('item_no').range(dari, dari + 999)
        if (error) throw error
        semua.push(...(data as TBarang[]))
        if ((data as TBarang[]).length < 1000) break
      }
      const csv = buatCsv(
        ['Nomor order', 'Barang ke', 'Pelanggan', 'WhatsApp', 'ID pengrajin', 'Pengrajin', 'Kategori', 'Gender', 'Deskripsi', 'Diberikan ke pengrajin', 'Bulan produksi', 'Status', 'Selesai dikerjakan', 'Diserahkan', 'Dibatalkan'],
        semua.map((b) => [b.order_number, b.item_no, b.customer_name, tampilkanWa(b.customer_whatsapp), b.craftsman_code, b.craftsman_name ?? '', b.category_name, b.gender, b.description ?? '',
          formatTanggal(b.assigned_date), b.production_month.slice(0, 7), b.status_label, formatTanggalWaktu(b.completed_at, zona), formatTanggalWaktu(b.delivered_at, zona), b.is_active ? '' : 'ya']),
      )
      unduh(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `ids-barang-${tglLokal(new Date(), zona)}.csv`)
      beri(`${formatAngka(semua.length)} barang diekspor.`)
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setEkspor(false)
    }
  }

  return (
    <>
      <KepalaHalaman
        judul="Cari dan saring barang"
        sub={data.data ? `${formatAngka(total)} barang ${adaSaringan ? 'cocok' : ''}` : undefined}
        aksi={<Tombol ragam="kedua" ikon={<Download className="h-4 w-4" />} memuat={ekspor} disabled={!data.data || total === 0} onClick={eksporCsv}>Ekspor CSV</Tombol>}
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Isian aria-label="Cari" placeholder="Nomor order, pelanggan, WhatsApp, nama atau ID pengrajin, kategori, status" className="h-12 pl-10 text-base"
          value={ketik} onChange={(e) => setKetik(e.target.value)} autoFocus={!param.get('q') && !adaSaringan} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <select aria-label="Pengrajin" className={KELAS_PILIH} value={param.get('pengrajin') ?? ''} onChange={(e) => ubah('pengrajin', e.target.value)}>
          <option value="">Semua pengrajin</option>
          {master.data?.pengrajin.map((p) => <option key={p.id} value={p.id}>{labelPengrajin(p)}</option>)}
        </select>
        <select aria-label="Kategori" className={KELAS_PILIH} value={param.get('kategori') ?? ''} onChange={(e) => ubah('kategori', e.target.value)}>
          <option value="">Semua kategori</option>
          {master.data?.kategori.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
        <select aria-label="Gender" className={KELAS_PILIH} value={param.get('gender') ?? ''} onChange={(e) => ubah('gender', e.target.value)}>
          <option value="">LADY dan MAN</option>
          <option value="LADY">LADY</option>
          <option value="MAN">MAN</option>
        </select>
        <select aria-label="Status" className={KELAS_PILIH} value={param.get('status') ?? ''} onChange={(e) => ubah('status', e.target.value)}>
          <option value="">Semua status</option>
          {(Object.keys(LABEL_STATUS) as StatusBarang[]).map((s) => <option key={s} value={s}>{LABEL_STATUS[s]}</option>)}
          <option value="belum_diserahkan">Belum diserahkan</option>
        </select>
        <select aria-label="Tahun produksi" className={KELAS_PILIH} value={param.get('tahun') ?? ''} onChange={(e) => ubah('tahun', e.target.value)}>
          <option value="">Semua tahun</option>
          {tahun.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Bulan produksi" className={KELAS_PILIH} value={param.get('bulan') ?? ''} onChange={(e) => ubah('bulan', e.target.value)}>
          <option value="">Semua bulan</option>
          {NAMA_BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
        </select>
        <label className="col-span-1">
          <span className="sr-only">Diberikan dari tanggal</span>
          <Isian type="date" title="Diberikan dari tanggal" value={param.get('dari') ?? ''} onChange={(e) => ubah('dari', e.target.value)} className="text-sm" />
        </label>
        <label className="col-span-1">
          <span className="sr-only">Diberikan sampai tanggal</span>
          <Isian type="date" title="Diberikan sampai tanggal" value={param.get('sampai') ?? ''} onChange={(e) => ubah('sampai', e.target.value)} className="text-sm" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2 text-ink-soft">
          <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={param.get('batal') === '1'} onChange={(e) => ubah('batal', e.target.checked ? '1' : '')} />
          Sertakan yang dibatalkan
        </label>
        <span className="text-xs text-ink-muted">Tanggal = tanggal diberikan ke pengrajin. Tahun dan bulan = bulan produksi.</span>
        {adaSaringan && (
          <button type="button" className="ml-auto inline-flex items-center gap-1 font-semibold text-gold-600" onClick={() => { setKetik(''); setParam(new URLSearchParams(), { replace: true }) }}>
            <X className="h-4 w-4" /> Hapus semua saringan
          </button>
        )}
      </div>

      <div className="mt-5">
        {data.galat && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
        {data.memuat && !data.data ? <Pemuat /> : data.data && data.data.baris.length === 0 ? (
          <Kosong judul="Tidak ada yang cocok" isi="Coba kata lain atau kurangi saringan." />
        ) : data.data && (
          <>
            <Kartu className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ice-200 bg-ice-50 text-xs font-semibold text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Order</th><th className="px-4 py-3">Pelanggan</th><th className="px-4 py-3">Pengrajin</th>
                    <th className="px-4 py-3">Kategori</th><th className="px-4 py-3">Diterima</th><th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Selesai</th><th className="px-4 py-3">Diserahkan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ice-100">
                  {data.data.baris.map((b) => (
                    <tr key={b.id} className={cx('hover:bg-ice-50/70', !b.is_active && 'text-ink-muted')}>
                      <td className="px-4 py-3"><Link to={`/order/${b.order_id}`} className="font-semibold text-navy-900 hover:underline">{b.order_number}</Link> <span className="text-xs text-ink-muted">#{b.item_no}</span></td>
                      <td className="max-w-[180px] truncate px-4 py-3">{b.customer_name}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-2"><KodePengrajin kode={b.craftsman_code} /><span className="truncate">{b.craftsman_name ?? ''}</span></span></td>
                      <td className="px-4 py-3">{b.category_name} <span className="text-xs text-ink-muted">· {b.gender}</span></td>
                      <td className="px-4 py-3 tabular-nums" title={formatTanggal(b.assigned_date)}>{formatTanggalPendek(b.assigned_date)}</td>
                      <td className="px-4 py-3"><LencanaStatus status={b.status} batal={!b.is_active} /></td>
                      <td className="px-4 py-3 tabular-nums" title={formatTanggalWaktu(b.completed_at, zona)}>{b.completed_at ? formatTanggalPendek(tglLokal(b.completed_at, zona)) : '-'}</td>
                      <td className="px-4 py-3 tabular-nums" title={formatTanggalWaktu(b.delivered_at, zona)}>{b.delivered_at ? formatTanggalPendek(tglLokal(b.delivered_at, zona)) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Kartu>
            <ul className="space-y-3 lg:hidden">
              {data.data.baris.map((b) => (
                <li key={b.id}>
                  <Link to={`/order/${b.order_id}`}>
                    <Kartu className={cx('p-4', !b.is_active && 'opacity-70')}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-navy-900">Order {b.order_number} <span className="text-xs font-normal text-ink-muted">#{b.item_no}</span></p>
                          <p className="truncate text-sm text-ink-soft">{b.customer_name}</p>
                        </div>
                        <LencanaStatus status={b.status} batal={!b.is_active} />
                      </div>
                      <p className="mt-2 text-xs text-ink-soft">{b.category_name} · {b.gender} · {b.craftsman_code}{b.craftsman_name ? ` ${b.craftsman_name}` : ''}</p>
                      <p className="mt-1 text-xs text-ink-muted">Diterima {formatTanggal(b.assigned_date)}</p>
                    </Kartu>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-soft">
              <span>{formatAngka(halaman * PER_HALAMAN + 1)}–{formatAngka(Math.min(total, (halaman + 1) * PER_HALAMAN))} dari {formatAngka(total)}</span>
              <div className="flex gap-2">
                <Tombol kecil ragam="kedua" aria-label="Halaman sebelumnya" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}><ChevronLeft className="h-4 w-4" /></Tombol>
                <Tombol kecil ragam="kedua" aria-label="Halaman berikutnya" disabled={(halaman + 1) * PER_HALAMAN >= total} onClick={() => setHalaman((h) => h + 1)}><ChevronRight className="h-4 w-4" /></Tombol>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
