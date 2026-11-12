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

/** Konfirmasi menghapus pengrajin (misalnya sudah berhenti). Masuk Sampah 7 hari, bisa dipulihkan. */
export function KonfirmasiHapusPengrajin({
  pengrajin,
  tutup,
  berubah,
}: {
  pengrajin: PengrajinRingkas | null
  tutup: () => void
  berubah: () => void
}) {
  const { beri } = useNotifikasi()
  const p = pengrajin
  const nama = p ? `${p.code}${p.name ? ` (${p.name})` : ''}` : ''
  return (
    <Konfirmasi
      terbuka={p !== null}
      tutup={tutup}
      judul="Hapus pengrajin?"
      labelYa="Pindahkan ke Sampah"
      bahaya
      pesan={
        <>
          <p><strong className="text-navy-900">{nama}</strong> hilang dari daftar pengrajin dan tidak bisa menerima barang baru.</p>
          {p && p.qty_dalam_proses > 0 && (
            <p className="rounded-xl bg-gold-50 px-3 py-2 text-gold-700">
              Masih ada {formatAngka(p.qty_dalam_proses)} barang dalam proses. Barang dan semua order lamanya tetap tercatat dan tetap bisa diperbarui.
            </p>
          )}
          <p>Selama 7 hari bisa dipulihkan dari menu <strong className="text-navy-900">Sampah</strong>. ID {p?.code} bisa langsung dipakai untuk pengrajin baru.</p>
        </>
      }
      jalankan={async () => {
        if (!p) return
        const { error } = await db().rpc('hapus_pengrajin', { p_pengrajin: p.id })
        if (error) throw error
        beri(`${p.code} dipindah ke Sampah. Bisa dipulihkan selama 7 hari.`)
        berubah()
      }}
    />
  )
}
