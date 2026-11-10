import { db } from '../../lib/supabase'
import type { PengrajinRingkas } from '../../lib/types'
import { Konfirmasi } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { formatAngka } from '../../lib/format'

/** Konfirmasi mengaktifkan atau menonaktifkan pengrajin. */
export function KonfirmasiStatusPengrajin({
  pengrajin,
  tutup,
  berubah,
}: {
  pengrajin: PengrajinRingkas | null
  tutup: () => void
  /** Dipanggil setelah tersimpan, untuk memuat ulang data (tidak menunggu Realtime). */
  berubah: () => void
}) {
  const { beri } = useNotifikasi()
  const p = pengrajin
  const nonaktifkan = p?.is_active ?? false
  const nama = p ? `${p.code}${p.name ? ` (${p.name})` : ''}` : ''

  return (
    <Konfirmasi
      terbuka={p !== null}
      tutup={tutup}
      judul={nonaktifkan ? 'Nonaktifkan pengrajin?' : 'Aktifkan pengrajin?'}
      labelYa={nonaktifkan ? 'Nonaktifkan' : 'Aktifkan'}
      bahaya={nonaktifkan}
      pesan={
        nonaktifkan ? (
          <>
            <p><strong className="text-navy-900">{nama}</strong> tidak akan bisa menerima barang baru.</p>
            {p && p.qty_dalam_proses > 0 && (
              <p className="rounded-xl bg-gold-50 px-3 py-2 text-gold-700">
                Masih ada {formatAngka(p.qty_dalam_proses)} barang dalam proses. Barang tersebut tetap tercatat dan statusnya tetap bisa diperbarui.
              </p>
            )}
            <p>Riwayat order tidak dihapus. Pengrajin bisa diaktifkan lagi kapan saja.</p>
          </>
        ) : (
          <p><strong className="text-navy-900">{nama}</strong> akan bisa menerima barang baru lagi.</p>
        )
      }
      jalankan={async () => {
        if (!p) return
        const { error } = await db().from('craftsmen').update({ is_active: !p.is_active }).eq('id', p.id)
        if (error) throw error
        beri(nonaktifkan ? `${p.code} dinonaktifkan.` : `${p.code} diaktifkan.`)
        berubah()
      }}
    />
  )
}
