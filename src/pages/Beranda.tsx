import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Boxes, CheckCircle2, Clock, Gem, HandHeart, PackageOpen, Plus, ShoppingBag, Users } from 'lucide-react'
import { db } from '../lib/supabase'
import { formatAngka, formatTanggal, formatTanggalPanjang, hariIni as tglHariIni } from '../lib/format'
import { daftarBulan, type Rentang } from '../lib/periode'
import type { OrderRingkas } from '../lib/types'
import { useMuat } from '../sync/useMuat'
import { useSinkron, useVersiData } from '../sync/SyncProvider'
import { Kartu, KotakGalat, Pemuat, cx } from '../components/ui/ui'
import { PilihPeriode, periodeAwal, type NilaiPeriode } from '../components/PilihPeriode'
import { GrafikBulanan, GrafikKategori, GrafikProduktivitas, GrafikStatus, type TitikBulan, type TitikKategori } from '../components/Grafik'
import { TeksHuruf } from '../components/animasi/TeksHuruf'
import { LencanaOrder } from './order/DaftarOrder'

interface Statistik {
  total_order: number; total_barang: number; dalam_proses: number; selesai_belum_diserahkan: number; sudah_diserahkan: number
  selesai_dikerjakan: number; belum_diserahkan: number; selesai_pada_periode: number; diserahkan_pada_periode: number
  pengrajin_aktif: number; order_bulan_ini: number
  saat_ini: { dalam_proses: number; siap_diserahkan: number; sudah_diserahkan: number; total_barang: number }
}
interface BarisProd { craftsman_id: string; code: string; name: string | null; is_active: boolean; ditugaskan: number; selesai_pada_periode: number }
interface BarisKat { category_name: string; gender: 'LADY' | 'MAN'; jumlah: number }

/** Rentang grafik bulanan: 6 bulan terakhir untuk periode pendek, setahun untuk "tahun ini", atau rentang pilihan. */
function rentangGrafik(p: NilaiPeriode): Rentang {
  if (p.jenis === 'tahun') return p.rentang
  if (p.jenis === 'kustom' && daftarBulan(p.rentang).length >= 2) return p.rentang
  const [y, m] = p.rentang.sampai.split('-').map(Number)
  const awal = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10)
  return { dari: awal, sampai: p.rentang.sampai }
}

const masuk = {
  tersembunyi: { opacity: 0, y: 14, scale: 0.98 },
  tampil: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: 0.05 + i * 0.05, type: 'spring' as const, stiffness: 260, damping: 22 } }),
}

