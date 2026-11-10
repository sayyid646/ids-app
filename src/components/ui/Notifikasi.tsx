import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'

type Jenis = 'berhasil' | 'galat' | 'info'
interface Pesan { id: number; jenis: Jenis; teks: string }
interface NilaiNotif { beri: (teks: string, jenis?: Jenis) => void }

const KonteksNotif = createContext<NilaiNotif | null>(null)

export function PenyediaNotifikasi({ children }: { children: ReactNode }) {
  const [daftar, setDaftar] = useState<Pesan[]>([])
  const nomor = useRef(0)

  const beri = useCallback((teks: string, jenis: Jenis = 'berhasil') => {
    const id = ++nomor.current
    setDaftar((d) => [...d.slice(-2), { id, jenis, teks }])
    window.setTimeout(() => setDaftar((d) => d.filter((p) => p.id !== id)), jenis === 'galat' ? 6500 : 3500)
  }, [])

  const nilai = useMemo(() => ({ beri }), [beri])

  return (
    <KonteksNotif.Provider value={nilai}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6"
      >
        {daftar.map((p) => (
          <div
            key={p.id}
            role={p.jenis === 'galat' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-ice-200 bg-white px-4 py-3 text-sm text-ink shadow-pop"
          >
            {p.jenis === 'berhasil' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok-600" aria-hidden />}
            {p.jenis === 'galat' && <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad-600" aria-hidden />}
            {p.jenis === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" aria-hidden />}
            <span>{p.teks}</span>
          </div>
        ))}
      </div>
    </KonteksNotif.Provider>
  )
}

export function useNotifikasi(): NilaiNotif {
  const v = useContext(KonteksNotif)
  if (!v) throw new Error('useNotifikasi harus dipakai di dalam PenyediaNotifikasi')
  return v
}
