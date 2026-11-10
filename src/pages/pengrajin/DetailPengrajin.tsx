import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, MapPin, Pencil, Phone, Power, Search } from 'lucide-react'
import { db } from '../../lib/supabase'
import type { Barang, PengrajinRingkas, Riwayat, StatusBarang } from '../../lib/types'
import { LABEL_AKSI, LABEL_STATUS } from '../../lib/types'
import { formatAngka, formatTanggal, formatTanggalPendek, formatTanggalWaktu, tglLokal } from '../../lib/format'
import { tampilkanWa } from '../../lib/wa'
import { useMuat } from '../../sync/useMuat'
import { useSinkron, useVersiData } from '../../sync/SyncProvider'
import {
  Isian, Kartu, KodePengrajin, Kosong, KotakGalat, LencanaAktif, LencanaStatus, NamaPengrajin, Pemuat, Tombol, cx,
} from '../../components/ui/ui'
import { Konfirmasi } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { FormPengrajin } from './FormPengrajin'
import { KonfirmasiStatusPengrajin } from './AksiPengrajin'

const PER_HALAMAN = 25
type SaringStatus = 'semua' | StatusBarang

/** Hapus karakter yang punya arti khusus di filter PostgREST. */
function bersihkanCari(q: string): string {
  return q.replace(/[,()%*\\:"']/g, ' ').trim()
}

export function DetailPengrajin() {
  const { id = '' } = useParams()
  const navigasi = useNavigate()
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const versi = useVersiData(['craftsmen', 'order_items', 'orders', 'jewelry_categories'])
  const versiLog = useVersiData(['activity_logs'])

  const [ubah, setUbah] = useState(false)
  const [ubahStatus, setUbahStatus] = useState<PengrajinRingkas | null>(null)
  const [tanyaArsip, setTanyaArsip] = useState(false)
  const [cari, setCari] = useState('')
  const [cariAktif, setCariAktif] = useState('')
  const [status, setStatus] = useState<SaringStatus>('semua')
  const [tampilBatal, setTampilBatal] = useState(false)
  const [halaman, setHalaman] = useState(0)

  // Pencarian dijalankan setelah berhenti mengetik sebentar.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setCariAktif(bersihkanCari(cari))
      setHalaman(0)
    }, 300)
    return () => window.clearTimeout(t)
  }, [cari])

  const pengrajin = useMuat(async () => {
    const [p, semua, jumlahRiwayat] = await Promise.all([
      db().from('v_craftsmen').select('*').eq('id', id).maybeSingle(),
      db().from('craftsmen').select('id, code').is('deleted_at', null),
      // Semua barang termasuk yang dibatalkan: penentu boleh tidaknya diarsipkan.
      db().from('order_items').select('id', { count: 'exact', head: true }).eq('craftsman_id', id),
    ])
    if (p.error) throw p.error
    if (semua.error) throw semua.error
    if (jumlahRiwayat.error) throw jumlahRiwayat.error
    return {
      p: p.data as PengrajinRingkas | null,
      semua: (semua.data ?? []) as { id: string; code: string }[],
      adaRiwayat: (jumlahRiwayat.count ?? 0) > 0,
    }
  }, [id, versi])

  const barang = useMuat(async () => {
    let q = db()
      .from('v_items')
      .select('*', { count: 'exact' })
      .eq('craftsman_id', id)
      .order('assigned_date', { ascending: false })
      .order('order_number', { ascending: false })
      .order('item_no')
      .range(halaman * PER_HALAMAN, halaman * PER_HALAMAN + PER_HALAMAN - 1)
    if (!tampilBatal) q = q.eq('is_active', true)
    if (status !== 'semua') q = q.eq('status', status)
    if (cariAktif) {
      const s = `"%${cariAktif}%"`
      q = q.or(`order_number.ilike.${s},customer_name.ilike.${s},category_name.ilike.${s},description.ilike.${s}`)
    }
    const { data, error, count } = await q
    if (error) throw error
    return { baris: (data ?? []) as Barang[], total: count ?? 0 }
  }, [id, versi, halaman, status, cariAktif, tampilBatal])

  const riwayat = useMuat(async () => {
    const { data, error } = await db()
      .from('activity_logs')
      .select('id, created_at, actor_email, action, entity_type, order_number, old_value, new_value, note')
      .eq('craftsman_id', id)
      .order('created_at', { ascending: false })
      .limit(15)
    if (error) throw error
    return (data ?? []) as Riwayat[]
  }, [id, versiLog])

  if (pengrajin.memuat && !pengrajin.data) return <Pemuat />
  if (pengrajin.galat && !pengrajin.data) return <KotakGalat pesan={pengrajin.galat} ulangi={pengrajin.muatUlang} />
  const p = pengrajin.data?.p
  if (!p) {
    return (
      <Kosong
        judul="Pengrajin tidak ditemukan"
        isi="Mungkin sudah diarsipkan atau tautannya salah."
        aksi={<Link to="/pengrajin" className="font-semibold text-gold-600">Kembali ke daftar pengrajin</Link>}
      />
    )
  }

  const total = barang.data?.total ?? 0
  const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN))
  const statistik = [
    { label: 'Total barang', nilai: p.total_items, warna: 'text-navy-900' },
    { label: 'Dalam proses', nilai: p.qty_dalam_proses, warna: 'text-navy-700' },
    { label: 'Selesai, belum diserahkan', nilai: p.qty_selesai, warna: 'text-gold-600' },
    { label: 'Sudah diserahkan', nilai: p.qty_diserahkan, warna: 'text-ok-600' },
  ]

  return (
    <>
      <Link to="/pengrajin" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Semua pengrajin
      </Link>

      {/* Kepala */}
      <Kartu className="relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-gold-200" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <KodePengrajin kode={p.code} />
              <LencanaAktif aktif={p.is_active} />
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-navy-900">
              <NamaPengrajin nama={p.name} />
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
              {p.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" aria-hidden />{tampilkanWa(p.phone)}</span>}
              {p.address && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden />{p.address}</span>}
            </div>
            {p.notes && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-ink-soft">{p.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Tombol ragam="kedua" ikon={<Pencil className="h-4 w-4" />} onClick={() => setUbah(true)}>Ubah data</Tombol>
            <Tombol ragam={p.is_active ? 'hantu' : 'utama'} ikon={<Power className="h-4 w-4" />} onClick={() => setUbahStatus(p)}>
              {p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            </Tombol>
          </div>
        </div>
      </Kartu>

      {/* Angka */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statistik.map((s) => (
          <Kartu key={s.label} className="p-4">
            <p className="text-xs font-semibold text-ink-muted">{s.label}</p>
            <p className={cx('mt-1 text-3xl font-bold tabular-nums', s.warna)}>{formatAngka(s.nilai)}</p>
          </Kartu>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">Angka di atas tidak menghitung barang atau order yang dibatalkan.</p>

      {/* Riwayat order */}
      <section className="mt-8" aria-labelledby="judul-riwayat-order">
        <h2 id="judul-riwayat-order" className="font-display text-2xl font-semibold text-navy-900">Riwayat order</h2>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Isian aria-label="Cari di riwayat order" placeholder="Cari nomor order, pelanggan, kategori" className="pl-10" value={cari} onChange={(e) => setCari(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring status">
            {(['semua', 'dalam_proses', 'selesai', 'diserahkan'] as SaringStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => { setStatus(s); setHalaman(0) }}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold',
                  status === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft hover:border-navy-700',
                )}
              >
                {s === 'semua' ? 'Semua' : LABEL_STATUS[s]}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={tampilBatal} onChange={(e) => { setTampilBatal(e.target.checked); setHalaman(0) }} />
            Tampilkan yang dibatalkan
          </label>
        </div>

        <div className="mt-4">
          {barang.galat && <KotakGalat pesan={barang.galat} ulangi={barang.muatUlang} />}
          {barang.memuat && !barang.data ? (
            <Pemuat />
          ) : barang.data && barang.data.baris.length === 0 ? (
            <Kosong
              judul={cariAktif || status !== 'semua' ? 'Tidak ada yang cocok' : 'Belum ada barang'}
              isi={cariAktif || status !== 'semua' ? 'Coba kata pencarian atau saringan lain.' : 'Barang yang diberikan ke pengrajin ini akan tampil di sini.'}
            />
          ) : barang.data ? (
            <>
              {/* Tabel komputer */}
              <Kartu className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ice-200 bg-ice-50 text-xs font-semibold text-ink-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3">Order</th>
                      <th scope="col" className="px-4 py-3">Pelanggan</th>
                      <th scope="col" className="px-4 py-3">Kategori</th>
                      <th scope="col" className="px-4 py-3">Diterima</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Selesai</th>
                      <th scope="col" className="px-4 py-3">Diserahkan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ice-100">
                    {barang.data.baris.map((b) => (
                      <tr key={b.id} className={cx('hover:bg-ice-50/60', !b.is_active && 'text-ink-muted')}>
                        <td className="px-4 py-3 font-semibold text-navy-900">
                          {b.order_number}<span className="ml-1 text-xs font-normal text-ink-muted">#{b.item_no}</span>
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-3">{b.customer_name}</td>
                        <td className="px-4 py-3">{b.category_name} <span className="text-xs text-ink-muted">· {b.gender}</span></td>
                        <td className="px-4 py-3 tabular-nums" title={formatTanggal(b.assigned_date)}>{formatTanggalPendek(b.assigned_date)}</td>
                        <td className="px-4 py-3"><LencanaStatus status={b.status} batal={!b.is_active} /></td>
                        <td className="px-4 py-3 tabular-nums" title={formatTanggalWaktu(b.completed_at, zona)}>
                          {b.completed_at ? formatTanggalPendek(tglLokal(b.completed_at, zona)) : '-'}
                        </td>
                        <td className="px-4 py-3 tabular-nums" title={formatTanggalWaktu(b.delivered_at, zona)}>
                          {b.delivered_at ? formatTanggalPendek(tglLokal(b.delivered_at, zona)) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Kartu>

              {/* Kartu HP */}
              <ul className="space-y-3 md:hidden">
                {barang.data.baris.map((b) => (
                  <li key={b.id}>
                    <Kartu className={cx('p-4', !b.is_active && 'opacity-70')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-navy-900">Order {b.order_number} <span className="text-xs font-normal text-ink-muted">#{b.item_no}</span></p>
                          <p className="text-sm text-ink-soft">{b.customer_name}</p>
                        </div>
                        <LencanaStatus status={b.status} batal={!b.is_active} />
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div><dt className="text-ink-muted">Diterima</dt><dd className="font-semibold text-navy-900">{formatTanggalPendek(b.assigned_date)}</dd></div>
                        <div><dt className="text-ink-muted">Selesai</dt><dd className="font-semibold text-navy-900">{b.completed_at ? formatTanggalPendek(tglLokal(b.completed_at, zona)) : '-'}</dd></div>
                        <div><dt className="text-ink-muted">Diserahkan</dt><dd className="font-semibold text-navy-900">{b.delivered_at ? formatTanggalPendek(tglLokal(b.delivered_at, zona)) : '-'}</dd></div>
                      </dl>
                      <p className="mt-2 text-xs text-ink-soft">{b.category_name} · {b.gender}</p>
                    </Kartu>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-soft">
                <span>
                  {formatAngka(halaman * PER_HALAMAN + 1)}–{formatAngka(Math.min(total, (halaman + 1) * PER_HALAMAN))} dari {formatAngka(total)} barang
                </span>
                <div className="flex gap-2">
                  <Tombol kecil ragam="kedua" aria-label="Halaman sebelumnya" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Tombol>
                  <Tombol kecil ragam="kedua" aria-label="Halaman berikutnya" disabled={halaman + 1 >= jumlahHalaman} onClick={() => setHalaman((h) => h + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Tombol>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* Riwayat aktivitas */}
      <section className="mt-10" aria-labelledby="judul-aktivitas">
        <h2 id="judul-aktivitas" className="font-display text-2xl font-semibold text-navy-900">Aktivitas terakhir</h2>
        <div className="mt-3">
          {riwayat.galat && <KotakGalat pesan={riwayat.galat} ulangi={riwayat.muatUlang} />}
          {riwayat.data && riwayat.data.length === 0 && <p className="text-sm text-ink-muted">Belum ada aktivitas.</p>}
          {riwayat.data && riwayat.data.length > 0 && (
            <Kartu>
              <ol className="divide-y divide-ice-100">
                {riwayat.data.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <span className="w-44 shrink-0 text-xs tabular-nums text-ink-muted">{formatTanggalWaktu(r.created_at, zona)}</span>
                    <span className="flex-1 text-sm text-navy-900">
                      <strong className="font-semibold">{LABEL_AKSI[r.action] ?? r.action}</strong>
                      {r.order_number && <span className="text-ink-soft"> · Order {r.order_number}</span>}
                      <RingkasPerubahan r={r} />
                    </span>
                    <span className="truncate text-xs text-ink-muted">{r.actor_email}</span>
                  </li>
                ))}
              </ol>
            </Kartu>
          )}
        </div>
      </section>

      {/* Arsip: hanya untuk pengrajin tanpa riwayat sama sekali */}
      <section className="mt-10 rounded-xl2 border border-ice-200 bg-white/60 p-5">
        <h2 className="font-semibold text-navy-900">Hapus dari daftar</h2>
        {pengrajin.data?.adaRiwayat ? (
          <p className="mt-1 text-sm text-ink-soft">
            Pengrajin yang sudah punya riwayat order tidak bisa dihapus, supaya data lama tetap utuh. Gunakan <strong>Nonaktifkan</strong>.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-soft">Pengrajin ini belum pernah menerima barang, jadi boleh diarsipkan bila salah dibuat.</p>
            <Tombol ragam="kedua" kecil ikon={<Archive className="h-4 w-4" />} onClick={() => setTanyaArsip(true)}>Arsipkan</Tombol>
          </div>
        )}
      </section>

      <FormPengrajin terbuka={ubah} tutup={() => setUbah(false)} pengrajin={p} semua={pengrajin.data?.semua ?? []} tersimpan={pengrajin.muatUlang} />
      <KonfirmasiStatusPengrajin pengrajin={ubahStatus} tutup={() => setUbahStatus(null)} berubah={pengrajin.muatUlang} />
      <Konfirmasi
        terbuka={tanyaArsip}
        tutup={() => setTanyaArsip(false)}
        judul={`Arsipkan ${p.code}?`}
        bahaya
        labelYa="Arsipkan"
        pesan={<p>Pengrajin ini tidak akan tampil lagi di daftar. Catatan penambahannya tetap ada di riwayat aktivitas.</p>}
        jalankan={async () => {
          const { error } = await db().from('craftsmen').update({ deleted_at: new Date().toISOString() }).eq('id', p.id)
          if (error) throw error
          beri(`${p.code} diarsipkan.`)
          navigasi('/pengrajin', { replace: true })
        }}
      />
    </>
  )
}

function nilaiTeks(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'kosong'
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak'
  if (typeof v === 'string' && v in LABEL_STATUS) return LABEL_STATUS[v as StatusBarang]
  return String(v)
}

/** Ringkasan singkat nilai lama ke nilai baru untuk satu catatan riwayat. */
function RingkasPerubahan({ r }: { r: Riwayat }) {
  const lama = r.old_value ?? {}
  const baru = r.new_value ?? {}
  if (r.action === 'pengrajin_ditugaskan' && r.old_value) {
    return <span className="text-ink-soft"> · dari {nilaiTeks(lama['kode'])} ke {nilaiTeks(baru['kode'])}</span>
  }
  if (r.action === 'status_diubah') {
    return <span className="text-ink-soft"> · {nilaiTeks(lama['status'])} → {nilaiTeks(baru['status'])}</span>
  }
  if (r.action === 'pengrajin_diubah') {
    const label: Record<string, string> = { code: 'ID', name: 'nama', phone: 'HP', address: 'alamat', notes: 'catatan' }
    const isi = Object.keys(baru)
      .filter((k) => k in label)
      .map((k) => `${label[k]}: ${nilaiTeks(lama[k])} → ${nilaiTeks(baru[k])}`)
      .join('; ')
    return isi ? <span className="text-ink-soft"> · {isi}</span> : null
  }
  return null
}
