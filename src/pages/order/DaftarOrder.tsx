import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import type { OrderRingkas, StatusOrder } from '../../lib/types'
import { LABEL_STATUS_ORDER, statusOrderTampil } from '../../lib/types'
import { formatAngka, formatTanggal } from '../../lib/format'
import { normalisasiWa } from '../../lib/wa'
import { useMuat } from '../../sync/useMuat'
import { useVersiData } from '../../sync/SyncProvider'
import { Konfirmasi } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Isian, Kartu, KepalaHalaman, Kosong, KotakGalat, Pemuat, Tombol, cx } from '../../components/ui/ui'

const PER_HALAMAN = 20
type Saring = 'semua' | Exclude<StatusOrder, 'kosong'>
const SARINGAN: Saring[] = ['semua', 'dalam_proses', 'diserahkan', 'dibatalkan']

const GAYA: Record<StatusOrder, string> = {
  dalam_proses: 'bg-ice-100 text-navy-800 ring-ice-300',
  sebagian: 'bg-gold-50 text-gold-700 ring-gold-200',
  selesai: 'bg-gold-100 text-gold-700 ring-gold-300',
  diserahkan: 'bg-ok-50 text-ok-700 ring-ok-600/20',
  dibatalkan: 'bg-bad-50 text-bad-700 ring-bad-600/20',
  kosong: 'bg-ice-100 text-ink-soft ring-ice-300',
}

export function LencanaOrder({ status }: { status: StatusOrder }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', GAYA[statusOrderTampil(status)])}>
      {LABEL_STATUS_ORDER[statusOrderTampil(status)]}
    </span>
  )
}

