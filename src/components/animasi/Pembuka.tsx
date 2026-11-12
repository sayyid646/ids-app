import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { tandaiPembukaSelesai } from './pengaturanAnimasi'
import { TeksHuruf } from './TeksHuruf'
import { bukaSuara, mainkanSfxPembuka, sfxAktif, suaraTerbuka } from '../../lib/suara'
import { JALUR_LOGO } from '../layout/jalurLogo'
import { TandaIDS } from '../layout/Logo'

// Animasi pembuka IDS (sekitar 4 detik, sekali per sesi, ketuk untuk melewati):
//   0,25-1,45  logo resmi IDS tergambar garis demi garis
//   1,45-2,00  isian emas muncul, logo memantul sedikit sambil agak blur lalu tajam kembali
//   1,90-2,70  cahaya menyapu logo
//   2,00 lalu  CV. INTAN DUA SAUDARA muncul huruf demi huruf dengan pantulan kecil
// Efek suara mengikuti gerakannya (lib/suara.ts, waktunya harus sama). Browser baru mengizinkan suara
// setelah layar disentuh, jadi bila suara belum diizinkan, pembuka menunggu satu ketukan ("Ketuk untuk membuka").

const DURASI = 4000

const CAHAYA = [
  { warna: 'bg-gold-400/40', kelas: 'left-[8%] top-[12%] h-[48vmin] w-[48vmin]', gerak: { x: [0, 40, -10, 0], y: [0, 20, 40, 0] } },
  { warna: 'bg-sky-400/35', kelas: 'right-[6%] top-[20%] h-[56vmin] w-[56vmin]', gerak: { x: [0, -50, 10, 0], y: [0, 30, -20, 0] } },
  { warna: 'bg-white/15', kelas: 'bottom-[6%] left-[30%] h-[44vmin] w-[44vmin]', gerak: { x: [0, 30, -30, 0], y: [0, -30, 10, 0] } },
]

