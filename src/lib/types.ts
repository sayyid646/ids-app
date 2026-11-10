// Bentuk data sesuai tabel dan view di database (supabase/migrations).

export type StatusBarang = 'dalam_proses' | 'selesai' | 'diserahkan'
export type Gender = 'LADY' | 'MAN'

export interface Pengrajin {
  id: string
  code: string
  name: string | null
  phone: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Baris view v_craftsmen: pengrajin + jumlah barang aktif per status. */
export interface PengrajinRingkas extends Pengrajin {
  total_items: number
  qty_dalam_proses: number
  qty_selesai: number
  qty_diserahkan: number
  qty_selesai_dikerjakan: number
  last_assigned_date: string | null
}

/** Baris view v_items. */
export interface Barang {
  id: string
  order_id: string
  order_number: string
  customer_name: string
  customer_whatsapp: string | null
  item_no: number
  craftsman_id: string
  craftsman_code: string
  craftsman_name: string | null
  category_id: string
  category_name: string
  gender: Gender
  description: string | null
  assigned_date: string
  production_month: string
  production_year: number
  production_month_no: number
  production_month_manual: boolean
  production_start_date: string | null
  status: StatusBarang
  status_label: string
  completed_at: string | null
  delivered_at: string | null
  notes: string | null
  photo_path: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  order_cancelled_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Riwayat {
  id: string
  created_at: string
  actor_email: string | null
  action: string
  entity_type: string
  order_number: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  note: string | null
}

export interface Pengaturan {
  id: number
  app_name: string
  business_name: string
  tagline: string
  business_address: string | null
  business_whatsapp: string | null
  logo_path: string | null
  timezone: string
  date_format: string
  receipt_paper: 'A4' | '80mm' | '58mm'
  receipt_show_signature: boolean
  receipt_footer: string
  wa_template_proses: string
  wa_template_selesai: string
  wa_template_diserahkan: string
  appearance: 'terang' | 'gelap' | 'otomatis'
  updated_at: string
}

export const LABEL_STATUS: Record<StatusBarang, string> = {
  dalam_proses: 'Dalam Proses',
  selesai: 'Selesai Dikerjakan',
  diserahkan: 'Sudah Diserahkan',
}

export const LABEL_AKSI: Record<string, string> = {
  order_dibuat: 'Order dibuat',
  order_diubah: 'Order diubah',
  order_dibatalkan: 'Order dibatalkan',
  order_dipulihkan: 'Order dipulihkan',
  order_diarsipkan: 'Order diarsipkan',
  barang_ditambahkan: 'Barang ditambahkan',
  barang_diubah: 'Barang diubah',
  barang_dibatalkan: 'Barang dibatalkan',
  pengrajin_ditugaskan: 'Pengrajin ditugaskan',
  status_diubah: 'Status diubah',
  tanggal_selesai_diubah: 'Tanggal selesai dikoreksi',
  tanggal_serah_diubah: 'Tanggal serah dikoreksi',
  pengrajin_ditambahkan: 'Pengrajin ditambahkan',
  pengrajin_diubah: 'Data pengrajin diubah',
  pengrajin_diaktifkan: 'Pengrajin diaktifkan',
  pengrajin_dinonaktifkan: 'Pengrajin dinonaktifkan',
  pengrajin_diarsipkan: 'Pengrajin diarsipkan',
  kategori_ditambahkan: 'Kategori ditambahkan',
  kategori_diubah: 'Kategori diubah',
  pengaturan_diubah: 'Pengaturan diubah',
}

export interface Kategori {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

export type StatusOrder = 'dalam_proses' | 'sebagian' | 'selesai' | 'diserahkan' | 'dibatalkan' | 'kosong'

/** Baris view v_orders: order + jumlah barang per status. */
export interface OrderRingkas {
  id: string
  order_number: string
  customer_name: string
  customer_whatsapp: string | null
  notes: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  created_at: string
  updated_at: string
  quantity: number
  qty_dalam_proses: number
  qty_selesai: number
  qty_diserahkan: number
  order_date: string | null
  last_completed_at: string | null
  last_delivered_at: string | null
  order_status: StatusOrder
  craftsman_codes: string | null
  craftsman_names: string | null
  category_names: string | null
}

export const LABEL_STATUS_ORDER: Record<StatusOrder, string> = {
  dalam_proses: 'Dalam Proses',
  sebagian: 'Sebagian Selesai',
  selesai: 'Selesai Dikerjakan',
  diserahkan: 'Sudah Diserahkan',
  dibatalkan: 'Dibatalkan',
  kosong: 'Tanpa Barang',
}
