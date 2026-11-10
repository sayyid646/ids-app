// Perhitungan laporan dari daftar barang. Definisinya sama dengan fungsi statistik di database:
//   * barang aktif = tidak dibatalkan dan order-nya tidak dibatalkan,
//   * "masuk" dihitung dari tanggal diberikan ke pengrajin,
//   * "selesai" dan "diserahkan" dihitung dari tanggalnya sendiri, dalam zona waktu usaha.
import type { StatusBarang } from './types'
import { tglLokal } from './format'
import { daftarBulan, daftarHari, type Rentang } from './periode'

export interface BarisBarang {
  id: string
  order_id: string
  order_number: string
  customer_name: string
  customer_whatsapp: string | null
  item_no: number
  craftsman_id: string
  craftsman_code: string
  craftsman_name: string | null
  category_name: string
  gender: string
  description: string | null
  assigned_date: string
  production_month: string
  status: StatusBarang
  completed_at: string | null
  delivered_at: string | null
  is_active: boolean
}

export interface BarisRingkas {
  kunci: string
  order_masuk: number
  barang_masuk: number
  barang_selesai: number
  barang_diserahkan: number
}

function hitung(rows: BarisBarang[], zona: string, kunciDari: (tgl: string) => string, kunciDaftar: string[]): BarisRingkas[] {
  const peta = new Map<string, { o: Set<string>; m: number; s: number; d: number }>()
  for (const k of kunciDaftar) peta.set(k, { o: new Set(), m: 0, s: 0, d: 0 })
  for (const r of rows) {
    if (!r.is_active) continue
    const a = peta.get(kunciDari(r.assigned_date))
    if (a) { a.o.add(r.order_id); a.m += 1 }
    if (r.completed_at) { const s = peta.get(kunciDari(tglLokal(r.completed_at, zona))); if (s) s.s += 1 }
    if (r.delivered_at) { const d = peta.get(kunciDari(tglLokal(r.delivered_at, zona))); if (d) d.d += 1 }
  }
  return kunciDaftar.map((k) => {
    const v = peta.get(k)!
    return { kunci: k, order_masuk: v.o.size, barang_masuk: v.m, barang_selesai: v.s, barang_diserahkan: v.d }
  })
}

export function ringkasHarian(rows: BarisBarang[], r: Rentang, zona: string): BarisRingkas[] {
  return hitung(rows, zona, (t) => t, daftarHari(r))
}
export function ringkasBulanan(rows: BarisBarang[], r: Rentang, zona: string): BarisRingkas[] {
  return hitung(rows, zona, (t) => t.slice(0, 7), daftarBulan(r))
}
export function ringkasTahunan(rows: BarisBarang[], r: Rentang, zona: string): BarisRingkas[] {
  const y1 = Number(r.dari.slice(0, 4))
  const y2 = Number(r.sampai.slice(0, 4))
  const tahun: string[] = []
  for (let y = y1; y <= y2 && tahun.length < 50; y++) tahun.push(String(y))
  return hitung(rows, zona, (t) => t.slice(0, 4), tahun)
}
/** Menjumlahkan baris ringkasan, mis. untuk baris total. */
export function jumlahkan(b: BarisRingkas[]): Omit<BarisRingkas, 'kunci'> {
  return b.reduce(
    (t, x) => ({ order_masuk: t.order_masuk + x.order_masuk, barang_masuk: t.barang_masuk + x.barang_masuk, barang_selesai: t.barang_selesai + x.barang_selesai, barang_diserahkan: t.barang_diserahkan + x.barang_diserahkan }),
    { order_masuk: 0, barang_masuk: 0, barang_selesai: 0, barang_diserahkan: 0 },
  )
}

export interface BarisProduktivitas {
  craftsman_id: string
  code: string
  name: string | null
  ditugaskan: number
  selesai: number
  diserahkan: number
  sedang_dikerjakan: number
  rata_hari: number | null
}

/** Produktivitas pengrajin dalam rentang. `sedang_dikerjakan` = keadaan sekarang, tanpa rentang. */
export function produktivitas(rows: BarisBarang[], pengrajin: { id: string; code: string; name: string | null }[], r: Rentang, zona: string): BarisProduktivitas[] {
  return pengrajin.map((p) => {
    let ditugaskan = 0, selesai = 0, diserahkan = 0, sedang = 0, totalHari = 0
    for (const b of rows) {
      if (!b.is_active || b.craftsman_id !== p.id) continue
      if (b.assigned_date >= r.dari && b.assigned_date <= r.sampai) ditugaskan += 1
      if (b.status === 'dalam_proses') sedang += 1
      if (b.completed_at) {
        const t = tglLokal(b.completed_at, zona)
        if (t >= r.dari && t <= r.sampai) {
          selesai += 1
          totalHari += Math.round((Date.parse(t) - Date.parse(b.assigned_date)) / 86_400_000)
        }
      }
      if (b.delivered_at) {
        const t = tglLokal(b.delivered_at, zona)
        if (t >= r.dari && t <= r.sampai) diserahkan += 1
      }
    }
    return { craftsman_id: p.id, code: p.code, name: p.name, ditugaskan, selesai, diserahkan, sedang_dikerjakan: sedang, rata_hari: selesai ? Math.round((totalHari / selesai) * 10) / 10 : null }
  })
}

/** Barang aktif yang diberikan dalam rentang, disaring per status. */
export function barangDalamRentang(rows: BarisBarang[], r: Rentang, status?: StatusBarang | 'belum_diserahkan'): BarisBarang[] {
  return rows.filter((b) => {
    if (!b.is_active || b.assigned_date < r.dari || b.assigned_date > r.sampai) return false
    if (!status) return true
    if (status === 'belum_diserahkan') return b.status !== 'diserahkan'
    return b.status === status
  })
}

/** Teks CSV yang langsung terbaca rapi di Excel Indonesia (pemisah titik koma, UTF-8 dengan BOM). */
export function buatCsv(kepala: string[], baris: (string | number | null | undefined)[][]): string {
  const sel = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return '﻿' + [kepala, ...baris].map((r) => r.map(sel).join(';')).join('\r\n') + '\r\n'
}
