// Pilihan animasi disimpan per perangkat (bukan di database), karena ini soal kenyamanan tiap layar.

const KUNCI_PEMBUKA = 'ids-animasi-pembuka'
const KUNCI_TEMA = 'ids-tema'
const KUNCI_TAMPILAN_PENGRAJIN = 'ids-tampilan-pengrajin'
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

/**
 * Tema tampilan per perangkat: kaca (emas, biru langit, putih, hitam), klasik,
 * emas (mengikuti logo: emas di atas hitam), atau emas terbalik (logo putih di atas emas).
 */
export type Tema = 'glass' | 'klasik' | 'emas' | 'emas-terbalik'
const SEMUA_TEMA: Tema[] = ['glass', 'klasik', 'emas', 'emas-terbalik']
export function temaAktif(): Tema {
  const t = baca(KUNCI_TEMA) as Tema | null
  return t && SEMUA_TEMA.includes(t) ? t : 'glass'
}
export function terapkanTema(t: Tema = temaAktif()): void {
  document.documentElement.dataset.tema = t
}
export function aturTema(t: Tema): void {
  tulis(KUNCI_TEMA, t)
  terapkanTema(t)
}

/** Tampilan daftar pengrajin: kartu besar atau ringkas (semua 9 terlihat). */
export type TampilanPengrajin = 'kartu' | 'ringkas'
export const tampilanPengrajin = (): TampilanPengrajin => (baca(KUNCI_TAMPILAN_PENGRAJIN) === 'ringkas' ? 'ringkas' : 'kartu')
export const aturTampilanPengrajin = (t: TampilanPengrajin) => tulis(KUNCI_TAMPILAN_PENGRAJIN, t)

/** Lampu sorot kuning hangat yang mengikuti kursor (hanya di perangkat bertetikus). */
const KUNCI_LAMPU = 'ids-lampu-sorot'
export const lampuSorotAktif = () => baca(KUNCI_LAMPU) !== 'mati'
export const aturLampuSorot = (aktif: boolean) => {
  tulis(KUNCI_LAMPU, aktif ? 'hidup' : 'mati')
  window.dispatchEvent(new Event('ids-lampu-sorot'))
}