export default function Beranda() {
  const { zona, pengaturan } = useSinkron()
  const hariIni = tglHariIni(zona)
  const [periode, setPeriode] = useState<NilaiPeriode>(() => periodeAwal('bulan', hariIni))
  const versi = useVersiData(['orders', 'order_items', 'craftsmen', 'jewelry_categories'])
  const { dari, sampai } = periode.rentang
  const grafik = rentangGrafik(periode)

  const data = useMuat(async () => {
    const [s, b, p, k, o] = await Promise.all([
      db().rpc('statistik_dashboard', { p_dari: dari, p_sampai: sampai }),
      db().rpc('statistik_bulanan', { p_dari: grafik.dari, p_sampai: grafik.sampai }),
      db().rpc('produktivitas_pengrajin', { p_dari: dari, p_sampai: sampai }),
      db().rpc('statistik_kategori', { p_dari: dari, p_sampai: sampai }),
      db().from('v_orders').select('*').order('created_at', { ascending: false }).limit(6),
    ])
    for (const r of [s, b, p, k, o]) if (r.error) throw r.error
    return {
      s: s.data as Statistik,
      bulanan: ((b.data ?? []) as (Omit<TitikBulan, 'bulan'> & { bulan: string })[]).map((x) => ({ ...x, bulan: x.bulan.slice(0, 7) })),
      prod: (p.data ?? []) as BarisProd[],
      kat: (k.data ?? []) as BarisKat[],
      terbaru: (o.data ?? []) as OrderRingkas[],
    }
  }, [versi, dari, sampai, grafik.dari, grafik.sampai])

  const kategori = useMemo<TitikKategori[]>(() => {
    const peta = new Map<string, TitikKategori>()
    for (const r of data.data?.kat ?? []) {
      const t = peta.get(r.category_name) ?? { kategori: r.category_name, LADY: 0, MAN: 0 }
      t[r.gender] += Number(r.jumlah)
      peta.set(r.category_name, t)
    }
    return [...peta.values()]
  }, [data.data])

  const s = data.data?.s
  const kartu = s
    ? [
        { label: 'Total order', nilai: s.total_order, Ikon: ShoppingBag, ke: '/order', nada: 'navy' },
        { label: 'Total barang', nilai: s.total_barang, Ikon: Boxes, ke: '/barang', nada: 'navy' },
        { label: 'Dalam proses', nilai: s.dalam_proses, Ikon: Clock, ke: '/barang?status=dalam_proses', nada: 'ice' },
        { label: 'Selesai dikerjakan', nilai: s.selesai_dikerjakan, Ikon: CheckCircle2, ke: '/barang?status=selesai', nada: 'emas' },
        { label: 'Sudah diserahkan', nilai: s.sudah_diserahkan, Ikon: HandHeart, ke: '/barang?status=diserahkan', nada: 'hijau' },
        { label: 'Belum diserahkan', nilai: s.belum_diserahkan, Ikon: PackageOpen, ke: '/barang?status=belum_diserahkan', nada: 'emas' },
        { label: 'Pengrajin aktif', nilai: s.pengrajin_aktif, Ikon: Users, ke: '/pengrajin', nada: 'navy' },
        { label: 'Order bulan ini', nilai: s.order_bulan_ini, Ikon: Gem, ke: '/order', nada: 'emas' },
      ]
    : []
  const NADA: Record<string, string> = { navy: 'bg-navy-900 text-gold-200', ice: 'bg-ice-100 text-navy-800', emas: 'bg-gold-100 text-gold-700', hijau: 'bg-ok-50 text-ok-700' }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <p className="text-xs font-semibold tracking-[0.25em] text-gold-600">{(pengaturan?.business_name ?? 'INTAN DUA SAUDARA').toUpperCase()}</p>
          <h1 className="mt-1 font-display text-4xl font-semibold text-navy-900 sm:text-5xl"><TeksHuruf teks="Ringkasan usaha" /></h1>
          <p className="mt-1 text-sm text-ink-soft">
            {formatTanggalPanjang(dari)}{dari !== sampai && <> sampai {formatTanggalPanjang(sampai)}</>}
          </p>
        </motion.div>
        <Link to="/order/baru" className="inline-flex h-11 items-center gap-2 self-start rounded-xl bg-navy-900 px-5 text-[15px] font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-navy-800 lg:self-auto">
          <Plus className="h-4 w-4" /> Order baru
        </Link>
      </div>

      <PilihPeriode nilai={periode} ubah={setPeriode} hariIni={hariIni} />

      {data.galat && <div className="mt-4"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>}
      {data.memuat && !data.data ? <Pemuat /> : s && data.data && (
        <>
          {/* Kartu angka */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kartu.map((k, i) => (
              <motion.div key={k.label} custom={i} variants={masuk} initial="tersembunyi" animate="tampil">
                <Link to={k.ke} className="group block h-full rounded-xl2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                  <Kartu className="h-full p-4 transition duration-300 group-hover:-translate-y-1 group-hover:border-gold-300 group-hover:shadow-pop sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-ink-muted sm:text-sm">{k.label}</p>
                      <span className={cx('rounded-lg p-1.5', NADA[k.nada])}><k.Ikon className="h-4 w-4" aria-hidden /></span>
                    </div>
                    <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-navy-900">{formatAngka(k.nilai)}</p>
                  </Kartu>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Keadaan sekarang */}
          <motion.div custom={8} variants={masuk} initial="tersembunyi" animate="tampil"
            className="mt-3 flex flex-col gap-2 rounded-xl2 bg-navy-900 px-5 py-4 text-sm text-ice-200 sm:flex-row sm:items-center sm:gap-6">
            <span className="font-semibold tracking-[0.15em] text-gold-300">SAAT INI</span>
            <Link to="/barang?status=dalam_proses" className="hover:text-white"><strong className="text-lg text-white">{formatAngka(s.saat_ini.dalam_proses)}</strong> barang sedang dikerjakan</Link>
            <Link to="/barang?status=selesai" className="hover:text-white"><strong className="text-lg text-gold-200">{formatAngka(s.saat_ini.siap_diserahkan)}</strong> selesai, menunggu diserahkan</Link>
            <span className="text-xs text-ice-400 sm:ml-auto">Pada periode ini: {formatAngka(s.selesai_pada_periode)} selesai, {formatAngka(s.diserahkan_pada_periode)} diserahkan</span>
          </motion.div>

          {/* Grafik */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <motion.div custom={9} variants={masuk} initial="tersembunyi" animate="tampil" className="lg:col-span-2">
              <Kartu className="h-full p-5">
                <h2 className="font-display text-2xl font-semibold text-navy-900">Statistik order bulanan</h2>
                <p className="mb-3 text-xs text-ink-muted">{formatTanggal(grafik.dari)} sampai {formatTanggal(grafik.sampai)}</p>
                <GrafikBulanan data={data.data.bulanan} />
              </Kartu>
            </motion.div>
            <motion.div custom={10} variants={masuk} initial="tersembunyi" animate="tampil">
              <Kartu className="h-full p-5">
                <h2 className="mb-2 font-display text-2xl font-semibold text-navy-900">Selesai vs proses</h2>
                <GrafikStatus dalamProses={s.dalam_proses} selesai={s.selesai_belum_diserahkan} diserahkan={s.sudah_diserahkan} />
              </Kartu>
            </motion.div>
            <motion.div custom={11} variants={masuk} initial="tersembunyi" animate="tampil" className="lg:col-span-2">
              <Kartu className="h-full p-5">
                <div className="mb-3 flex items-end justify-between gap-2">
                  <h2 className="font-display text-2xl font-semibold text-navy-900">Produktivitas pengrajin</h2>
                  <Link to="/laporan" className="text-sm font-semibold text-gold-600 hover:text-gold-700">Laporan lengkap</Link>
                </div>
                <GrafikProduktivitas data={data.data.prod.filter((p) => p.is_active || p.ditugaskan > 0 || p.selesai_pada_periode > 0)
                  .map((p) => ({ code: p.code, name: p.name, ditugaskan: Number(p.ditugaskan), selesai: Number(p.selesai_pada_periode) }))} />
              </Kartu>
            </motion.div>
            <motion.div custom={12} variants={masuk} initial="tersembunyi" animate="tampil">
              <Kartu className="h-full p-5">
                <h2 className="mb-2 font-display text-2xl font-semibold text-navy-900">Kategori</h2>
                {kategori.length ? <GrafikKategori data={kategori} /> : <p className="py-10 text-center text-sm text-ink-muted">Belum ada barang pada periode ini.</p>}
              </Kartu>
            </motion.div>
          </div>

          {/* Order terbaru */}
          <motion.div custom={13} variants={masuk} initial="tersembunyi" animate="tampil" className="mt-6">
            <Kartu>
              <div className="flex items-center justify-between border-b border-ice-200 px-5 py-4">
                <h2 className="font-display text-2xl font-semibold text-navy-900">Order terbaru</h2>
                <Link to="/order" className="inline-flex items-center gap-1 text-sm font-semibold text-gold-600 hover:text-gold-700">Semua order <ArrowRight className="h-4 w-4" /></Link>
              </div>
              {data.data.terbaru.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-ink-muted">Belum ada order. <Link to="/order/baru" className="font-semibold text-gold-600">Masukkan order pertama</Link></p>
              ) : (
                <ul className="divide-y divide-ice-100">
                  {data.data.terbaru.map((o) => (
                    <li key={o.id}>
                      <Link to={`/order/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ice-50">
                        <span className="w-20 shrink-0 font-semibold text-navy-900">{o.order_number}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{o.customer_name ? `${o.customer_name} · ` : ''}{o.quantity} barang · {o.category_names ?? '-'}</span>
                        <span className="hidden text-xs text-ink-muted sm:block">{formatTanggal(o.order_date)}</span>
                        <LencanaOrder status={o.order_status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Kartu>
          </motion.div>
        </>
      )}
    </div>
  )
}
