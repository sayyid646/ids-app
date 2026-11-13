// Suara aplikasi IDS:
//   * Musik latar di seluruh aplikasi (file public/audio/musik-ids.mp3), berulang terus.
//     Berhenti sementara saat aplikasi ditinggalkan (layar lain dibuka) dan lanjut saat kembali.
//   * Efek suara animasi pembuka, dibuat langsung oleh browser (tanpa file) supaya pas dengan gerakannya.
// Catatan penting: browser (terutama iPhone) baru mengizinkan suara setelah layar disentuh sekali.
// Karena itu semua suara lewat satu AudioContext yang "dibuka" pada sentuhan pertama.

const KUNCI_MUSIK = 'ids-musik'
const KUNCI_SFX = 'ids-sfx'
const KERAS_MUSIK = 0.55

function baca(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function tulis(k: string, v: string): void {
  try { localStorage.setItem(k, v) } catch { /* abaikan */ }
}

export const musikAktif = () => baca(KUNCI_MUSIK) !== 'mati'
export const sfxAktif = () => baca(KUNCI_SFX) !== 'mati'
export const aturSfx = (aktif: boolean) => tulis(KUNCI_SFX, aktif ? 'hidup' : 'mati')

let ctx: AudioContext | null = null
let elMusik: HTMLAudioElement | null = null
let gainMusik: GainNode | null = null
let musikDiminta = false
let musikSiap = false
let jedaBerhenti = 0

function konteks(): AudioContext | null {
  if (ctx) return ctx
  try {
    const Kelas = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Kelas) return null
    ctx = new Kelas()
  } catch {
    ctx = null
  }
  return ctx
}

export function suaraTerbuka(): boolean {
  return ctx?.state === 'running'
}

/** Mencoba menyalakan suara. Berhasil hanya bila browser sudah mengizinkan (biasanya setelah layar disentuh). */
export async function bukaSuara(): Promise<boolean> {
  const c = konteks()
  if (!c) return false
  if (c.state !== 'running') {
    try {
      await Promise.race([c.resume(), new Promise((r) => window.setTimeout(r, 250))])
    } catch { /* abaikan */ }
  }
  return c.state === 'running'
}

// ------------------------------------------------------------ musik latar
function siapkanMusik(): HTMLAudioElement | null {
  const c = konteks()
  if (!c) return null
  if (elMusik) return elMusik
  try {
    const el = new Audio(`${import.meta.env.BASE_URL}audio/musik-ids.mp3`)
    el.loop = true
    el.preload = 'auto'
    gainMusik = c.createGain()
    gainMusik.gain.value = 0
    c.createMediaElementSource(el).connect(gainMusik)
    gainMusik.connect(c.destination)
    elMusik = el
  } catch {
    elMusik = null
  }
  return elMusik
}

function naikkanMusik(): void {
  const c = ctx
  if (!c || !gainMusik || !elMusik) return
  window.clearTimeout(jedaBerhenti)
  void elMusik.play().then(() => { musikSiap = true }).catch(() => { /* menunggu sentuhan */ })
  const t = c.currentTime
  gainMusik.gain.cancelScheduledValues(t)
  gainMusik.gain.setValueAtTime(gainMusik.gain.value, t)
  gainMusik.gain.linearRampToValueAtTime(KERAS_MUSIK, t + 1.4)
}

/** Putar musik latar (dipanggil setelah animasi pembuka selesai; terus berjalan di semua halaman). */
export function mainMusik(): void {
  if (!musikAktif()) return
  const baruDiminta = !musikDiminta
  musikDiminta = true
  if (!suaraTerbuka()) return // akan dimulai otomatis pada sentuhan pertama
  const el = siapkanMusik()
  if (!el) return
  if (baruDiminta) {
    try { el.currentTime = 0 } catch { /* abaikan */ }
  }
  naikkanMusik()
}

/** Pelankan lalu hentikan musik (saat dimatikan atau keluar dari aplikasi). */
export function hentikanMusik(): void {
  musikDiminta = false
  const c = ctx
  if (!c || !gainMusik || !elMusik) return
  const t = c.currentTime
  gainMusik.gain.cancelScheduledValues(t)
  gainMusik.gain.setValueAtTime(gainMusik.gain.value, t)
  gainMusik.gain.linearRampToValueAtTime(0, t + 0.6)
  window.clearTimeout(jedaBerhenti)
  jedaBerhenti = window.setTimeout(() => { if (!musikDiminta) elMusik?.pause() }, 700)
}

