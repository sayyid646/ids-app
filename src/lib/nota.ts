import type { Barang } from './types'

/** Mengelompokkan barang per pengrajin (untuk nota pengrajin: satu halaman per pengrajin). */
export function kelompokPengrajin(barang: Barang[]): { id: string; kode: string; nama: string | null; barang: Barang[] }[] {
  const peta = new Map<string, { id: string; kode: string; nama: string | null; barang: Barang[] }>()
  for (const b of barang) {
    const g = peta.get(b.craftsman_id) ?? { id: b.craftsman_id, kode: b.craftsman_code, nama: b.craftsman_name, barang: [] }
    g.barang.push(b)
    peta.set(b.craftsman_id, g)
  }
  return [...peta.values()].sort((a, b) => a.kode.localeCompare(b.kode))
}
