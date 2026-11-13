import { cx } from '../ui/ui'
import { JALUR_LOGO, KOTAK_LOGO } from './jalurLogo'

/** Tanda logo resmi IDS (berlian bergaris) dalam warna emas resminya. */
export function TandaIDS({ className }: { className?: string; terang?: boolean }) {
  // Warna resmi logo IDS: emas #8E6C27, atau putih di atas emas (versi resmi kebalikannya).
  return (
    <svg viewBox={KOTAK_LOGO} className={cx('h-9 w-11', className)} aria-hidden>
      {JALUR_LOGO.map((d, i) => <path key={i} d={d} style={{ fill: 'var(--warna-logo, #8E6C27)' }} />)}
    </svg>
  )
}

export function Logo({ terang = true, kecil }: { terang?: boolean; kecil?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TandaIDS terang={terang} className={kecil ? 'h-8 w-10' : 'h-10 w-12'} />
      <div className="leading-none">
        <p className={cx('font-display font-bold tracking-[0.18em]', kecil ? 'text-2xl' : 'text-3xl', terang ? 'text-white' : 'text-navy-900')}>
          IDS
        </p>
        {!kecil && (
          <p className={cx('mt-1 text-[10px] font-semibold tracking-[0.22em]', terang ? 'text-gold-300' : 'text-gold-600')}>
            INTAN DUA SAUDARA
          </p>
        )}
      </div>
    </div>
  )
}