export function aturMusik(aktif: boolean): void {
  tulis(KUNCI_MUSIK, aktif ? 'hidup' : 'mati')
  if (!aktif) hentikanMusik()
}

/** Dipasang sekali saat aplikasi dimulai: sentuhan pertama membuka izin suara dan memulai musik yang tertunda. */
export function pasangPembukaSuara(): void {
  const saatSentuh = () => {
    void bukaSuara().then((ok) => {
      if (!ok) return
      if (musikAktif() && !musikSiap) {
        // iPhone mewajibkan pemutaran pertama terjadi di dalam sentuhan; volumenya masih nol.
        const el = siapkanMusik()
        if (el) void el.play().then(() => { musikSiap = true; if (!musikDiminta) el.pause() }).catch(() => { /* abaikan */ })
      }
      if (musikDiminta) mainMusik()
    })
  }
  for (const n of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(n, saatSentuh, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!elMusik) return
    if (document.hidden) elMusik.pause()
    else if (musikDiminta && musikAktif() && suaraTerbuka()) void elMusik.play().catch(() => { /* abaikan */ })
  })
}

// ------------------------------------------------ efek suara animasi pembuka
function nada(c: BaseAudioContext, ke: AudioNode, frek: number, t: number, lama: number, keras: number, jenis: OscillatorType = 'sine', frekAkhir?: number): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = jenis
  o.frequency.setValueAtTime(frek, t)
  if (frekAkhir) o.frequency.exponentialRampToValueAtTime(frekAkhir, t + lama)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(keras, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + lama)
  o.connect(g).connect(ke)
  o.start(t)
  o.stop(t + lama + 0.05)
}

/** Denting seperti gelas kristal: nada dasar plus nada-nada atas yang cepat hilang. */
function denting(c: BaseAudioContext, ke: AudioNode, frek: number, t: number, keras: number, lama = 1.3): void {
  nada(c, ke, frek, t, lama, keras)
  nada(c, ke, frek * 2.01, t, lama * 0.55, keras * 0.35)
  nada(c, ke, frek * 3.02, t, lama * 0.3, keras * 0.16)
  nada(c, ke, frek * 4.2, t, 0.08, keras * 0.2, 'triangle')
}

/** Desir angin halus: derau yang disaring dan menyapu naik. */
function desir(c: BaseAudioContext, ke: AudioNode, t: number, lama: number, keras: number, dari: number, sampai: number): void {
  const panjang = Math.floor(c.sampleRate * (lama + 0.1))
  const bf = c.createBuffer(1, panjang, c.sampleRate)
  const d = bf.getChannelData(0)
  for (let i = 0; i < panjang; i++) d[i] = Math.random() * 2 - 1
  const s = c.createBufferSource()
  s.buffer = bf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.1
  f.frequency.setValueAtTime(dari, t)
  f.frequency.exponentialRampToValueAtTime(sampai, t + lama)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(keras, t + lama * 0.45)
  g.gain.exponentialRampToValueAtTime(0.0001, t + lama)
  s.connect(f).connect(g).connect(ke)
  s.start(t)
  s.stop(t + lama + 0.1)
}

/** Ketukan lembut bernada (dipakai untuk huruf yang muncul satu per satu). */
function ketuk(c: BaseAudioContext, ke: AudioNode, frek: number, t: number, keras: number): void {
  nada(c, ke, frek, t, 0.07, keras, 'triangle')
  nada(c, ke, frek * 2, t, 0.03, keras * 0.4)
}

/**
 * Efek suara yang mengikuti animasi pembuka (waktu dalam detik sama dengan Pembuka.tsx):
 *   0,05 panel kaca naik (desir)
 *   0,25-1,45 logo tergambar garis demi garis (goresan halus dan nada yang naik pelan)
 *   1,55 logo memantul (dentum lembut dan denting kristal), agak blur (desir pendek)
 *   1,90 cahaya menyapu logo (gemerincing berkilau)
 *   2,00 huruf CV. INTAN DUA SAUDARA (ketukan bernada) · 2,70 huruf baris bawah · 3,30 akor penutup
 */
