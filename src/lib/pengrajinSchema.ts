import { z } from 'zod'
import { normalisasiWa, waValid } from './wa'

/** Sama dengan normalize_code di database: huruf besar dan spasi tunggal. */
export function normalisasiKode(kode: string): string {
  return kode.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Membandingkan dua ID pengrajin seperti database membandingkannya. */
export function kodeSama(a: string, b: string): boolean {
  return normalisasiKode(a) === normalisasiKode(b)
}

const teksOpsional = (maks: number, label: string) =>
  z
    .string()
    .max(maks, `${label} maksimal ${maks} karakter`)
    .optional()
    .transform((v) => {
      const t = (v ?? '').trim().replace(/[ \t]+/g, ' ')
      return t === '' ? null : t
    })

export const skemaPengrajin = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'ID pengrajin wajib diisi')
    .max(20, 'ID pengrajin maksimal 20 karakter')
    .transform(normalisasiKode),
  name: teksOpsional(80, 'Nama'),
  phone: z
    .string()
    .optional()
    .refine((v) => !v || v.trim() === '' || waValid(v), 'Nomor HP tidak valid. Contoh: 0812 3456 7890')
    .transform((v) => (v && v.trim() !== '' ? normalisasiWa(v) : null)),
  address: teksOpsional(200, 'Alamat'),
  notes: teksOpsional(500, 'Catatan'),
})

export type MasukanPengrajin = z.input<typeof skemaPengrajin>
export type DataPengrajin = z.output<typeof skemaPengrajin>
