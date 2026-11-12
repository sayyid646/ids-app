import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Plus, Search } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatRupiah, formatTanggalHari } from '../../lib/format'
import { useMuat } from '../../sync/useMuat'
import { useVersiData } from '../../sync/SyncProvider'
import { Kartu, KepalaHalaman, Kosong, KotakGalat, Pemuat, Tombol } from '../../components/ui/ui'

interface RingkasNota {
  id: string
  note_no: number
  note_date: string
  recipient: string | null
  lines: unknown[]
  total: number
}

export default function DaftarNota() {
  const navigasi = useNavigate()
  const versi = useVersiData(['manual_notes'])
  const [q, setQ] = useState('')

  const data = useMuat(async () => {
    const { data, error } = await db().from('manual_notes').select('id, note_no, note_date, recipient, lines, total')
      .is('deleted_at', null).order('note_date', { ascending: false }).order('note_no', { ascending: false }).limit(300)
    if (error) throw error
    return (data ?? []) as RingkasNota[]
  }, [versi])

  const kata = q.trim().toLowerCase()
  const tampil = (data.data ?? []).filter((n) => !kata
    || (n.recipient ?? '').toLowerCase().includes(kata)
    || String(n.note_no).includes(kata)
    || n.lines.some((b) => String((b as { nama?: string }).nama ?? '').toLowerCase().includes(kata)))

  return (
    <>
      <KepalaHalaman
        judul="Nota"
        sub="Nota yang diketik sendiri: banyaknya, nama barang, dan harga. Jumlah dan total dihitung otomatis."
        aksi={<Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => navigasi('/nota/baru')}>Nota baru</Tombol>}
      />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor, penerima, atau nama barang"
          aria-label="Cari nota" className="h-11 w-full rounded-xl border border-ice-300 bg-white pl-10 pr-3 text-sm focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300" />
      </div>
      {data.memuat && !data.data && <Pemuat />}
      {data.galat && !data.data && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
      {data.data && tampil.length === 0 && (
        <Kosong judul={kata ? 'Tidak ada yang cocok' : 'Belum ada nota'} isi={kata ? 'Coba kata lain.' : 'Tekan "Nota baru" untuk membuat nota pertama.'}
          aksi={!kata ? <Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => navigasi('/nota/baru')}>Nota baru</Tombol> : undefined} />
      )}
      {tampil.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tampil.map((n) => (
            <li key={n.id}>
              <Link to={`/nota/${n.id}`} className="block">
                <Kartu className="kartu-pantul flex items-start gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700" aria-hidden><FileText className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold tracking-[0.15em] text-ink-muted">No. {String(n.note_no).padStart(4, '0')}</span>
                    <span className="block truncate font-semibold text-navy-900">{n.recipient ?? 'Tanpa nama penerima'}</span>
                    <span className="block text-sm text-ink-soft">{formatTanggalHari(n.note_date)} · {n.lines.length} baris</span>
                  </span>
                  <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-navy-900">{formatRupiah(n.total)}</span>
                </Kartu>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
