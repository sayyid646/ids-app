// Pilihan animasi disimpan per perangkat (bukan di database), karena ini soal kenyamanan tiap layar.

const KUNCI_PEMBUKA = 'ids-animasi-pembuka'
const KUNCI_KURSOR = 'ids-kursor-pemandu'
const KUNCI_SESI = 'ids-pembuka-sudah'

function baca(kunci: string): string | null {
  try {
    return localStorage.getItem(kunci)
  } catch {
    return null
  }
}
function tulis(kunci: string, nilai: string): void {
  try {
    localStorage.setItem(kunci, nilai)
  } catch {
    /* penyimpanan browser tidak tersedia: abaikan */
  }
}

export function kurangiGerak(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export const animasiPembukaAktif = () => baca(KUNCI_PEMBUKA) !== 'mati'
export const aturAnimasiPembuka = (aktif: boolean) => tulis(KUNCI_PEMBUKA, aktif ? 'hidup' : 'mati')
export const kursorPemanduAktif = () => baca(KUNCI_KURSOR) !== 'mati'
export const aturKursorPemandu = (aktif: boolean) => tulis(KUNCI_KURSOR, aktif ? 'hidup' : 'mati')

/** Animasi pembuka hanya sekali per sesi browser, tidak setiap pindah halaman. */
export function perluPembuka(): boolean {
  if (kurangiGerak() || !animasiPembukaAktif()) return false
  try {
    return sessionStorage.getItem(KUNCI_SESI) !== '1'
  } catch {
    return false
  }
}
export function tandaiPembukaSelesai(): void {
  try {
    sessionStorage.setItem(KUNCI_SESI, '1')
  } catch {
    /* abaikan */
  }
}

/** Warna kursor: emas, ice blue, putih, dan dua aksen lembut. */
export const WARNA_KURSOR = ['#C9A96E', '#B9D2E6', '#FFFFFF', '#8FD3C7', '#E9B7A6', '#D9BC85', '#8FB4D2']

/** Menggambar kursor panah kecil di kanvas, ujungnya di (x, y). */
export function gambarKursor(c: CanvasRenderingContext2D, x: number, y: number, sudut: number, ukuran: number, warna: string, alpha: number) {
  c.save()
  c.globalAlpha = alpha
  c.translate(x, y)
  c.rotate(sudut)
  c.scale(ukuran / 16, ukuran / 16)
  c.beginPath()
  c.moveTo(0, 0)
  c.lineTo(0, 15)
  c.lineTo(4, 11)
  c.lineTo(7, 17)
  c.lineTo(9.5, 16)
  c.lineTo(6.5, 10)
  c.lineTo(11.5, 10)
  c.closePath()
  c.fillStyle = warna
  c.fill()
  c.lineWidth = 1.2
  c.strokeStyle = 'rgba(10,20,34,.85)'
  c.stroke()
  c.restore()
}
