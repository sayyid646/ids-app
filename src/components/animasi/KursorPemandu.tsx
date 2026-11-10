import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { WARNA_KURSOR, kurangiGerak, kursorPemanduAktif } from './pengaturanAnimasi'

// Kursor pemandu: hanya SEKALI setiap aplikasi dibuka, di tampilan depan (Beranda).
// Setelah animasi pembuka selesai, beberapa panah masuk dari tepi layar, menghampiri judul dan angka
// bertanda data-sorot (teks membesar sedikit dengan pantulan dan diberi kotak seleksi),
// lalu terbang keluar layar dan hilang sepenuhnya supaya tidak mengganggu.

const KUNCI_SESI = 'ids-kursor-sudah'
const TUGAS_PER_KURSOR = 2

function sudahTampil(): boolean {
  try {
    const pertama = sessionStorage.getItem('ids-halaman-pertama')
    return sessionStorage.getItem(KUNCI_SESI) === '1' || (pertama !== null && pertama !== '/beranda' && pertama !== '/')
  } catch { return true }
}
function tandaiTampil(): void {
  try { sessionStorage.setItem(KUNCI_SESI, '1') } catch { /* abaikan */ }
}

/** Menunggu animasi pembuka selesai (bila sedang tampil). */
function tungguPembuka(): Promise<void> {
  return new Promise((selesai) => {
    if (!document.querySelector('[data-pembuka]')) { selesai(); return }
    const sudah = () => { window.removeEventListener('ids-pembuka-selesai', sudah); selesai() }
    window.addEventListener('ids-pembuka-selesai', sudah)
  })
}

interface Sorotan { x: number; y: number; w: number; h: number }

function Panah({ warna }: { warna: string }) {
  return (
    <svg width="18" height="20" viewBox="0 0 16 18" aria-hidden>
      <path d="M0 0v15l4-4 3 6 2.5-1-3-6h5z" fill={warna} stroke="#0A1422" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function SatuKursor({ indeks, wadah, tandai, beres }: {
  indeks: number
  wadah: RefObject<HTMLElement>
  tandai: (k: number, s: Sorotan | null) => void
  beres: () => void
}) {
  const kontrol = useAnimationControls()
  const warna = WARNA_KURSOR[(indeks * 2) % WARNA_KURSOR.length]
  const dariKiri = indeks % 2 === 0

  useEffect(() => {
    let hidup = true
    let elAktif: HTMLElement | null = null
    const tunggu = (ms: number) => new Promise((r) => window.setTimeout(r, ms))
    const jalan = async () => {
      await tungguPembuka()
      await tunggu(400 + indeks * 650)
      for (let n = 0; n < TUGAS_PER_KURSOR && hidup; n++) {
        if (!wadah.current) break
        const calon = Array.from(wadah.current.querySelectorAll<HTMLElement>('[data-sorot]')).filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.top > 60 && r.bottom < window.innerHeight - 90 && !el.classList.contains('tersorot') && !el.dataset.dikunjungi
        })
        if (!calon.length) break
        const el = calon[(indeks + n * 3) % calon.length]
        el.dataset.dikunjungi = '1'
        const r = el.getBoundingClientRect()
        await kontrol.start({ x: r.right - 4, y: r.bottom - 6, opacity: 1, transition: { type: 'spring', stiffness: 70, damping: 17, mass: 0.9 } })
        if (!hidup) break
        elAktif = el
        el.classList.add('tersorot')
        tandai(indeks, { x: r.left - 4, y: r.top - 3, w: r.width + 8, h: r.height + 6 })
        await tunggu(1100)
        el.classList.remove('tersorot')
        elAktif = null
        tandai(indeks, null)
        await tunggu(250)
      }
      // Tugas selesai: terbang keluar layar lalu hilang.
      if (hidup) {
        await kontrol.start({
          x: dariKiri ? -60 : window.innerWidth + 60, y: window.innerHeight * (0.2 + Math.random() * 0.5), opacity: 0,
          transition: { type: 'spring', stiffness: 45, damping: 14, opacity: { duration: 0.6, delay: 0.3 } },
        })
      }
      if (hidup) beres()
    }
    void jalan()
    return () => {
      hidup = false
      elAktif?.classList.remove('tersorot')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-40 drop-shadow"
      initial={{ x: dariKiri ? -40 : window.innerWidth + 40, y: window.innerHeight * (0.25 + indeks * 0.15), opacity: 0 }}
      animate={kontrol}
    >
      <Panah warna={warna} />
    </motion.div>
  )
}

export function KursorPemandu({ wadah, jumlah = 3 }: { wadah: RefObject<HTMLElement>; jumlah?: number }) {
  // Hanya sekali per sesi (saat aplikasi dibuka), dan tidak bila pengguna memilih kurangi gerak.
  const [aktif, setAktif] = useState(() => !kurangiGerak() && kursorPemanduAktif() && !sudahTampil())
  const [sorotan, setSorotan] = useState<Record<number, Sorotan | null>>({})
  const sisa = useRef(jumlah)

  useEffect(() => {
    if (aktif) tandaiTampil()
  }, [aktif])

  // Bersihkan tanda bila pindah halaman di tengah animasi.
  useEffect(() => () => {
    wadah.current?.querySelectorAll<HTMLElement>('[data-sorot]').forEach((el) => {
      el.classList.remove('tersorot')
      delete el.dataset.dikunjungi
    })
  }, [wadah])

  if (!aktif) return null
  return (
    <>
      {Object.entries(sorotan).map(([k, s]) => s && (
        <motion.div
          key={k}
          className="pointer-events-none fixed z-30 rounded-[3px] border border-[#2B7BD6] bg-[#2B7BD6]/[0.08]"
          style={{ left: s.x, top: s.y, width: s.w, height: s.h }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18 }}
        >
          <span className="absolute -top-2.5 left-1 rounded-sm bg-[#2B7BD6] px-1 text-[8px] font-bold leading-[12px] tracking-wider text-white">IDS</span>
        </motion.div>
      ))}
      {Array.from({ length: jumlah }, (_, i) => (
        <SatuKursor
          key={i}
          indeks={i}
          wadah={wadah}
          tandai={(k, s) => setSorotan((m) => ({ ...m, [k]: s }))}
          beres={() => {
            sisa.current -= 1
            if (sisa.current <= 0) {
              wadah.current?.querySelectorAll<HTMLElement>('[data-sorot]').forEach((el) => delete el.dataset.dikunjungi)
              setAktif(false)
            }
          }}
        />
      ))}
    </>
  )
}
