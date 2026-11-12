import { db } from '../../lib/supabase'
import { akhirBulan } from '../../lib/format'

/** Satu baris laporan perak per pengrajin (fungsi database laporan_perak). */
export interface BarisPerak {
  craftsman_id: string
  code: string
  name: string | null
  is_active: boolean
  stok_awal: number
  beli_bulan: number
  pakai_bulan: number
  stok_akhir: number
  total_beli: number
  total_pakai: number
  stok_sekarang: number
}

export interface Pembelian { id: string; craftsman_id: string; craftsman_code: string; craftsman_name: string | null; tanggal: string; gram: number; notes: string | null }
export interface Pemakaian {
  item_id: string; craftsman_id: string; tanggal: string; order_id: string; order_number: string; item_no: number
  category_name: string; gender: 'LADY' | 'MAN'; status: string; gram: number
}

/** '2026-11' atau '2026-11-13' -> '2026-11-01'. */
export const awalBulanDari = (s: string) => `${s.slice(0, 7)}-01`

export async function muatLaporanPerak(bulan: string): Promise<BarisPerak[]> {
  const { data, error } = await db().rpc('laporan_perak', { p_bulan: awalBulanDari(bulan) })
  if (error) throw error
  return ((data ?? []) as BarisPerak[]).map((r) => ({
    ...r,
    stok_awal: Number(r.stok_awal), beli_bulan: Number(r.beli_bulan), pakai_bulan: Number(r.pakai_bulan),
    stok_akhir: Number(r.stok_akhir), total_beli: Number(r.total_beli), total_pakai: Number(r.total_pakai),
    stok_sekarang: Number(r.stok_sekarang),
  }))
}

/** Riwayat pembelian dan pemakaian satu bulan (semua pengrajin, atau satu pengrajin). */
export async function muatRiwayatPerak(bulan: string, pengrajin?: string): Promise<{ beli: Pembelian[]; pakai: Pemakaian[] }> {
  const dari = awalBulanDari(bulan)
  const sampai = akhirBulan(dari)
  let qb = db().from('v_pembelian_perak').select('*').gte('tanggal', dari).lte('tanggal', sampai).order('tanggal').order('created_at')
  let qp = db().from('v_pemakaian_perak').select('*').gte('tanggal', dari).lte('tanggal', sampai).order('tanggal').order('order_number').order('item_no')
  if (pengrajin) { qb = qb.eq('craftsman_id', pengrajin); qp = qp.eq('craftsman_id', pengrajin) }
  const [b, p] = await Promise.all([qb, qp])
  if (b.error) throw b.error
  if (p.error) throw p.error
  return {
    beli: ((b.data ?? []) as Pembelian[]).map((x) => ({ ...x, gram: Number(x.gram) })),
    pakai: ((p.data ?? []) as Pemakaian[]).map((x) => ({ ...x, gram: Number(x.gram) })),
  }
}

/** Pilihan cepat pembelian: 50 gram sampai 500 gram, kelipatan 50. */
export const PILIHAN_GRAM = Array.from({ length: 10 }, (_, i) => (i + 1) * 50)
