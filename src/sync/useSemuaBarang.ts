import { db } from '../lib/supabase'
import type { BarisBarang } from '../lib/laporan'
import { useMuat } from './useMuat'
import { useVersiData } from './SyncProvider'

const KOLOM =
  'id, order_id, order_number, weight_grams, customer_name, customer_whatsapp, item_no, craftsman_id, craftsman_code, craftsman_name, ' +
  'category_name, gender, description, assigned_date, production_month, status, completed_at, delivered_at, is_active'

/** Semua barang aktif (dibaca bertahap 1.000 baris), untuk laporan yang dihitung di perangkat. */
export async function ambilSemuaBarang(): Promise<BarisBarang[]> {
  const hasil: BarisBarang[] = []
  for (let dari = 0; dari < 50_000; dari += 1000) {
    const { data, error } = await db().from('v_items').select(KOLOM).eq('is_active', true).order('id').range(dari, dari + 999)
    if (error) throw error
    const baris = (data ?? []) as unknown as BarisBarang[]
    hasil.push(...baris)
    if (baris.length < 1000) break
  }
  return hasil
}

export function useSemuaBarang() {
  const versi = useVersiData(['orders', 'order_items', 'craftsmen', 'jewelry_categories'])
  return useMuat(ambilSemuaBarang, [versi])
}
