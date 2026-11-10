import { motion, useReducedMotion } from 'framer-motion'

// Teks yang muncul huruf demi huruf dengan pantulan kecil (pegas).
// Pembaca layar tetap membaca kalimat utuh; huruf-huruf animasi disembunyikan darinya.

interface Props {
  teks: string
  /** Jeda sebelum huruf pertama (detik). */
  jeda?: number
  /** Jarak antarhuruf (detik). Otomatis dipersingkat untuk teks panjang. */
  langkah?: number
  className?: string
  /** Seberapa jauh huruf jatuh dari atas, dalam em. */
  tinggi?: number
}

export function TeksHuruf({ teks, jeda = 0, langkah = 0.035, className, tinggi = 0.5 }: Props) {
  const kurangi = useReducedMotion()
  if (kurangi) return <span className={className}>{teks}</span>

  const huruf = teks.replace(/\s+/g, '').length || 1
  const jarak = Math.min(langkah, 0.7 / huruf)
  let n = 0
  return (
    <span className={className}>
      <span className="sr-only">{teks}</span>
      <span aria-hidden>
        {teks.split(' ').map((kata, ki, semua) => (
          <span key={ki} className="inline-block whitespace-nowrap">
            {Array.from(kata).map((h, hi) => {
              const i = n++
              return (
                <motion.span
                  key={hi}
                  className="inline-block will-change-transform"
                  initial={{ opacity: 0, y: `-${tinggi}em`, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: jeda + i * jarak,
                    y: { type: 'spring', stiffness: 520, damping: 13, mass: 0.6 },
                    scale: { type: 'spring', stiffness: 520, damping: 15, mass: 0.6 },
                    opacity: { duration: 0.18 },
                  }}
                >
                  {h}
                </motion.span>
              )
            })}
            {ki < semua.length - 1 && ' '}
          </span>
        ))}
      </span>
    </span>
  )
}
