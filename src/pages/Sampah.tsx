import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Gem, Package, RotateCcw, Trash2, UserRound } from 'lucide-react'
import { db } from '../lib/supabase'
import { formatTanggalWaktu } from '../lib/format'
import { useMuat } from '../sync/useMuat'
import { useSinkron, useVersiData } from '../sync/SyncProvider'
import { useNotifikasi } from '../components/ui/Notifikasi'
import { pesanGalat } from '../lib/errors'
import { Kartu, KepalaHalaman, KodePengrajin, Kosong, KotakGalat, Pemuat, Tombol } from '../components/ui/ui'

interface IsiSampah {
  jenis: 'order' | 'barang' | 'pengrajin'
  id: string
  order_id: string | null
  order_number: string | null
  item_no: number | null
  customer_name: string | null
  jumlah_barang: number
  category_name: string | null
  craftsman_code: string | null
  deleted_at: string
  hilang_pada: string
}

/** Sisa waktu sebelum data hilang permanen, dalam kata-kata. */
function sisaWaktu(hilang: string): string {
  const ms = new Date(hilang).getTime() - Date.now()
  if (ms <= 0) return 'segera hilang'
  const jam = Math.floor(ms / 3_600_000)
  if (jam < 24) return jam <= 1 ? 'kurang dari 1 jam lagi' : `${jam} jam lagi`
  return `${Math.ceil(jam / 24)} hari lagi`
}

export default function Sampah() {
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const versi = useVersiData(['orders', 'order_items', 'craftsmen'])
  const [proses, setProses] = useState<string | null>(null)

  const data = useMuat(async () => {
    const { data, error } = await db().from('v_sampah').select('*').order('deleted_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as IsiSampah[]
  }, [versi])

  const pulihkan = async (s: IsiSampah) => {
    setProses(s.id)
    try {
      const { error } = await db().rpc('pulihkan_sampah', { p_jenis: s.jenis, p_id: s.id })
      if (error) throw error
      beri(s.jenis === 'order' ? `Order ${s.order_number} dipulihkan.` : s.jenis === 'pengrajin' ? `Pengrajin ${s.craftsman_code} dipulihkan (masih nonaktif, aktifkan bila perlu).` : `Barang #${s.item_no} order ${s.order_number} dipulihkan.`)
      data.muatUlang()
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setProses(null)
    }
  }

  return (
    <>
      <KepalaHalaman
        judul="Sampah"
        sub="Order, barang, dan pengrajin yang dihapus disimpan di sini selama 7 hari. Setelah 7 hari hilang permanen dan tidak bisa dipulihkan."
      />
      {data.memuat && !data.data && <Pemuat />}
      {data.galat && !data.data && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
      {data.data && data.data.length === 0 && (
        <Kosong judul="Sampah kosong" isi="Belum ada order, barang, atau pengrajin yang dihapus dalam 7 hari terakhir." />
      )}
      {data.data && data.data.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {data.data.map((s) => (
              <motion.li key={s.jenis + s.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                <Kartu className="flex h-full items-start gap-4 p-4">
                  <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ice-100 text-navy-800" aria-hidden>
                    {s.jenis === 'order' ? <Gem className="h-5 w-5" /> : s.jenis === 'pengrajin' ? <UserRound className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-[0.15em] text-ink-muted">{s.jenis === 'order' ? 'ORDER' : s.jenis === 'pengrajin' ? 'PENGRAJIN' : `BARANG #${s.item_no}`}</p>
                    <p className="mt-0.5 font-semibold text-navy-900">
                      {s.jenis === 'order'
                        ? <>No. {s.order_number}{s.customer_name ? ` · ${s.customer_name}` : ''}</>
                        : s.jenis === 'pengrajin'
                        ? <>{s.craftsman_code} · {s.customer_name ?? 'Nama belum diisi'}</>
                        : <>{s.category_name} · <Link to={`/order/${s.order_id}`} className="underline-offset-2 hover:underline">order {s.order_number}</Link></>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                      {s.jenis === 'order' ? `${s.jumlah_barang} barang` : s.jenis === 'pengrajin' ? `${s.jumlah_barang} barang tercatat, tetap tersimpan` : <>{s.customer_name} {s.craftsman_code && <KodePengrajin kode={s.craftsman_code} />}</>}
                    </p>
                    <p className="mt-2 text-xs text-ink-muted">
                      Dihapus {formatTanggalWaktu(s.deleted_at, zona)} · <span className="font-semibold text-bad-700">hilang {sisaWaktu(s.hilang_pada)}</span>
                    </p>
                  </div>
                  <Tombol kecil ragam="kedua" ikon={<RotateCcw className="h-4 w-4" />} memuat={proses === s.id} disabled={proses !== null} onClick={() => void pulihkan(s)}>
                    Pulihkan
                  </Tombol>
                </Kartu>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <p className="mt-6 flex items-center gap-2 text-xs text-ink-muted"><Trash2 className="h-4 w-4" aria-hidden /> Catatan di Riwayat tetap tersimpan walau data di Sampah sudah hilang.</p>
    </>
  )
}
