import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Pengaturan } from '../lib/types'
import { aturGayaTanggal } from '../lib/format'

// Sinkronisasi antarperangkat.
// Satu saluran Realtime mendengarkan semua tabel. Setiap perubahan menaikkan "versi" tabel itu,
// dan halaman yang memakai tabel tersebut memuat ulang datanya.
// Saat koneksi kembali atau aplikasi dibuka lagi, semua data dimuat ulang supaya tidak ada yang tertinggal.

export const TABEL_SINKRON = ['app_settings', 'jewelry_categories', 'craftsmen', 'orders', 'order_items', 'activity_logs', 'silver_purchases', 'manual_notes', 'products'] as const
export type TabelSinkron = (typeof TABEL_SINKRON)[number]
export type StatusSinkron = 'menghubungkan' | 'tersinkron' | 'offline' | 'terputus'

interface NilaiSinkron {
  versi: Record<TabelSinkron, number>
  status: StatusSinkron
  pengaturan: Pengaturan | null
  zona: string
  muatUlangSemua: () => void
}

const KonteksSinkron = createContext<NilaiSinkron | null>(null)

const VERSI_AWAL = Object.fromEntries(TABEL_SINKRON.map((t) => [t, 0])) as Record<TabelSinkron, number>

export function SyncProvider({ children }: { children: ReactNode }) {
  const [versi, setVersi] = useState(VERSI_AWAL)
  const [status, setStatus] = useState<StatusSinkron>(navigator.onLine ? 'menghubungkan' : 'offline')
  const [pengaturan, setPengaturan] = useState<Pengaturan | null>(null)
  const tertunda = useRef<Set<TabelSinkron>>(new Set())
  const pewaktu = useRef<number | undefined>(undefined)
  const pernahTerhubung = useRef(false)

  const naikkan = (tabel: TabelSinkron[]) => {
    tabel.forEach((t) => tertunda.current.add(t))
    // Perubahan beruntun dikumpulkan dulu supaya tidak memuat ulang berkali-kali.
    window.clearTimeout(pewaktu.current)
    pewaktu.current = window.setTimeout(() => {
      const daftar = [...tertunda.current]
      tertunda.current.clear()
      setVersi((v) => {
        const baru = { ...v }
        daftar.forEach((t) => (baru[t] += 1))
        return baru
      })
    }, 350)
  }
  const muatUlangSemua = () => naikkan([...TABEL_SINKRON])

  // Saluran Realtime
  useEffect(() => {
    const sb = supabase
    if (!sb) return
    const saluran = sb.channel('ids-sinkron')
    TABEL_SINKRON.forEach((t) => {
      saluran.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => naikkan([t]))
    })
    saluran.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('tersinkron')
        if (pernahTerhubung.current) naikkan([...TABEL_SINKRON])
        pernahTerhubung.current = true
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        setStatus(navigator.onLine ? 'terputus' : 'offline')
      }
    })
    return () => {
      void sb.removeChannel(saluran)
    }
  }, [])

  // Status internet dan aplikasi dibuka kembali
  useEffect(() => {
    const online = () => {
      setStatus('menghubungkan')
      naikkan([...TABEL_SINKRON])
    }
    const offline = () => setStatus('offline')
    const terlihat = () => {
      if (document.visibilityState === 'visible') naikkan([...TABEL_SINKRON])
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', terlihat)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', terlihat)
    }
  }, [])

  // Pengaturan usaha (zona waktu, nama usaha, template nota dan WA)
  useEffect(() => {
    if (!supabase) return
    let aktif = true
    supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (aktif && data) {
          aturGayaTanggal((data as Pengaturan).date_format)
          setPengaturan(data as Pengaturan)
        }
      })
    return () => {
      aktif = false
    }
  }, [versi.app_settings])

  const nilai = useMemo<NilaiSinkron>(
    () => ({ versi, status, pengaturan, zona: pengaturan?.timezone ?? 'Asia/Makassar', muatUlangSemua }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [versi, status, pengaturan],
  )
  return <KonteksSinkron.Provider value={nilai}>{children}</KonteksSinkron.Provider>
}

export function useSinkron(): NilaiSinkron {
  const v = useContext(KonteksSinkron)
  if (!v) throw new Error('useSinkron harus dipakai di dalam SyncProvider')
  return v
}

/** Angka yang berubah setiap kali salah satu tabel berubah. Pakai sebagai dependensi pemuatan data. */
export function useVersiData(tabel: TabelSinkron[]): number {
  const { versi } = useSinkron()
  return tabel.reduce((n, t) => n + versi[t], 0)
}
