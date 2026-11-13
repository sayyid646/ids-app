/** Satu model perhiasan jadi di katalog beserta stoknya. */
export interface Produk {
  id: string
  code: string
  name: string
  class: 'PREMIUM' | 'HIGH' | 'LUXURY' | 'SULTAN' | 'COUPLE' | 'SPESIAL' | 'LAINNYA'
  kind: 'Cincin' | 'Giwang' | 'Liontin' | 'Gelang' | 'Kalung' | 'Lainnya'
  gender: 'LADY' | 'MAN' | null
  photo_static: string | null
  photo_path: string | null
  stock: number
  notes: string | null
  sort_order: number
}

export interface GerakStok { id: string; delta: number; stock_after: number; reason: string | null; created_at: string }

export const KELAS: Produk['class'][] = ['PREMIUM', 'HIGH', 'LUXURY', 'SULTAN', 'COUPLE', 'SPESIAL', 'LAINNYA']
export const LABEL_KELAS: Record<Produk['class'], string> = {
  PREMIUM: 'Premium', HIGH: 'High', LUXURY: 'Luxury', SULTAN: 'Sultan', COUPLE: 'Couple', SPESIAL: 'Special Item', LAINNYA: 'Lainnya',
}
export const JENIS: Produk['kind'][] = ['Cincin', 'Giwang', 'Liontin', 'Gelang', 'Kalung', 'Lainnya']

/** Alamat foto: unggahan sendiri (tautan sementara) lebih diutamakan, lalu foto katalog bawaan. */
export function fotoProduk(p: Produk, unggahan: Record<string, string>): string | null {
  if (p.photo_path && unggahan[p.photo_path]) return unggahan[p.photo_path]
  if (p.photo_static) return `${import.meta.env.BASE_URL}${p.photo_static}`
  return null
}
