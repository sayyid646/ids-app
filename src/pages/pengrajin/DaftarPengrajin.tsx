import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Power, Search } from 'lucide-react'
import { db } from '../../lib/supabase'
import type { PengrajinRingkas } from '../../lib/types'
import { formatAngka } from '../../lib/format'
import { useMuat } from '../../sync/useMuat'
import { useVersiData } from '../../sync/SyncProvider'
import {
  Isian, Kartu, KepalaHalaman, KodePengrajin, Kosong, KotakGalat, LencanaAktif, NamaPengrajin, Pemuat, Tombol, cx,
} from '../../components/ui/ui'
import { FormPengrajin } from './FormPengrajin'
import { KonfirmasiStatusPengrajin } from './AksiPengrajin'

type Saring = 'semua' | 'aktif' | 'nonaktif'

export function DaftarPengrajin() {
  const versi = useVersiData(['craftsmen', 'order_items', 'orders'])
  const { data, galat, memuat, muatUlang } = useMuat(async () => {
    const { data, error } = await db().from('v_craftsmen').select('*').order('code')
    if (error) throw error
    return (data ?? []) as PengrajinRingkas[]
  }, [versi])

  const [cari, setCari] = useState('')
  const [saring, setSaring] = useState<Saring>('semua')
  const [form, setForm] = useState<{ buka: boolean; p: PengrajinRingkas | null }>({ buka: false, p: null })
  const [ubahStatus, setUbahStatus] = useState<PengrajinRingkas | null>(null)

  const semua = data ?? []
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase().replace(/\s+/g, '')
    return semua.filter((p) => {
      if (saring === 'aktif' && !p.is_active) return false
      if (saring === 'nonaktif' && p.is_active) return false
      if (!q) return true
      return `${p.code}${p.name ?? ''}${p.phone ?? ''}`.toLowerCase().replace(/\s+/g, '').includes(q)
    })
  }, [semua, cari, saring])

  const jumlahAktif = semua.filter((p) => p.is_active).length

  return (
    <>
      <KepalaHalaman
        judul="Pengrajin"
        sub={data ? `${formatAngka(semua.length)} pengrajin · ${formatAngka(jumlahAktif)} aktif` : undefined}
        aksi={<Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => setForm({ buka: true, p: null })} disabled={!data}>Tambah pengrajin</Tombol>}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Isian aria-label="Cari pengrajin" placeholder="Cari nama atau ID pengrajin" className="pl-10" value={cari} onChange={(e) => setCari(e.target.value)} />
        </div>
        <div className="flex rounded-xl border border-ice-300 bg-white p-1" role="group" aria-label="Saring status">
          {(['semua', 'aktif', 'nonaktif'] as Saring[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={saring === s}
              onClick={() => setSaring(s)}
              className={cx('rounded-lg px-4 py-1.5 text-sm font-semibold capitalize', saring === s ? 'bg-navy-900 text-white' : 'text-ink-soft hover:text-navy-900')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {galat && <div className="mb-4"><KotakGalat pesan={galat} ulangi={muatUlang} /></div>}
      {memuat && !data ? (
        <Pemuat />
      ) : data && tampil.length === 0 ? (
        <Kosong
          judul={semua.length === 0 ? 'Belum ada pengrajin' : 'Tidak ada yang cocok'}
          isi={semua.length === 0 ? 'Tambahkan pengrajin pertama untuk mulai mencatat order.' : 'Coba kata pencarian atau saringan lain.'}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tampil.map((p) => (
            <li key={p.id}>
              <Kartu className={cx('flex h-full flex-col p-5 transition-shadow hover:shadow-pop', !p.is_active && 'opacity-80')}>
                <div className="flex items-center justify-between gap-3">
                  <KodePengrajin kode={p.code} />
                  <LencanaAktif aktif={p.is_active} />
                </div>
                <Link to={`/pengrajin/${p.id}`} className="mt-3 block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                  <NamaPengrajin nama={p.name} className="font-display text-2xl font-semibold text-navy-900" />
                </Link>
                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-ice-50 p-3 text-center">
                  <div>
                    <dt className="text-[11px] font-semibold text-ink-muted">Dalam proses</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums text-navy-900">{formatAngka(p.qty_dalam_proses)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-ink-muted">Selesai</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums text-gold-600">{formatAngka(p.qty_selesai)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold text-ink-muted">Diserahkan</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums text-ok-600">{formatAngka(p.qty_diserahkan)}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-1">
                  <Link
                    to={`/pengrajin/${p.id}`}
                    className="inline-flex h-9 items-center rounded-xl bg-navy-900 px-3 text-sm font-semibold text-white hover:bg-navy-800"
                  >
                    Lihat detail
                  </Link>
                  <Tombol kecil ragam="kedua" ikon={<Pencil className="h-4 w-4" />} onClick={() => setForm({ buka: true, p })}>Ubah</Tombol>
                  <Tombol kecil ragam="hantu" ikon={<Power className="h-4 w-4" />} onClick={() => setUbahStatus(p)} className="ml-auto">
                    {p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </Tombol>
                </div>
              </Kartu>
            </li>
          ))}
        </ul>
      )}

      <FormPengrajin
        terbuka={form.buka}
        tutup={() => setForm((f) => ({ ...f, buka: false }))}
        pengrajin={form.p}
        semua={semua}
        tersimpan={() => muatUlang()}
      />
      <KonfirmasiStatusPengrajin pengrajin={ubahStatus} tutup={() => setUbahStatus(null)} berubah={muatUlang} />
    </>
  )
}
