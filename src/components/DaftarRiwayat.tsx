import type { Riwayat, StatusBarang } from '../lib/types'
import { LABEL_AKSI, LABEL_STATUS } from '../lib/types'
import { formatTanggal, formatTanggalWaktu } from '../lib/format'
import { Kartu } from './ui/ui'

const LABEL_KOLOM: Record<string, string> = {
  code: 'ID', name: 'nama', phone: 'HP', address: 'alamat', notes: 'catatan',
  order_number: 'nomor order', customer_name: 'pelanggan', customer_whatsapp: 'WhatsApp',
  category_id: 'kategori', gender: 'gender', description: 'deskripsi', assigned_date: 'tanggal diberikan',
  production_month: 'bulan produksi', production_start_date: 'mulai produksi', photo_path: 'foto',
  is_active: 'aktif', sort_order: 'urutan',
}

function nilaiTeks(v: unknown, zona: string): string {
  if (v === null || v === undefined || v === '') return 'kosong'
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak'
  if (typeof v === 'string') {
    if (v in LABEL_STATUS) return LABEL_STATUS[v as StatusBarang]
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatTanggal(v)
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatTanggalWaktu(v, zona)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(v)) return 'diubah'
  }
  return String(v)
}

function Ringkas({ r, zona }: { r: Riwayat; zona: string }) {
  const lama = r.old_value ?? {}
  const baru = r.new_value ?? {}
  const t = (v: unknown) => nilaiTeks(v, zona)
  switch (r.action) {
    case 'pengrajin_ditugaskan':
      return r.old_value
        ? <> · dari {t(lama['kode'])} ke {t(baru['kode'])}</>
        : <> · ke {t(baru['kode'])}{baru['nama'] ? ` (${t(baru['nama'])})` : ''}</>
    case 'status_diubah':
      return <> · {t(lama['status'])} → {t(baru['status'])}</>
    case 'tanggal_selesai_diubah':
      return <> · {t(lama['tanggal_selesai'])} → {t(baru['tanggal_selesai'])}</>
    case 'tanggal_serah_diubah':
      return <> · {t(lama['tanggal_serah'])} → {t(baru['tanggal_serah'])}</>
    case 'barang_ditambahkan':
      return <> · barang ke-{t(baru['barang_ke'])}, {t(baru['kategori'])} {t(baru['gender'])}</>
    case 'barang_dibatalkan':
    case 'order_dibatalkan':
      return <> · alasan: {t(baru['alasan'])}</>
    default: {
      const isi = Object.keys(baru)
        .filter((k) => k in LABEL_KOLOM)
        .map((k) => `${LABEL_KOLOM[k]}: ${t(lama[k])} → ${t(baru[k])}`)
        .join('; ')
      return isi ? <> · {isi}</> : null
    }
  }
}

/** Daftar riwayat aktivitas: waktu, jenis aksi, ringkasan perubahan, dan admin yang mengubah. */
export function DaftarRiwayat({ data, zona, tampilOrder = true }: { data: Riwayat[]; zona: string; tampilOrder?: boolean }) {
  if (data.length === 0) return <p className="text-sm text-ink-muted">Belum ada aktivitas.</p>
  return (
    <Kartu>
      <ol className="divide-y divide-ice-100">
        {data.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="w-44 shrink-0 text-xs tabular-nums text-ink-muted">{formatTanggalWaktu(r.created_at, zona)}</span>
            <span className="min-w-0 flex-1 text-sm text-navy-900">
              <strong className="font-semibold">{LABEL_AKSI[r.action] ?? r.action}</strong>
              {tampilOrder && r.order_number && <span className="text-ink-soft"> · Order {r.order_number}</span>}
              <span className="text-ink-soft"><Ringkas r={r} zona={zona} /></span>
            </span>
            <span className="truncate text-xs text-ink-muted">{r.actor_email}</span>
          </li>
        ))}
      </ol>
    </Kartu>
  )
}
