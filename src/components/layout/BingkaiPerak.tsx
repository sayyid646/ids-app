import type { ReactNode } from 'react'

// Bingkai logo dengan kilau perak yang berputar (conic-gradient) dan kilau mikro di tepinya.
const KILAU = [
  { left: '8%', top: '-2px', delay: '0s' },
  { right: '14%', top: '-2px', delay: '0.9s' },
  { right: '-2px', top: '45%', delay: '1.7s' },
  { left: '30%', bottom: '-2px', delay: '0.5s' },
  { left: '-2px', top: '30%', delay: '2.1s' },
]

export function BingkaiPerak({ children, latar, kecil }: { children: ReactNode; latar: string; kecil?: boolean }) {
  return (
    <div className="bingkai-perak" style={{ ['--latar-bingkai' as string]: latar, borderRadius: kecil ? '0.85rem' : undefined }}>
      {KILAU.map(({ delay, ...posisi }, i) => <span key={i} className="kilau" style={{ ...posisi, animationDelay: delay }} aria-hidden />)}
      {children}
    </div>
  )
}