export function Pembuka({ selesai }: { selesai: () => void }) {
  const [keluar, setKeluar] = useState(false)
  const selesaiRef = useRef(selesai)
  selesaiRef.current = selesai

  // Tanpa efek suara, animasi langsung jalan. Dengan efek suara, tunggu sampai suara diizinkan.
  const [mulai, setMulai] = useState(() => !sfxAktif() || suaraTerbuka())
  const hentikanSfx = useRef<() => void>(() => { /* belum ada */ })

  const akhiri = (dilewati: boolean) => {
    if (dilewati) hentikanSfx.current()
    tandaiPembukaSelesai()
    setKeluar(true)
  }
  const buka = () => { void bukaSuara().then(() => setMulai(true)) }

  // Mungkin suara sudah diizinkan tanpa ketukan (misalnya di komputer).
  useEffect(() => {
    if (mulai) return
    let hidup = true
    void bukaSuara().then((ok) => { if (ok && hidup) setMulai(true) })
    return () => { hidup = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!mulai) return
    hentikanSfx.current = mainkanSfxPembuka()
    const t = window.setTimeout(() => akhiri(false), DURASI)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mulai])

  return (
    <motion.div
      className="fixed inset-0 z-[100] cursor-pointer overflow-hidden bg-[#05070B]"
      initial={{ opacity: 1 }}
      animate={keluar ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }}
      transition={{ duration: keluar ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => { if (keluar) selesaiRef.current() }}
      onClick={mulai ? () => akhiri(true) : buka}
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
        {!mulai ? (
          <motion.div
            className="flex w-full max-w-md flex-col items-center rounded-[2rem] border border-white/20 bg-white/[0.07] px-8 py-12 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.25)] backdrop-blur-2xl"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
          >
            <motion.div animate={{ scale: [1, 1.06, 1], opacity: [0.75, 1, 0.75] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
              <TandaIDS className="h-20 w-24" />
            </motion.div>
            <motion.p className="mt-6 text-sm font-semibold tracking-[0.3em] text-gold-200" animate={{ opacity: [0.45, 1, 0.45] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
              KETUK UNTUK MEMBUKA
            </motion.p>
          </motion.div>
        ) : (
        <motion.div
          className="relative flex w-full max-w-md flex-col items-center overflow-hidden rounded-[2rem] border border-white/20 bg-white/[0.07] px-8 py-10 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.25)] backdrop-blur-2xl"
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 18, delay: 0.05 }}
        >
          <LogoMenggaris />
          <motion.div className="mt-5 h-px bg-gradient-to-r from-transparent via-gold-300 to-transparent" initial={{ width: 0 }} animate={{ width: 220 }}
            transition={{ delay: 1.9, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
          <p className="mt-4 text-sm font-bold tracking-[0.26em] text-gold-200 sm:text-base">
            <TeksHuruf teks="CV. INTAN DUA SAUDARA" jeda={2.0} langkah={0.04} tinggi={0.7} />
          </p>
          <p className="mt-2 text-[10px] font-semibold tracking-[0.3em] text-sky-200/80 sm:text-[11px]">
            <TeksHuruf teks="SMART JEWELRY MANAGEMENT" jeda={2.7} langkah={0.025} tinggi={0.4} />
          </p>
        </motion.div>
        )}
      </div>

      {mulai && (
        <motion.p className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-xs text-white/50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
          Ketuk untuk melewati
        </motion.p>
      )}
    </motion.div>
  )
}

/** Logo resmi IDS: tergambar garis demi garis, terisi emas, memantul sedikit sambil agak blur, lalu disapu cahaya. */
function LogoMenggaris() {
  return (
    <div className="relative">
      {/* cahaya lembut di belakang logo saat memantul */}
      <motion.div className="pointer-events-none absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-300/30 blur-2xl"
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 0, 1, 0.55], scale: [0.6, 0.6, 1.25, 1] }}
        transition={{ duration: 2.2, times: [0, 0.62, 0.75, 1] }} />
      <motion.div
        className="relative"
        initial={{ scale: 1, filter: 'blur(0px)', y: 0 }}
        animate={{
          scale: [1, 1, 1.13, 0.95, 1.03, 1],
          y: [0, 0, -10, 2, -2, 0],
          filter: ['blur(0px)', 'blur(0px)', 'blur(3.5px)', 'blur(2px)', 'blur(0.6px)', 'blur(0px)'],
        }}
        transition={{ duration: 2.0, times: [0, 0.72, 0.8, 0.88, 0.94, 1], ease: 'easeOut' }}
      >
        <svg viewBox={`-6 -6 328 272`} className="h-24 w-[7.25rem] sm:h-28 sm:w-[8.5rem]" aria-hidden>
          <defs>
            <linearGradient id="pembuka-emas" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F4E3BD" />
              <stop offset="0.5" stopColor="#D2B27A" />
              <stop offset="1" stopColor="#9C7731" />
            </linearGradient>
            <linearGradient id="pembuka-kilau" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id="pembuka-klip">
              {JALUR_LOGO.map((d, i) => <path key={i} d={d} />)}
            </clipPath>
          </defs>
          {/* 1. isian emas muncul setelah garis selesai */}
          {JALUR_LOGO.map((d, i) => (
            <motion.path key={`isi${i}`} d={d} fill="url(#pembuka-emas)" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.35 + i * 0.05, duration: 0.35 }} />
          ))}
          {/* 2. garis tepi yang menggambar bentuk logo */}
          {JALUR_LOGO.map((d, i) => (
            <motion.path key={`garis${i}`} d={d} fill="none" stroke="#F1DEB4" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: [1, 1, 0] }}
              transition={{ pathLength: { delay: 0.25 + i * 0.12, duration: 1.0, ease: 'easeInOut' }, opacity: { delay: 0.25, duration: 1.8, times: [0, 0.75, 1] } }} />
          ))}
          {/* 3. cahaya menyapu, hanya di dalam bentuk logo */}
          <g clipPath="url(#pembuka-klip)">
            <g transform="skewX(-22)">
              <motion.rect y={-20} width={70} height={320} fill="url(#pembuka-kilau)" initial={{ x: -160 }} animate={{ x: 470 }}
                transition={{ delay: 1.9, duration: 0.8, ease: 'easeInOut' }} />
            </g>
          </g>
        </svg>
      </motion.div>
    </div>
  )
}
