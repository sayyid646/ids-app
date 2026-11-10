import type { ReactNode } from 'react'
import { Logo } from '../components/layout/Logo'

/** Bingkai halaman sebelum login: panel navy dengan logo dan kartu putih. */
export function HalamanTamu({ judul, sub, children }: { judul: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-navy-900 lg:flex-row">
      <div className="relative flex flex-col justify-between overflow-hidden px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] lg:w-[44%] lg:px-14 lg:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-gold-400/20" aria-hidden />
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-gold-400/10" aria-hidden />
        <Logo />
        <div className="mt-10 hidden lg:block">
          <p className="font-display text-5xl font-semibold leading-tight text-white">
            Setiap perhiasan,<br />tercatat rapi.
          </p>
          <p className="mt-4 max-w-sm text-ice-200">
            Order, pengrajin, dan serah terima dalam satu tempat. Tersinkron di HP dan komputer.
          </p>
        </div>
        <p className="mt-6 hidden text-[11px] font-semibold tracking-[0.25em] text-gold-300 lg:block">SMART JEWELRY MANAGEMENT</p>
      </div>
      <div className="flex flex-1 items-start justify-center rounded-t-[2rem] bg-ice-50 px-5 py-10 lg:items-center lg:rounded-none lg:px-10">
        <div className="w-full max-w-md">
          <h1 className="font-display text-3xl font-semibold text-navy-900">{judul}</h1>
          {sub && <p className="mt-1 text-ink-soft">{sub}</p>}
          <div className="mt-6 rounded-3xl border border-ice-200 bg-white p-6 shadow-card">{children}</div>
        </div>
      </div>
    </div>
  )
}
