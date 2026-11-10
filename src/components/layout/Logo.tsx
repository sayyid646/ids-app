import { cx } from '../ui/ui'

/** Logo IDS: berlian bergaris emas dan tulisan IDS. */
export function TandaIDS({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cx('h-9 w-9', className)} aria-hidden>
      <path d="M13 15h22l7 9-18 18L6 24z" fill="none" stroke="#C9A96E" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M6 24h36M19 15l-3.5 9L24 42l8.5-18L29 15M15.5 24 24 15l8.5 9" fill="none" stroke="#C9A96E" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ terang = true, kecil }: { terang?: boolean; kecil?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TandaIDS className={kecil ? 'h-8 w-8' : 'h-10 w-10'} />
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
