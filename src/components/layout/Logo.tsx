import { useId } from 'react'
import { cx } from '../ui/ui'
import { JALUR_LOGO, KOTAK_LOGO } from './jalurLogo'

/** Tanda logo resmi IDS (berlian bergaris) dengan isian gradasi emas. */
export function TandaIDS({ className, terang = true }: { className?: string; terang?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox={KOTAK_LOGO} className={cx('h-9 w-11', className)} aria-hidden>
      <defs>
        <linearGradient id={`emas-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={terang ? '#F1DEB4' : '#B8924A'} />
          <stop offset="0.55" stopColor={terang ? '#C9A96E' : '#8E6C27'} />
          <stop offset="1" stopColor={terang ? '#A9853F' : '#6E521B'} />
        </linearGradient>
      </defs>
      {JALUR_LOGO.map((d, i) => <path key={i} d={d} fill={`url(#emas-${id})`} />)}
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
