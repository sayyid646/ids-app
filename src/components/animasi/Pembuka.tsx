import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { WARNA_KURSOR, gambarKursor, tandaiPembukaSelesai } from './pengaturanAnimasi'

// Animasi pembuka IDS (sekitar 3,4 detik, sekali per sesi, ketuk untuk melewati):
//   1. Kerumunan kursor panah berputar di tengah, logo berlian tergambar, huruf I-D-S muncul satu per satu.
//   2. Kursor menyebar ke sudut-sudut dan "menggambar" kerangka halaman (kotak bergaris dengan label).
//   3. Teks pendukung muncul berurutan, kursor berkumpul membentuk pusaran di sekitar logo.
//   4. Lapisan memudar dan halaman asli tampil (kartu dashboard masuk dengan animasinya sendiri).

const DURASI = 3400

interface Kursor { x: number; y: number; sudut: number; ukuran: number; warna: string; fase: number; tx: number; ty: number; kec: number }

/** Kotak kerangka (persen layar): meniru tata letak aplikasi IDS. */
const KERANGKA = [
  { x: 3, y: 4, w: 18, h: 92, label: 'MENU', d: 0.0 },
  { x: 24, y: 4, w: 73, h: 8, label: 'PENCARIAN', d: 0.08 },
  { x: 24, y: 16, w: 17, h: 14, label: 'TOTAL ORDER', d: 0.16 },
  { x: 42.5, y: 16, w: 17, h: 14, label: 'DALAM PROSES', d: 0.22 },
  { x: 61, y: 16, w: 17, h: 14, label: 'SELESAI', d: 0.28 },
  { x: 79.5, y: 16, w: 17.5, h: 14, label: 'DISERAHKAN', d: 0.34 },
  { x: 24, y: 34, w: 48, h: 30, label: 'GRAFIK BULANAN', d: 0.42 },
  { x: 74, y: 34, w: 23, h: 30, label: 'STATUS', d: 0.5 },
  { x: 24, y: 68, w: 73, h: 28, label: 'ORDER TERBARU', d: 0.58 },
]

