import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { pesanGalat } from '../lib/errors'

export type StatusAuth = 'memuat' | 'keluar' | 'bukan_admin' | 'admin' | 'galat'

interface NilaiAuth {
  status: StatusAuth
  session: Session | null
  email: string | null
  galat: string | null
  /** true setelah membuka tautan reset kata sandi dari email. */
  pemulihan: boolean
  masuk: (email: string, sandi: string) => Promise<void>
  keluar: () => Promise<void>
  selesaiPemulihan: () => void
  cekUlang: () => void
}

const KonteksAuth = createContext<NilaiAuth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusAuth>(supabase ? 'memuat' : 'keluar')
  const [session, setSession] = useState<Session | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [pemulihan, setPemulihan] = useState(false)
  const userTerakhir = useRef<string | null>(null)

  const periksaAdmin = useCallback(async (s: Session | null, paksa = false) => {
    setSession(s)
    if (!supabase || !s) {
      userTerakhir.current = null
      setStatus('keluar')
      return
    }
    // Cukup diperiksa sekali per akun, tidak setiap token diperbarui.
    if (!paksa && userTerakhir.current === s.user.id) return
    userTerakhir.current = s.user.id
    setStatus('memuat')
    const { data, error } = await supabase.rpc('is_admin')
    if (error) {
      userTerakhir.current = null
      setGalat(pesanGalat(error))
      setStatus('galat')
      return
    }
    setGalat(null)
    setStatus(data === true ? 'admin' : 'bukan_admin')
  }, [])

  useEffect(() => {
    if (!supabase) return
    let aktif = true
    supabase.auth.getSession().then(({ data }) => {
      if (aktif) void periksaAdmin(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setPemulihan(true)
      // Panggilan Supabase di dalam callback ini ditunda agar tidak macet.
      setTimeout(() => {
        if (aktif) void periksaAdmin(s)
      }, 0)
    })
    return () => {
      aktif = false
      data.subscription.unsubscribe()
    }
  }, [periksaAdmin])

  const masuk = useCallback(async (email: string, sandi: string) => {
    if (!supabase) throw new Error('Aplikasi belum tersambung ke database.')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: sandi })
    if (error) throw error
  }, [])

  const keluar = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    userTerakhir.current = null
    setSession(null)
    setStatus('keluar')
  }, [])

  const nilai = useMemo<NilaiAuth>(
    () => ({
      status,
      session,
      email: session?.user.email ?? null,
      galat,
      pemulihan,
      masuk,
      keluar,
      selesaiPemulihan: () => setPemulihan(false),
      cekUlang: () => void periksaAdmin(session, true),
    }),
    [status, session, galat, pemulihan, masuk, keluar, periksaAdmin],
  )

  return <KonteksAuth.Provider value={nilai}>{children}</KonteksAuth.Provider>
}

export function useAuth(): NilaiAuth {
  const v = useContext(KonteksAuth)
  if (!v) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return v
}
