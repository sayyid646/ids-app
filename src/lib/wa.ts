// Nomor WhatsApp Indonesia. Aturannya sama persis dengan fungsi normalize_wa di database.

/** '0812-3456-7890' -> '6281234567890', '+62 812..' -> '62812..', '812..' -> '62812..'. Kosong -> null. */
export function normalisasiWa(nomor: string | null | undefined): string | null {
  if (nomor == null) return null
  let d = nomor.replace(/\D/g, '')
  if (d === '') return null
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return d
}

/** Valid bila setelah dirapikan berbentuk 62 diikuti 7 sampai 13 angka. */
export function waValid(nomor: string | null | undefined): boolean {
  const n = normalisasiWa(nomor)
  return n !== null && /^62[0-9]{7,13}$/.test(n)
}

/** '6281234567890' -> '0812-3456-7890' untuk ditampilkan. */
export function tampilkanWa(nomor: string | null | undefined): string {
  const n = normalisasiWa(nomor)
  if (!n) return '-'
  const lokal = n.startsWith('62') ? '0' + n.slice(2) : n
  return lokal.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3')
}

/** Tautan click-to-chat WhatsApp resmi. */
export function tautanWa(nomor: string, pesan: string): string {
  const n = normalisasiWa(nomor) ?? ''
  return `https://wa.me/${n}?text=${encodeURIComponent(pesan)}`
}
