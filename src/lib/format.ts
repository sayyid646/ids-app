// Format tanggal dan angka Indonesia. Tidak bergantung pada data lokal browser,
// supaya hasilnya sama di semua HP dan komputer.

export const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})/

/** '2026-09-03' -> '03 September 2026'. Kosong -> '-'. */
export function formatTanggal(tanggal: string | null | undefined): string {
  if (!tanggal) return '-'
  const m = POLA_TANGGAL.exec(tanggal)
  if (!m) return '-'
  return `${m[3]} ${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}`
}

/** '2026-09-03' -> '03/09' */
export function formatTanggalPendek(tanggal: string | null | undefined): string {
  if (!tanggal) return '-'
  const m = POLA_TANGGAL.exec(tanggal)
  return m ? `${m[3]}/${m[2]}` : '-'
}

/** '2026-09-01' -> 'September 2026' */
export function formatBulan(tanggal: string | null | undefined): string {
  if (!tanggal) return '-'
  const m = POLA_TANGGAL.exec(tanggal)
  return m ? `${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}` : '-'
}

function bagian(waktu: Date, zona: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(waktu)
  const r: Record<string, string> = {}
  for (const p of parts) r[p.type] = p.value
  return r
}

/** Tanggal lokal (YYYY-MM-DD) dari waktu ISO pada zona waktu usaha. */
export function tglLokal(waktu: string | Date, zona: string): string {
  const b = bagian(typeof waktu === 'string' ? new Date(waktu) : waktu, zona)
  return `${b.year}-${b.month}-${b.day}`
}

/** '2026-03-31T15:30:00Z' (WITA) -> '31 Maret 2026, 23.30' */
export function formatTanggalWaktu(waktu: string | null | undefined, zona: string): string {
  if (!waktu) return '-'
  const d = new Date(waktu)
  if (Number.isNaN(d.getTime())) return '-'
  const b = bagian(d, zona)
  return `${formatTanggal(`${b.year}-${b.month}-${b.day}`)}, ${b.hour}.${b.minute}`
}

/** Tanggal hari ini (YYYY-MM-DD) di zona waktu usaha. */
export function hariIni(zona: string): string {
  return tglLokal(new Date(), zona)
}

const ANGKA = new Intl.NumberFormat('id-ID')
export function formatAngka(n: number | null | undefined): string {
  return ANGKA.format(Number(n ?? 0))
}
