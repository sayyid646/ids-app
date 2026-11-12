import { useEffect, useRef, useState } from 'react'
import { kurangiGerak, lampuSorotAktif } from './pengaturanAnimasi'

// Lampu sorot kuning hangat dengan vignette lembut yang mengikuti kursor.
// Hanya untuk komputer (ada kursor). Di HP tidak tampil karena tidak ada kursor yang diikuti.
export function LampuSorot() {
  const lapis = useRef<HTMLDivElement>(null)
  const [aktif, setAktif] = useState(false)

  useEffect(() => {
    const periksa = () => setAktif(lampuSorotAktif() && !kurangiGerak() && window.matchMedia('(hover: hover) and (pointer: fine)').matches)
    periksa()
    window.addEventListener('ids-lampu-sorot', periksa)
    return () => window.removeEventListener('ids-lampu-sorot', periksa)
  }, [])

  useEffect(() => {
    if (!aktif) return
    let raf = 0
    let x = 0, y = 0
    const gerak = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX; y = e.clientY
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        lapis.current?.style.setProperty('--x', `${x}px`)
        lapis.current?.style.setProperty('--y', `${y}px`)
        if (lapis.current) lapis.current.style.opacity = '1'
      })
    }
    const keluar = () => { if (lapis.current) lapis.current.style.opacity = '0' }
    window.addEventListener('pointermove', gerak, { passive: true })
    document.documentElement.addEventListener('mouseleave', keluar)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', gerak)
      document.documentElement.removeEventListener('mouseleave', keluar)
    }
  }, [aktif])

  if (!aktif) return null
  return <div ref={lapis} className="lampu-sorot" style={{ opacity: 0 }} aria-hidden />
}
