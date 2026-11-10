import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { tandaiPembukaSelesai } from './pengaturanAnimasi'
import { TeksHuruf } from './TeksHuruf'

// Animasi pembuka IDS (sekitar 3 detik, sekali per sesi, ketuk untuk melewati):
// latar hitam dengan cahaya emas dan biru langit yang bergerak pelan, panel kaca di tengah,
// logo berlian tergambar, lalu huruf demi huruf muncul bergantian dengan pantulan kecil.

const DURASI = 3000

const CAHAYA = [
  { warna: 'bg-gold-400/40', kelas: 'left-[8%] top-[12%] h-[48vmin] w-[48vmin]', gerak: { x: [0, 40, -10, 0], y: [0, 20, 40, 0] } },
  { warna: 'bg-sky-400/35', kelas: 'right-[6%] top-[20%] h-[56vmin] w-[56vmin]', gerak: { x: [0, -50, 10, 0], y: [0, 30, -20, 0] } },
  { warna: 'bg-white/15', kelas: 'bottom-[6%] left-[30%] h-[44vmin] w-[44vmin]', gerak: { x: [0, 30, -30, 0], y: [0, -30, 10, 0] } },
]

export function Pembuka({ selesai }: { selesai: () => void }) {
  const [keluar, setKeluar] = useState(false)
  const selesaiRef = useRef(selesai)
  selesaiRef.current = selesai

  const akhiri = () => {
    tandaiPembukaSelesai()
    setKeluar(true)
  }

  useEffect(() => {
    const t = window.setTimeout(akhiri, DURASI)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-[#05070B]"
      initial={{ opacity: 1 }}
      animate={keluar ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }}
      transition={{ duration: keluar ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => { if (keluar) selesaiRef.current() }}
      onClick={akhiri}
      role="presentation"
      aria-hidden
    >
      {/* cahaya emas, biru langit, dan putih yang bergerak pelan di balik kaca */}
      {CAHAYA.map((c, i) => (
        <motion.div
          key={i}
          className={`pointer-events-none absolute rounded-full blur-3xl ${c.warna} ${c.kelas}`}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, ...c.gerak }}
          transition={{ opacity: { duration: 0.8, delay: i * 0.12 }, scale: { duration: 1.2 }, x: { duration: 6, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 7, repeat: Infinity, ease: 'easeInOut' } }}
        />
      ))}

      <div className="absolute inset-0 flex items-center justify-center p-6">
        <motion.div
          className="relative flex w-full max-w-md flex-col items-center overflow-hidden rounded-[2rem] border border-white/20 bg-white/[0.07] px-8 py-10 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.25)] backdrop-blur-2xl"
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 18, delay: 0.05 }}
        >
          {/* kilau kaca yang menyapu sekali */}
          <motion.div
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            initial={{ x: '0%' }}
            animate={{ x: '400%' }}
            transition={{ delay: 1.5, duration: 1.1, ease: 'easeInOut' }}
          />

          <motion.svg viewBox="0 0 48 48" className="h-16 w-16 sm:h-20 sm:w-20" initial={{ scale: 0.5, opacity: 0, y: -12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 12, delay: 0.2 }}>
            <motion.path d="M13 15h22l7 9-18 18L6 24z" fill="rgba(201,169,110,.12)" stroke="#D9BC85" strokeWidth="2.2" strokeLinejoin="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, delay: 0.25, ease: 'easeInOut' }} />
            <motion.path d="M6 24h36M19 15l-3.5 9L24 42l8.5-18L29 15M15.5 24 24 15l8.5 9" fill="none" stroke="#BFE3FA" strokeWidth="1.3" strokeLinejoin="round"
              initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.7, delay: 0.6, ease: 'easeInOut' }} />
          </motion.svg>

          <p className="mt-4 font-display text-6xl font-bold tracking-[0.22em] text-white drop-shadow-[0_4px_18px_rgba(135,206,250,.35)] sm:text-7xl">
            <TeksHuruf teks="IDS" jeda={0.55} langkah={0.16} tinggi={0.9} />
          </p>
          <motion.div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent" initial={{ width: 0 }} animate={{ width: 200 }}
            transition={{ delay: 1.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
          <p className="mt-3 text-xs font-semibold tracking-[0.35em] text-gold-200 sm:text-sm">
            <TeksHuruf teks="INTAN DUA SAUDARA" jeda={1.1} langkah={0.04} />
          </p>
          <p className="mt-2 text-[10px] font-semibold tracking-[0.3em] text-sky-200/80 sm:text-[11px]">
            <TeksHuruf teks="SMART JEWELRY MANAGEMENT" jeda={1.75} langkah={0.025} tinggi={0.4} />
          </p>
        </motion.div>
      </div>

      <motion.p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-xs text-white/50"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
        Ketuk untuk melewati
      </motion.p>
    </motion.div>
  )
}
