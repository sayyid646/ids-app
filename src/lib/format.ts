// Format tanggal dan angka Indonesia. Tidak bergantung pada data lokal browser,
// supaya hasilnya sama di semua HP dan komputer.

export const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const POLA_TANGGAL = /^(\d{4})-(\d{2})-(\d{2})/

/** Gaya tanggal dari pengaturan: 'dd MMMM yyyy' (03 September 2026) atau 'dd/MM/yyyy' (03/09/2026). */
let gayaTanggal = 'dd MMMM yyyy'
export function aturGayaTanggal(gaya: string | null | undefined): void {
  gayaTanggal = gaya === 'dd/MM/yyyy' ? 'dd/MM/yyyy' : 'dd MMMM yyyy'
}

/** '2026-09-03' -> '03 September 2026' (atau '03/09/2026'). Kosong -> '-'. */
export function formatTanggal(tanggal: string | null | undefined): string {
  if (!tanggal) return '-'
  const m = POLA_TANGGAL.exec(tanggal)
  if (!m) return '-'
  if (gayaTanggal === 'dd/MM/yyyy') return `${m[3]}/${m[2]}/${m[1]}`
  return `${m[3]} ${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}`
}

/** Tanggal lengkap dengan nama bulan, apa pun gaya tanggalnya (untuk nota). */
export function formatTanggalPanjang(tanggal: string | null | undefined): string {
  if (!tanggal) return '-'
  const m = POLA_TANGGAL.exec(tanggal)
  return m ? `${m[3]} ${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}` : '-'
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

/** Selisih zona waktu (ms) pada saat `ts` untuk zona tertentu. */
function selisihZona(ts: number, zona: string): number {
  const b = bagian(new Date(ts), zona)
  const lokal = Date.UTC(Number(b.year), Number(b.month) - 1, Number(b.day), Number(b.hour), Number(b.minute))
  return lokal - Math.floor(ts / 60_000) * 60_000
}

/** Isian 'YYYY-MM-DDTHH:mm' yang dibaca sebagai jam di zona waktu usaha -> waktu ISO (UTC). */
export function lokalKeIso(nilai: string, zona: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(nilai)
  if (!m) return null
  const tebak = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  let ts = tebak - selisihZona(tebak, zona)
  ts = tebak - selisihZona(ts, zona)
  return new Date(ts).toISOString()
}

/** Waktu ISO -> 'YYYY-MM-DDTHH:mm' di zona waktu usaha (untuk isian datetime-local). */
export function isoKeLokal(waktu: string | null | undefined, zona: string): string {
  if (!waktu) return ''
  const d = new Date(waktu)
  if (Number.isNaN(d.getTime())) return ''
  const b = bagian(d, zona)
  return `${b.year}-${b.month}-${b.day}T${b.hour}:${b.minute}`
}

export const ZONA_WAKTU: { nilai: string; label: string }[] = [
  { nilai: 'Asia/Jakarta', label: 'WIB (Jakarta, Sumatra, Jawa, Kalimantan Barat dan Tengah)' },
  { nilai: 'Asia/Makassar', label: 'WITA (Bali, NTB, NTT, Sulawesi, Kalimantan Selatan dan Timur)' },
  { nilai: 'Asia/Jayapura', label: 'WIT (Maluku, Papua)' },
]

export const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

/** '2026-11-02' -> 'Senin, 02 November 2026' (hari dihitung dari tanggalnya, tanpa zona waktu). */
export function formatTanggalHari(tanggal: string | null | undefined): string {
  if (!tanggal) return '-'
  const m = POLA_TANGGAL.exec(tanggal)
  if (!m) return '-'
  const hari = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()
  return `${NAMA_HARI[hari]}, ${m[3]} ${NAMA_BULAN[Number(m[2]) - 1]} ${m[1]}`
}

/** Hari terakhir bulan: '2026-02-10' -> '2026-02-28'. */
export function akhirBulan(tanggal: string): string {
  const m = POLA_TANGGAL.exec(tanggal)
  if (!m) return tanggal
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0))
  return `${m[1]}-${m[2]}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Angka gram: 182 -> '182 g', 7.5 -> '7,5 g', -4 -> '-4 g'. */
export function formatGram(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return `${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })} g`
}

/** Rupiah: 150000 -> 'Rp 150.000'. */
export function formatRupiah(n: number | null | undefined): string {
  return `Rp ${Math.round(Number(n ?? 0)).toLocaleString('id-ID')}`
}

/** Ketikan uang ke angka: 'Rp 150.000' / '150000' / '150.000,50' -> 150000 / 150000 / 150000.5. Kosong -> null. */
export function bacaRupiah(teks: string): number | null {
  const bersih = teks.replace(/[^\d,]/g, '').replace(',', '.')
  if (bersih === '' || bersih === '.') return null
  const n = Number(bersih)
  return Number.isFinite(n) ? n : null
}

/** Tampilan saat mengetik uang: '150000' -> '150.000'. */
export function ketikRupiah(teks: string): string {
  const angka = teks.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return angka ? Number(angka).toLocaleString('id-ID') : ''
}
