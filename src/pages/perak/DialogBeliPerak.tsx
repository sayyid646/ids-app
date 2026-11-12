import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatGram, formatTanggalHari, hariIni } from '../../lib/format'
import { pesanGalat } from '../../lib/errors'
import { useSinkron } from '../../sync/SyncProvider'
import { labelPengrajin } from '../../sync/useMaster'
import type { Pengrajin } from '../../lib/types'
import { Jendela } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Bidang, Isian, Tombol, cx } from '../../components/ui/ui'
import { PILIHAN_GRAM } from './perak'

/** Mencatat pembelian perak untuk satu pengrajin: kelipatan 50 gram, dengan tanggal pembelian. */
export function DialogBeliPerak({ terbuka, tutup, pengrajin, daftar }: {
  terbuka: boolean
  tutup: () => void
  /** Pengrajin yang sudah dipilih (dari halaman pengrajin). */
  pengrajin?: Pick<Pengrajin, 'id' | 'code' | 'name'> | null
  /** Daftar pilihan pengrajin bila belum dipilih. */
  daftar?: Pengrajin[]
}) {
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const [idPengrajin, setIdPengrajin] = useState('')
  const [tanggal, setTanggal] = useState(() => hariIni(zona))
  const [gram, setGram] = useState(50)
  const [catatan, setCatatan] = useState('')
  const [galat, setGalat] = useState<string | null>(null)
  const [simpan, setSimpan] = useState(false)

  useEffect(() => {
    if (!terbuka) return
    setIdPengrajin(pengrajin?.id ?? '')
    setTanggal(hariIni(zona))
    setGram(50)
    setCatatan('')
    setGalat(null)
  }, [terbuka, pengrajin?.id, zona])

  const kirim = async () => {
    if (!idPengrajin) { setGalat('Pilih pengrajin dulu.'); return }
    setSimpan(true)
    setGalat(null)
    try {
      const { error } = await db().from('silver_purchases').insert({ craftsman_id: idPengrajin, purchase_date: tanggal, grams: gram, notes: catatan.trim() || null })
      if (error) throw error
      const p = pengrajin ?? daftar?.find((x) => x.id === idPengrajin)
      beri(`Pembelian ${formatGram(gram)} untuk ${p?.code ?? 'pengrajin'} dicatat.`)
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setSimpan(false)
    }
  }

  return (
    <Jendela terbuka={terbuka} tutup={tutup} terkunci={simpan} judul="Catat pembelian perak"
      kaki={<><Tombol ragam="hantu" onClick={tutup} disabled={simpan}>Batal</Tombol><Tombol memuat={simpan} onClick={() => void kirim()}>Simpan pembelian</Tombol></>}>
      <div className="space-y-5">
        {pengrajin ? (
          <p className="rounded-xl bg-ice-50 px-3 py-2 text-sm">Pengrajin: <strong className="text-navy-900">{labelPengrajin(pengrajin)}</strong></p>
        ) : (
          <Bidang label="Pengrajin" id="bp-pengrajin" wajib>
            <select id="bp-pengrajin" value={idPengrajin} onChange={(e) => setIdPengrajin(e.target.value)}
              className="h-11 w-full rounded-xl border border-ice-300 bg-white px-3 text-[15px] focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300">
              <option value="">Pilih pengrajin</option>
              {(daftar ?? []).filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{labelPengrajin(p)}</option>)}
            </select>
          </Bidang>
        )}

        <Bidang label="Tanggal pembelian" id="bp-tanggal" bantuan={formatTanggalHari(tanggal)}>
          <Isian id="bp-tanggal" type="date" max={hariIni(zona)} value={tanggal} onChange={(e) => e.target.value && setTanggal(e.target.value)} />
        </Bidang>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-navy-900">Jumlah perak (kelipatan 50 gram)</legend>
          <div className="mb-3 flex items-center gap-3">
            <button type="button" aria-label="Kurangi 50 gram" disabled={gram <= 50} onClick={() => setGram((g) => Math.max(50, g - 50))}
              className="grid h-11 w-11 place-items-center rounded-xl border border-ice-300 bg-white text-navy-900 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
            <p className="min-w-[7rem] text-center font-display text-3xl font-semibold tabular-nums text-navy-900">{gram.toLocaleString('id-ID')} <span className="text-lg">g</span></p>
            <button type="button" aria-label="Tambah 50 gram" onClick={() => setGram((g) => g + 50)}
              className="grid h-11 w-11 place-items-center rounded-xl border border-ice-300 bg-white text-navy-900"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PILIHAN_GRAM.map((g) => (
              <button key={g} type="button" aria-pressed={gram === g} onClick={() => setGram(g)}
                className={cx('rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
                  gram === g ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft hover:border-navy-700')}>
                {g} g
              </button>
            ))}
          </div>
        </fieldset>

        <Bidang label="Catatan" id="bp-catatan" bantuan="Opsional, misalnya nama toko atau nomor kuitansi.">
          <Isian id="bp-catatan" value={catatan} maxLength={300} onChange={(e) => setCatatan(e.target.value)} />
        </Bidang>
        {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      </div>
    </Jendela>
  )
}
