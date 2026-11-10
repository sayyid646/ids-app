import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { WARNA_KURSOR, kurangiGerak, kursorPemanduAktif } from './pengaturanAnimasi'

// Kursor pemandu: beberapa panah kecil yang sesekali menghampiri teks bertanda data-sorot.
// Saat panah menyentuh teks, teks membesar sedikit dengan pantulan halus dan diberi kotak seleksi,
// lalu kembali normal ketika panah pergi. Berhenti saat layar tidak terlihat atau pengguna memilih kurangi gerak.

interface Sorotan { x: number; y: number; w: number; h: number; warna: string; label: string }

function Panah({ warna }: { warna: string }) {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden>
      <path d="M0 0v15l4-4 3 6 2.5-1-3-6h5z" fill={warna} stroke="#0A1422" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function SatuKursor({ indeks, wadah, tandai }: { indeks: number; wadah: RefObject<HTMLElement>; tandai: (s: Sorotan | null, el: HTMLElement | null) => void }) {
  const kontrol = useAnimationControls()
  const warna = WARNA_KURSOR[(indeks * 2) % WARNA_KURSOR.length]

  useEffect(() => {
    let hidup = true
    const tunggu = (ms: number) => new Promise((r) => window.setTimeout(r, ms))
    const jalan = async () => {
      await tunggu(1200 + indeks * 1700)
      while (hidup) {
        if (document.visibilityState !== 'visible' || !wadah.current) { await tunggu(1500); continue }
        const calon = Array.from(wadah.current.querySelectorAll<HTMLElement>('[data-sorot]')).filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.top > 64 && r.bottom < window.innerHeight - 80 && !el.classList.contains('tersorot')
        })
        if (calon.length === 0) { await tunggu(2500); continue }
        const el = calon[Math.floor(Math.random() * calon.length)]
        const r = el.getBoundingClientRect()
        // Panah meluncur ke ujung kanan bawah teks.
        await kontrol.start({ x: r.right - 4, y: r.bottom - 6, opacity: 1, transition: { type: 'spring', stiffness: 60, damping: 16, mass: 0.9 } })
        if (!hidup) break
        el.classList.add('tersorot')
        tandai({ x: r.left - 4, y: r.top - 3, w: r.width + 8, h: r.height + 6, warna, label: 'IDS' }, el)
        await tunggu(1300)
        el.classList.remove('tersorot')
        tandai(null, el)
        // Pergi ke tempat acak, lalu istirahat.
        await kontrol.start({
          x: r.right + (Math.random() - 0.3) * 260, y: r.bottom + (Math.random() - 0.5) * 200, opacity: 0.85,
          transition: { type: 'spring', stiffness: 40, damping: 14 },
        })
        await tunggu(2600 + Math.random() * 2600)
      }
    }
    void jalan()
    return () => { hidup = false }
  }, [indeks, kontrol, wadah, tandai, warna])

  return (
    <motion.div className="pointer-events-none fixed left-0 top-0 z-40" initial={{ x: -40, y: window.innerHeight * 0.4, opacity: 0 }} animate={kontrol}>
      <Panah warna={warna} />
    </motion.div>
  )
}

export function KursorPemandu({ wadah, jumlah = 3 }: { wadah: RefObject<HTMLElement>; jumlah?: number }) {
  const [aktif] = useState(() => !kurangiGerak() && kursorPemanduAktif())
  const [sorotan, setSorotan] = useState<Map<number, Sorotan>>(new Map())
  const urutan = useRef(new WeakMap<HTMLElement, number>())
  const nomor = useRef(0)

  // Hapus tanda sorot bila komponen dilepas di tengah animasi.
  useEffect(() => () => {
    wadah.current?.querySelectorAll('.tersorot').forEach((el) => el.classList.remove('tersorot'))
  }, [wadah])

  const tandaiRef = useRef((s: Sorotan | null, el: HTMLElement | null) => {
    if (!el) return
    let id = urutan.current.get(el)
    if (id === undefined) { id = ++nomor.current; urutan.current.set(el, id) }
    const kunci = id
    setSorotan((m) => {
      const b = new Map(m)
      if (s) b.set(kunci, s)
      else b.delete(kunci)
      return b
    })
  })

  if (!aktif) return null
  return (
    <>
      {[...sorotan.entries()].map(([k, s]) => (
        <motion.div
          key={k}
          className="pointer-events-none fixed z-30 rounded-[3px] border"
          style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderColor: '#2B7BD6', background: 'rgba(43,123,214,.08)' }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18 }}
        >
          <span className="absolute -top-2.5 left-1 rounded-sm bg-[#2B7BD6] px-1 text-[8px] font-bold leading-[12px] tracking-wider text-white">{s.label}</span>
        </motion.div>
      ))}
      {Array.from({ length: jumlah }, (_, i) => (
        <SatuKursor key={i} indeks={i} wadah={wadah} tandai={tandaiRef.current} />
      ))}
    </>
  )
}