export function Pembuka({ selesai }: { selesai: () => void }) {
  const kanvas = useRef<HTMLCanvasElement>(null)
  const [keluar, setKeluar] = useState(false)
  const selesaiRef = useRef(selesai)
  selesaiRef.current = selesai

  const akhiri = () => {
    if (keluar) return
    tandaiPembukaSelesai()
    setKeluar(true)
  }

  // Kerumunan kursor di kanvas (ringan: satu kanvas, tanpa ratusan elemen).
  useEffect(() => {
    const cv = kanvas.current
    const c = cv?.getContext('2d')
    if (!cv || !c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    const ukur = () => {
      W = window.innerWidth; H = window.innerHeight
      cv.width = W * dpr; cv.height = H * dpr
      cv.style.width = `${W}px`; cv.style.height = `${H}px`
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    ukur()
    window.addEventListener('resize', ukur)

    const kecil = W < 640
    const jumlah = kecil ? 22 : 34
    const pojok = KERANGKA.flatMap((k) => [[k.x, k.y], [k.x + k.w, k.y], [k.x + k.w, k.y + k.h], [k.x, k.y + k.h]])
    const kursor: Kursor[] = Array.from({ length: jumlah }, (_, i) => {
      const [px, py] = pojok[i % pojok.length]
      return {
        x: W / 2 + (Math.random() - 0.5) * 60, y: H / 2 + (Math.random() - 0.5) * 60,
        sudut: -0.5 + Math.random() * 0.4, ukuran: 11 + Math.random() * 5,
        warna: WARNA_KURSOR[i % WARNA_KURSOR.length], fase: Math.random() * Math.PI * 2,
        tx: (px / 100) * W, ty: (py / 100) * H, kec: 0.06 + Math.random() * 0.05,
      }
    })

    const mulai = performance.now()
    let raf = 0
    const langkah = (now: number) => {
      const t = (now - mulai) / DURASI
      c.clearRect(0, 0, W, H)
      const cx = W / 2, cy = H / 2 - (kecil ? 10 : 20)
      for (const k of kursor) {
        let gx: number, gy: number
        if (t < 0.26) {
          // 1. berputar berkerumun di tengah
          const r = 30 + 20 * Math.sin(k.fase + t * 9)
          gx = cx + Math.cos(k.fase + t * 14) * r
          gy = cy + Math.sin(k.fase + t * 14) * r * 0.7
        } else if (t < 0.7) {
          // 2. menyebar ke sudut-sudut kerangka, sedikit bergetar seperti sedang menggambar
          gx = k.tx + Math.sin(now / 180 + k.fase) * 6
          gy = k.ty + Math.cos(now / 210 + k.fase) * 5
        } else {
          // 3. berkumpul menjadi pusaran di sekitar logo
          const p = Math.min(1, (t - 0.7) / 0.3)
          const r = (kecil ? 120 : 170) * (1 - p * 0.35)
          const s = k.fase + now / 260
          gx = cx + Math.cos(s) * r
          gy = cy + Math.sin(s) * r * 0.55
        }
        const dx = gx - k.x, dy = gy - k.y
        k.x += dx * k.kec * 1.4
        k.y += dy * k.kec * 1.4
        const arah = Math.atan2(dy, dx)
        if (Math.hypot(dx, dy) > 2) k.sudut += (arah - Math.PI / 2.6 - k.sudut) * 0.08
        const alpha = t > 0.85 ? Math.max(0, 1 - (t - 0.85) / 0.15) : Math.min(1, t * 8)
        gambarKursor(c, k.x, k.y, k.sudut * 0.35, k.ukuran, k.warna, alpha)
      }
      if (t < 1) raf = requestAnimationFrame(langkah)
    }
    raf = requestAnimationFrame(langkah)
    const habis = window.setTimeout(akhiri, DURASI)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(habis)
      window.removeEventListener('resize', ukur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-navy-950"
      initial={{ opacity: 1 }}
      animate={keluar ? { opacity: 0, scale: 1.03 } : { opacity: 1, scale: 1 }}
      transition={{ duration: keluar ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => keluar && selesaiRef.current()}
      onClick={akhiri}
      role="presentation"
      aria-hidden
    >
      {/* cahaya lembut */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-400/10 blur-3xl" />

      {/* kerangka halaman yang "digambar" kursor */}
      {KERANGKA.map((k) => (
        <motion.div
          key={k.label}
          className="absolute border border-ice-400/60 bg-ice-300/[0.04]"
          style={{ left: `${k.x}%`, top: `${k.y}%`, width: `${k.w}%`, height: `${k.h}%`, transformOrigin: 'top left' }}
          initial={{ opacity: 0, scaleX: 0.2, scaleY: 0.2 }}
          animate={{ opacity: [0, 1, 1, 0], scaleX: 1, scaleY: 1 }}
          transition={{ delay: 0.85 + k.d, duration: 2.1, times: [0, 0.18, 0.8, 1], ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="absolute -top-2 left-2 rounded-sm bg-[#2B7BD6] px-1.5 py-px text-[8px] font-bold tracking-wider text-white sm:text-[9px]">{k.label}</span>
          {[['-left-1 -top-1'], ['-right-1 -top-1'], ['-left-1 -bottom-1'], ['-right-1 -bottom-1']].map(([p]) => (
            <span key={p} className={`absolute h-1.5 w-1.5 border border-ice-300 bg-navy-950 ${p}`} />
          ))}
        </motion.div>
      ))}

      {/* logo */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.svg viewBox="0 0 48 48" className="h-20 w-20 sm:h-24 sm:w-24" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}>
          <motion.path d="M13 15h22l7 9-18 18L6 24z" fill="none" stroke="#C9A96E" strokeWidth="2.2" strokeLinejoin="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.15, ease: 'easeInOut' }} />
          <motion.path d="M6 24h36M19 15l-3.5 9L24 42l8.5-18L29 15M15.5 24 24 15l8.5 9" fill="none" stroke="#C9A96E" strokeWidth="1.4" strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.8, delay: 0.6, ease: 'easeInOut' }} />
        </motion.svg>
        <div className="mt-3 flex font-display text-6xl font-bold tracking-[0.2em] text-white sm:text-7xl">
          {['I', 'D', 'S'].map((h, i) => (
            <motion.span key={h} initial={{ y: 26, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.45 + i * 0.13 }}>
              {h}
            </motion.span>
          ))}
        </div>
        <motion.div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold-400 to-transparent" initial={{ width: 0 }} animate={{ width: 220 }}
          transition={{ delay: 1.0, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
        <motion.p className="mt-3 text-[11px] font-semibold tracking-[0.35em] text-gold-300 sm:text-xs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.25, duration: 0.5 }}>
          INTAN DUA SAUDARA
        </motion.p>
        <motion.p className="mt-1.5 text-[10px] font-semibold tracking-[0.3em] text-ice-400" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.55, duration: 0.5 }}>
          SMART JEWELRY MANAGEMENT
        </motion.p>
      </div>

      <canvas ref={kanvas} className="pointer-events-none absolute inset-0" />
      <motion.p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-xs text-ice-400/80"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
        Ketuk untuk melewati
      </motion.p>
    </motion.div>
  )
}
