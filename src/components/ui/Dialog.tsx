import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Tombol } from './ui'
import { pesanGalat } from '../../lib/errors'

interface PropsJendela {
  terbuka: boolean
  tutup: () => void
  judul: string
  children: ReactNode
  kaki?: ReactNode
  lebar?: 'sm' | 'md' | 'lg'
  /** Cegah menutup saat sedang menyimpan. */
  terkunci?: boolean
}

/** Jendela dialog. Di HP muncul dari bawah, di komputer di tengah layar. Esc untuk menutup. */
export function Jendela({ terbuka, tutup, judul, children, kaki, lebar = 'md', terkunci }: PropsJendela) {
  const idJudul = useId()
  const panel = useRef<HTMLDivElement>(null)
  // Disimpan di ref supaya efek fokus hanya berjalan saat jendela dibuka, bukan setiap render.
  const tutupRef = useRef(tutup)
  const kunciRef = useRef(terkunci)
  tutupRef.current = tutup
  kunciRef.current = terkunci

  useEffect(() => {
    if (!terbuka) return
    const sebelumnya = document.activeElement as HTMLElement | null
    const tekan = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !kunciRef.current) tutupRef.current()
    }
    document.addEventListener('keydown', tekan)
    const gulir = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      const pertama = panel.current?.querySelector<HTMLElement>('input, textarea, select, button[data-fokus]')
      ;(pertama ?? panel.current)?.focus()
    }, 30)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', tekan)
      document.body.style.overflow = gulir
      sebelumnya?.focus?.()
    }
  }, [terbuka])

  if (!terbuka) return null
  const maks = lebar === 'sm' ? 'sm:max-w-md' : lebar === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-navy-950/45 backdrop-blur-[2px]" onClick={() => !terkunci && tutup()} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idJudul}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-pop outline-none sm:rounded-3xl ${maks}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-ice-200 px-5 py-4 sm:px-6">
          <h2 id={idJudul} className="font-display text-2xl font-semibold text-navy-900">{judul}</h2>
          <button
            type="button"
            onClick={tutup}
            disabled={terkunci}
            className="rounded-full p-2 text-ink-soft hover:bg-ice-100 disabled:opacity-40"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {kaki && (
          <div className="flex flex-col-reverse gap-2 border-t border-ice-200 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
            {kaki}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

interface PropsKonfirmasi {
  terbuka: boolean
  tutup: () => void
  judul: string
  pesan: ReactNode
  labelYa: string
  bahaya?: boolean
  /** Dijalankan saat menekan tombol ya. Jendela tertutup bila berhasil; galat ditampilkan bila gagal. */
  jalankan: () => Promise<void>
}

/** Konfirmasi untuk perubahan penting. Tombol terkunci selama proses supaya tidak tersimpan dua kali. */
export function Konfirmasi({ terbuka, tutup, judul, pesan, labelYa, bahaya, jalankan }: PropsKonfirmasi) {
  const [proses, setProses] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)

  useEffect(() => {
    if (terbuka) setGalat(null)
  }, [terbuka])

  const ya = async () => {
    setProses(true)
    setGalat(null)
    try {
      await jalankan()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setProses(false)
    }
  }

  return (
    <Jendela
      terbuka={terbuka}
      tutup={tutup}
      judul={judul}
      lebar="sm"
      terkunci={proses}
      kaki={
        <>
          <Tombol ragam="hantu" onClick={tutup} disabled={proses}>Batal</Tombol>
          <Tombol ragam={bahaya ? 'bahaya' : 'utama'} onClick={ya} memuat={proses} data-fokus>
            {labelYa}
          </Tombol>
        </>
      }
    >
      <div className="space-y-3 text-[15px] text-ink-soft">{pesan}</div>
      {galat && <p role="alert" className="mt-4 rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
    </Jendela>
  )
}
