import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { StatusBarang } from '../../lib/types'
import { LABEL_STATUS } from '../../lib/types'
import { TeksHuruf } from '../animasi/TeksHuruf'

export function cx(...k: (string | false | null | undefined)[]): string {
  return k.filter(Boolean).join(' ')
}

// ------------------------------------------------------------------ tombol
type Ragam = 'utama' | 'kedua' | 'hantu' | 'bahaya'
interface PropsTombol extends ButtonHTMLAttributes<HTMLButtonElement> {
  ragam?: Ragam
  kecil?: boolean
  memuat?: boolean
  ikon?: ReactNode
}

const RAGAM: Record<Ragam, string> = {
  utama: 'bg-navy-900 text-white hover:bg-navy-800 shadow-sm',
  kedua: 'bg-white text-navy-900 border border-gold-300 hover:border-gold-400 hover:bg-gold-50',
  hantu: 'text-navy-800 hover:bg-ice-100',
  bahaya: 'bg-bad-600 text-white hover:bg-bad-700',
}

export const Tombol = forwardRef<HTMLButtonElement, PropsTombol>(function Tombol(
  { ragam = 'utama', kecil, memuat, ikon, className, children, disabled, type = 'button', ...sisa },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || memuat}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60 select-none',
        kecil ? 'h-9 px-3 text-sm' : 'h-11 px-5 text-[15px]',
        RAGAM[ragam],
        className,
      )}
      {...sisa}
    >
      {memuat ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : ikon}
      {children}
    </button>
  )
})

// ------------------------------------------------------------------- isian
interface PropsBidang {
  label: string
  id: string
  galat?: string
  bantuan?: string
  wajib?: boolean
  children: ReactNode
}
export function Bidang({ label, id, galat, bantuan, wajib, children }: PropsBidang) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-navy-900">
        {label}
        {wajib && <span className="text-gold-600"> *</span>}
      </label>
      {children}
      {galat ? (
        <p id={`${id}-galat`} role="alert" className="text-sm text-bad-600">{galat}</p>
      ) : bantuan ? (
        <p id={`${id}-bantuan`} className="text-sm text-ink-muted">{bantuan}</p>
      ) : null}
    </div>
  )
}

const KELAS_ISIAN =
  'w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 ' +
  'focus:outline-none focus:ring-2 focus:ring-gold-300 focus:border-gold-400 transition-shadow'

export const Isian = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { salah?: boolean }>(
  function Isian({ className, salah, ...sisa }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={salah || undefined}
        className={cx(KELAS_ISIAN, 'h-11', salah ? 'border-bad-600' : 'border-ice-300', className)}
        {...sisa}
      />
    )
  },
)

export const IsianPanjang = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { salah?: boolean }>(
  function IsianPanjang({ className, salah, ...sisa }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={salah || undefined}
        className={cx(KELAS_ISIAN, 'min-h-[88px] py-2.5', salah ? 'border-bad-600' : 'border-ice-300', className)}
        {...sisa}
      />
    )
  },
)

// ------------------------------------------------------------- penanda
const GAYA_STATUS: Record<StatusBarang, string> = {
  dalam_proses: 'bg-ice-100 text-navy-800 ring-ice-300',
  selesai: 'bg-gold-50 text-gold-700 ring-gold-200',
  diserahkan: 'bg-ok-50 text-ok-700 ring-ok-600/20',
}
export function LencanaStatus({ status, batal }: { status: StatusBarang; batal?: boolean }) {
  if (batal) {
    return <span className="inline-flex items-center rounded-full bg-bad-50 px-2.5 py-0.5 text-xs font-semibold text-bad-700 ring-1 ring-bad-600/20">Dibatalkan</span>
  }
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 whitespace-nowrap', GAYA_STATUS[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {LABEL_STATUS[status]}
    </span>
  )
}

export function LencanaAktif({ aktif }: { aktif: boolean }) {
  return aktif ? (
    <span className="inline-flex items-center rounded-full bg-ok-50 px-2.5 py-0.5 text-xs font-semibold text-ok-700 ring-1 ring-ok-600/20">Aktif</span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-ice-100 px-2.5 py-0.5 text-xs font-semibold text-ink-soft ring-1 ring-ice-300">Nonaktif</span>
  )
}

export function KodePengrajin({ kode }: { kode: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gold-300 bg-gold-50 px-2 py-0.5 text-xs font-bold tracking-wider text-gold-700">
      {kode}
    </span>
  )
}

export function NamaPengrajin({ nama, className }: { nama: string | null; className?: string }) {
  return nama ? (
    <span className={className}>{nama}</span>
  ) : (
    <span className={cx(className, 'italic text-ink-muted')}>Nama belum diisi</span>
  )
}

// --------------------------------------------------------- keadaan layar
export function Pemuat({ teks = 'Memuat data...' }: { teks?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-ink-soft">
      <Loader2 className="h-5 w-5 animate-spin text-gold-500" aria-hidden />
      <span>{teks}</span>
    </div>
  )
}

export function KotakGalat({ pesan, ulangi }: { pesan: string; ulangi?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl2 border border-bad-600/20 bg-bad-50 p-4 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-bad-600" aria-hidden />
      <p className="flex-1 text-sm text-bad-700">{pesan}</p>
      {ulangi && <Tombol kecil ragam="kedua" onClick={ulangi}>Coba lagi</Tombol>}
    </div>
  )
}

export function Kosong({ judul, isi, aksi }: { judul: string; isi?: string; aksi?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-ice-300 bg-white/60 px-6 py-12 text-center">
      <p className="font-display text-xl font-semibold text-navy-900">{judul}</p>
      {isi && <p className="max-w-md text-sm text-ink-soft">{isi}</p>}
      {aksi && <div className="mt-2">{aksi}</div>}
    </div>
  )
}

export function Kartu({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('kaca kartu-pantul rounded-xl2 border border-ice-200 bg-white shadow-card', className)}>{children}</div>
}

export function KepalaHalaman({ judul, sub, aksi }: { judul: string; sub?: ReactNode; aksi?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold leading-tight text-navy-900 sm:text-4xl"><TeksHuruf key={judul} teks={judul} /></h1>
        {sub && <div className="mt-1 text-sm text-ink-soft">{sub}</div>}
      </div>
      {aksi && <div className="flex flex-wrap gap-2">{aksi}</div>}
    </div>
  )
}
