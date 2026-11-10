import { db } from '../lib/supabase'
import type { Kategori, Pengrajin } from '../lib/types'
import { useMuat } from './useMuat'
import { useVersiData } from './SyncProvider'

export interface DataMaster {
  pengrajin: Pengrajin[]
  kategori: Kategori[]
}

/** Daftar pengrajin dan kategori (termasuk yang nonaktif, untuk menampilkan data lama). */
export function useMaster() {
  const versi = useVersiData(['craftsmen', 'jewelry_categories'])
  return useMuat<DataMaster>(async () => {
    const [p, k] = await Promise.all([
      db().from('craftsmen').select('*').is('deleted_at', null).order('code'),
      db().from('jewelry_categories').select('*').order('sort_order'),
    ])
    if (p.error) throw p.error
    if (k.error) throw k.error
    return { pengrajin: (p.data ?? []) as Pengrajin[], kategori: (k.data ?? []) as Kategori[] }
  }, [versi])
}

export function labelPengrajin(p: Pick<Pengrajin, 'code' | 'name'>): string {
  return p.name ? `${p.code} · ${p.name}` : `${p.code} · (nama belum diisi)`
}