export function susunSfxPembuka(c: BaseAudioContext, keluar: AudioNode, t0: number): GainNode[] {
  const utama = c.createGain()
  utama.gain.value = 0.9
  utama.connect(keluar)
  // gema pendek supaya terasa lapang seperti ruang kaca
  const gema = c.createDelay(0.5)
  gema.delayTime.value = 0.19
  const balik = c.createGain()
  balik.gain.value = 0.28
  const basah = c.createGain()
  basah.gain.value = 0.35
  utama.connect(gema)
  gema.connect(balik).connect(gema)
  gema.connect(basah).connect(keluar)

  // panel kaca
  desir(c, utama, t0 + 0.05, 0.7, 0.16, 280, 2200)

  // logo menggaris: tiga goresan (satu per bagian logo) dan nada yang naik pelan
  for (let i = 0; i < 3; i++) desir(c, utama, t0 + 0.25 + i * 0.12, 1.0, 0.05, 1400, 4200)
  nada(c, utama, 293.66, t0 + 0.25, 1.25, 0.045, 'sine', 587.33)
  nada(c, utama, 440, t0 + 0.55, 0.95, 0.025, 'sine', 880)

  // memantul: dentum lembut, denting kristal, lalu desir pendek saat blur
  nada(c, utama, 120, t0 + 1.55, 0.35, 0.22, 'sine', 62)
  for (const [f, k] of [[587.33, 0.17], [880, 0.12], [1174.66, 0.07]] as const) denting(c, utama, f, t0 + 1.56, k, 1.5)
  nada(c, utama, 140, t0 + 1.74, 0.18, 0.08, 'sine', 90) // pantulan kecil kedua
  desir(c, utama, t0 + 1.55, 0.45, 0.06, 600, 1800)

  // cahaya menyapu
  const TANGGA = [1174.66, 1318.51, 1479.98, 1760, 1975.53] // pentatonik D
  desir(c, utama, t0 + 1.9, 0.85, 0.08, 2200, 8000)
  for (let i = 0; i < 8; i++) denting(c, utama, TANGGA[i % 5] * (i > 4 ? 2 : 1.5), t0 + 1.95 + i * 0.085, 0.055, 0.45)

  // huruf CV. INTAN DUA SAUDARA (18 huruf, jarak sama dengan TeksHuruf)
  const jarak1 = Math.min(0.04, 0.7 / 18)
  for (let i = 0; i < 18; i++) ketuk(c, utama, TANGGA[i % 5] / (i < 10 ? 2 : 1), t0 + 2.0 + i * jarak1 + 0.05, 0.035)

  // huruf SMART JEWELRY MANAGEMENT (22 huruf)
  const jarak2 = Math.min(0.025, 0.7 / 22)
  for (let i = 0; i < 22; i++) nada(c, utama, 2093 + (i % 4) * 110, t0 + 2.7 + i * jarak2 + 0.04, 0.04, 0.016, 'triangle')

  // akor penutup
  for (const [f, k] of [[293.66, 0.1], [440, 0.07], [587.33, 0.07], [739.99, 0.05], [1174.66, 0.025]] as const) denting(c, utama, f, t0 + 3.3, k, 1.9)
  return [utama, basah]
}

/** Memainkan efek suara pembuka. Mengembalikan fungsi untuk menghentikannya (dipakai saat animasi dilewati). */
export function mainkanSfxPembuka(): () => void {
  const c = ctx
  if (!c || c.state !== 'running' || !sfxAktif()) return () => { /* tidak ada suara */ }
  const simpul = susunSfxPembuka(c, c.destination, c.currentTime + 0.03)
  const lepas = () => { for (const g of simpul) { try { g.disconnect() } catch { /* abaikan */ } } }
  const bersih = window.setTimeout(lepas, 7000)
  return () => {
    window.clearTimeout(bersih)
    const t = c.currentTime
    for (const g of simpul) {
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(g.gain.value, t)
      g.gain.linearRampToValueAtTime(0, t + 0.25)
    }
    window.setTimeout(lepas, 400)
  }
}
