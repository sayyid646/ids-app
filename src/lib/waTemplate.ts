import type { Pengaturan, StatusOrder } from './types'

export type JenisPesan = 'proses' | 'selesai' | 'diserahkan'

/** Template yang cocok untuk keadaan order saat ini. */
export function jenisPesanUntuk(status: StatusOrder): JenisPesan {
  if (status === 'diserahkan') return 'diserahkan'
  if (status === 'selesai') return 'selesai'
  return 'proses'
}

export const TEMPLATE_BAWAAN: Record<JenisPesan, string> = {
  proses: "Assalamu'alaikum.\n\nKami dari IDS - Intan Dua Saudara ingin menginformasikan bahwa pesanan permata Anda:\n\nNomor Order: {nomor_order}\nKategori: {kategori}\nStatus: Dalam Proses\n\nPesanan Anda sedang dikerjakan oleh pengrajin kami.\n\nTerima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.",
  selesai: "Assalamu'alaikum.\n\nKami dari IDS - Intan Dua Saudara ingin menginformasikan bahwa pesanan permata Anda:\n\nNomor Order: {nomor_order}\nKategori: {kategori}\nStatus: Selesai Dikerjakan\n\nPesanan Anda telah selesai dikerjakan pada {tanggal_selesai}.\n\nTerima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.",
  diserahkan: "Assalamu'alaikum.\n\nKami dari IDS - Intan Dua Saudara ingin menginformasikan bahwa pesanan permata Anda:\n\nNomor Order: {nomor_order}\nKategori: {kategori}\nStatus: Sudah Diserahkan\n\nPesanan Anda telah diserahkan pada {tanggal_serah}.\n\nTerima kasih telah mempercayakan pesanan Anda kepada IDS - Intan Dua Saudara.",
}

export function templateDari(p: Pengaturan | null, jenis: JenisPesan): string {
  if (!p) return TEMPLATE_BAWAAN[jenis]
  const t = jenis === 'proses' ? p.wa_template_proses : jenis === 'selesai' ? p.wa_template_selesai : p.wa_template_diserahkan
  return t?.trim() ? t : TEMPLATE_BAWAAN[jenis]
}

/** Mengganti {penanda} dengan isi. Penanda yang tidak dikenal dibiarkan apa adanya. */
export function isiTemplate(template: string, isi: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (asli, k: string) => (k in isi ? isi[k] : asli))
}

export const PENANDA = ['{nama}', '{nomor_order}', '{kategori}', '{jumlah}', '{tanggal_selesai}', '{tanggal_serah}', '{nama_usaha}']
