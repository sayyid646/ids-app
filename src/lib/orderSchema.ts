import { z } from 'zod'
import { normalisasiWa, waValid } from './wa'

const POLA_TGL = /^\d{4}-\d{2}-\d{2}$/
const POLA_BULAN = /^\d{4}-\d{2}$/

const teksOpsional = (maks: number, label: string) =>
  z
    .string()
    .max(maks, `${label} maksimal ${maks} karakter`)
    .optional()
    .transform((v) => {
      const t = (v ?? '').trim()
      return t === '' ? null : t
    })

/** Membuat skema barang. `hariIni` = tanggal hari ini (YYYY-MM-DD) di zona waktu usaha. */
export function skemaBarang(hariIni: string) {
  return z
    .object({
      craftsman_id: z.string().min(1, 'Pilih pengrajin'),
      category_id: z.string().min(1, 'Pilih kategori'),
      gender: z.enum(['LADY', 'MAN'], { errorMap: () => ({ message: 'Pilih LADY atau MAN' }) }),
      quantity: z.coerce.number({ invalid_type_error: 'Isi jumlah' }).int('Jumlah harus bilangan bulat').min(1, 'Minimal 1').max(100, 'Maksimal 100'),
      assigned_date: z
        .string()
        .regex(POLA_TGL, 'Isi tanggal diberikan ke pengrajin')
        .refine((v) => v <= hariIni, 'Tanggal tidak boleh di masa depan'),
      /** Kosong = otomatis dari tanggal diberikan. Isi 'YYYY-MM' bila dikoreksi manual. */
      production_month: z
        .string()
        .optional()
        .refine((v) => !v || POLA_BULAN.test(v), 'Format bulan tidak valid'),
      production_start_date: z
        .string()
        .optional()
        .refine((v) => !v || POLA_TGL.test(v), 'Format tanggal tidak valid'),
      description: teksOpsional(500, 'Deskripsi'),
      notes: teksOpsional(500, 'Catatan'),
    })
    .refine((b) => !b.production_start_date || b.production_start_date >= b.assigned_date, {
      message: 'Tidak boleh sebelum tanggal diberikan ke pengrajin',
      path: ['production_start_date'],
    })
}

export function skemaOrder(hariIni: string) {
  return z.object({
    order_number: z.string().trim().min(1, 'Nomor order wajib diisi').max(30, 'Maksimal 30 karakter'),
    customer_name: z.string().trim().min(1, 'Nama pelanggan wajib diisi').max(100, 'Maksimal 100 karakter'),
    customer_whatsapp: z
      .string()
      .optional()
      .refine((v) => !v || v.trim() === '' || waValid(v), 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890')
      .transform((v) => (v && v.trim() !== '' ? normalisasiWa(v) : null)),
    notes: teksOpsional(1000, 'Catatan'),
    items: z.array(skemaBarang(hariIni)).min(1, 'Order harus berisi minimal satu barang'),
  })
}

export type MasukanBarang = z.input<ReturnType<typeof skemaBarang>>
export type DataBarang = z.output<ReturnType<typeof skemaBarang>>
export type MasukanOrder = z.input<ReturnType<typeof skemaOrder>>
export type DataOrder = z.output<ReturnType<typeof skemaOrder>>

/** Bentuk data barang untuk fungsi database (buat_order / tambah_barang). */
export function muatanBarang(b: DataBarang): Record<string, unknown> {
  return {
    quantity: b.quantity,
    craftsman_id: b.craftsman_id,
    category_id: b.category_id,
    gender: b.gender,
    assigned_date: b.assigned_date,
    production_month: b.production_month ? `${b.production_month}-01` : null,
    production_start_date: b.production_start_date || null,
    description: b.description,
    notes: b.notes,
  }
}

export function muatanOrder(d: DataOrder): Record<string, unknown> {
  return {
    order_number: d.order_number,
    customer_name: d.customer_name.replace(/\s+/g, ' '),
    customer_whatsapp: d.customer_whatsapp,
    notes: d.notes,
    items: d.items.map(muatanBarang),
  }
}

export function totalBarang(items: { quantity?: unknown }[]): number {
  return items.reduce((n, b) => n + (Number(b.quantity) > 0 ? Math.floor(Number(b.quantity)) : 0), 0)
}

export function barangKosong(hariIni: string): MasukanBarang {
  return { craftsman_id: '', category_id: '', gender: undefined as unknown as 'LADY', quantity: 1, assigned_date: hariIni, production_month: '', production_start_date: '', description: '', notes: '' }
}
