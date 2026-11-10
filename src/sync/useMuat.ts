import { useCallback, useEffect, useRef, useState } from 'react'
import { pesanGalat } from '../lib/errors'

interface HasilMuat<T> {
  data: T | null
  galat: string | null
  memuat: boolean
  muatUlang: () => void
}

/**
 * Memuat data dan memuat ulang setiap kali `kunci` berubah.
 * Data lama tetap ditampilkan selama memuat ulang, jadi layar tidak berkedip.
 * Hasil permintaan yang sudah usang diabaikan.
 */
export function useMuat<T>(ambil: () => Promise<T>, kunci: unknown[]): HasilMuat<T> {
  const [data, setData] = useState<T | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [memuat, setMemuat] = useState(true)
  const [ulang, setUlang] = useState(0)
  const nomor = useRef(0)
  const ambilRef = useRef(ambil)
  ambilRef.current = ambil

  useEffect(() => {
    const ke = ++nomor.current
    setMemuat(true)
    ambilRef
      .current()
      .then((d) => {
        if (ke !== nomor.current) return
        setData(d)
        setGalat(null)
      })
      .catch((e: unknown) => {
        if (ke !== nomor.current) return
        setGalat(pesanGalat(e))
      })
      .finally(() => {
        if (ke === nomor.current) setMemuat(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...kunci, ulang])

  const muatUlang = useCallback(() => setUlang((n) => n + 1), [])
  return { data, galat, memuat, muatUlang }
}