function bersihkan(q: string): string {
  return q.replace(/[,()%*\\:"']/g, ' ').trim()
}

export function DaftarOrder() {
  const navigasi = useNavigate()
  const versi = useVersiData(['orders', 'order_items', 'craftsmen', 'jewelry_categories'])
  const [cari, setCari] = useState('')
  const [cariAktif, setCariAktif] = useState('')
  const [saring, setSaring] = useState<Saring>('semua')
  const [halaman, setHalaman] = useState(0)
  const [hapusBatal, setHapusBatal] = useState(false)
  const { beri } = useNotifikasi()

  useEffect(() => {
    const t = window.setTimeout(() => {
      setCariAktif(bersihkan(cari))
      setHalaman(0)
    }, 300)
    return () => window.clearTimeout(t)
  }, [cari])

  const { data, galat, memuat, muatUlang } = useMuat(async () => {
    let q = db()
      .from('v_orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(halaman * PER_HALAMAN, halaman * PER_HALAMAN + PER_HALAMAN - 1)
    if (saring === 'dalam_proses') q = q.in('order_status', ['dalam_proses', 'sebagian', 'selesai'])
    else if (saring !== 'semua') q = q.eq('order_status', saring)
    if (cariAktif) {
      const s = `"%${cariAktif}%"`
      const wa = normalisasiWa(cariAktif)
      const syarat = [`order_number.ilike.${s}`, `customer_name.ilike.${s}`, `craftsman_codes.ilike.${s}`, `craftsman_names.ilike.${s}`, `category_names.ilike.${s}`]
      if (wa && /^\d{4,}$/.test(wa)) syarat.push(`customer_whatsapp.ilike."%${wa}%"`)
      q = q.or(syarat.join(','))
    }
    const { data, error, count } = await q
    if (error) throw error
    return { baris: (data ?? []) as OrderRingkas[], total: count ?? 0 }
  }, [versi, halaman, saring, cariAktif])

  const total = data?.total ?? 0
  const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN))

  return (
    <>
      <KepalaHalaman
        judul="Order"
        sub={data ? `${formatAngka(total)} order${saring !== 'semua' || cariAktif ? ' cocok' : ''}` : undefined}
        aksi={<Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => navigasi('/order/baru')}>Order baru</Tombol>}
      />

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Isian aria-label="Cari order" placeholder="Cari nomor order, pelanggan, WhatsApp, pengrajin, kategori" className="pl-10"
            value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Saring status">
          {SARINGAN.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={saring === s}
              onClick={() => { setSaring(s); setHalaman(0) }}
              className={cx(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold',
                saring === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft hover:border-navy-700',
              )}
            >
              {s === 'semua' ? 'Semua' : LABEL_STATUS_ORDER[s]}
            </button>
          ))}
        </div>
      </div>

      {saring === 'dibatalkan' && data && data.baris.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl2 border border-bad-600/15 bg-bad-50/60 px-4 py-3 text-sm text-bad-700">
          <span className="flex-1">Order yang dibatalkan bisa dihapus supaya daftar bersih. Yang terhapus masuk Sampah dan bisa dipulihkan selama 7 hari.</span>
          <Tombol kecil ragam="bahaya" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setHapusBatal(true)}>
            Hapus {data.baris.length} order dibatalkan
          </Tombol>
        </div>
      )}
      {galat && <div className="mb-4"><KotakGalat pesan={galat} ulangi={muatUlang} /></div>}
      {memuat && !data ? (
        <Pemuat />
      ) : data && data.baris.length === 0 ? (
        <Kosong
          judul={cariAktif || saring !== 'semua' ? 'Tidak ada yang cocok' : 'Belum ada order'}
          isi={cariAktif || saring !== 'semua' ? 'Coba kata pencarian atau saringan lain.' : 'Order yang Anda masukkan akan tampil di sini.'}
          aksi={!cariAktif && saring === 'semua' ? <Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => navigasi('/order/baru')}>Masukkan order pertama</Tombol> : undefined}
        />
      ) : data ? (
        <>
          <Kartu className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ice-200 bg-ice-50 text-xs font-semibold text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Order</th>
                  <th scope="col" className="px-4 py-3">Pengrajin</th>
                  <th scope="col" className="px-4 py-3">Kategori</th>
                  <th scope="col" className="px-4 py-3 text-right">Barang</th>
                  <th scope="col" className="px-4 py-3">Diterima</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ice-100">
                {data.baris.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-ice-50/70" onClick={() => navigasi(`/order/${o.id}`)}>
                    <td className="px-4 py-3">
                      <Link to={`/order/${o.id}`} className="font-semibold text-navy-900 hover:underline" onClick={(ev) => ev.stopPropagation()}>{o.order_number}</Link>
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-ink-soft" title={o.craftsman_names ?? ''}>{o.craftsman_codes ?? '-'}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-ink-soft">{o.category_names ?? '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{o.quantity}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTanggal(o.order_date)}</td>
                    <td className="px-4 py-3"><LencanaOrder status={o.order_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Kartu>

          <ul className="space-y-3 md:hidden">
            {data.baris.map((o) => (
              <li key={o.id}>
                <Link to={`/order/${o.id}`} className="block rounded-xl2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                  <Kartu className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-navy-900">Order {o.order_number}</p>
                        {o.customer_name && <p className="truncate text-sm text-ink-soft">{o.customer_name}</p>}
                      </div>
                      <LencanaOrder status={o.order_status} />
                    </div>
                    <p className="mt-2 text-xs text-ink-soft">
                      {o.quantity} barang · {o.category_names ?? '-'} · {o.craftsman_codes ?? '-'}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">Diterima {formatTanggal(o.order_date)}</p>
                  </Kartu>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-soft">
            <span>
              {formatAngka(halaman * PER_HALAMAN + 1)}–{formatAngka(Math.min(total, (halaman + 1) * PER_HALAMAN))} dari {formatAngka(total)}
            </span>
            <div className="flex gap-2">
              <Tombol kecil ragam="kedua" aria-label="Halaman sebelumnya" disabled={halaman === 0} onClick={() => setHalaman((h) => h - 1)}><ChevronLeft className="h-4 w-4" /></Tombol>
              <Tombol kecil ragam="kedua" aria-label="Halaman berikutnya" disabled={halaman + 1 >= jumlahHalaman} onClick={() => setHalaman((h) => h + 1)}><ChevronRight className="h-4 w-4" /></Tombol>
            </div>
          </div>
        </>
      ) : null}

      <Konfirmasi
        terbuka={hapusBatal}
        tutup={() => setHapusBatal(false)}
        judul="Hapus order yang dibatalkan?"
        pesan={<p>{data?.baris.length ?? 0} order dibatalkan yang tampil di halaman ini pindah ke <strong className="text-navy-900">Sampah</strong>. Selama 7 hari masih bisa dipulihkan dari menu Sampah.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          const daftar = (data?.baris ?? []).filter((o) => o.cancelled_at !== null)
          for (const o of daftar) {
            const { error } = await db().rpc('hapus_order', { p_order: o.id })
            if (error) throw error
          }
          beri(`${daftar.length} order dipindah ke Sampah.`)
          setHalaman(0)
          muatUlang()
        }}
      />
    </>
  )
}
