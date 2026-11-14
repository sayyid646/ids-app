import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Minus, PackageOpen, Pause, Play, Plus, Search, Tag } from 'lucide-react'
import { db } from '../../lib/supabase'
import { formatAngka, formatRupiah } from '../../lib/format'
import { aturPutaran, putaranAktif, type Putaran } from '../../components/animasi/pengaturanAnimasi'
import { pesanGalat } from '../../lib/errors'
import { useMuat } from '../../sync/useMuat'
import { useVersiData } from '../../sync/SyncProvider'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Kartu, KepalaHalaman, Kosong, KotakGalat, Pemuat, Tombol, cx } from '../../components/ui/ui'
import { DialogProduk } from './DialogProduk'
import { JENIS, KELAS, LABEL_KELAS, fotoProduk, type Produk } from './produk'

type SaringKelas = 'semua' | Produk['class']

export default function StokBarang() {
  const versi = useVersiData(['products'])
  const { beri } = useNotifikasi()
  const [kelas, setKelas] = useState<SaringKelas>('semua')
  const [jenis, setJenis] = useState<string>('semua')
  const [gender, setGender] = useState<'semua' | 'LADY' | 'MAN'>('semua')
  const [tersedia, setTersedia] = useState(false)
  const [q, setQ] = useState('')
  const [buka, setBuka] = useState<Produk | 'baru' | null>(null)
  const [proses, setProses] = useState<string | null>(null)
  const [foto, setFoto] = useState<Record<string, string>>({})
  const [putaran, setPutaran] = useState<Putaran>(putaranAktif)
  const [gayaTerakhir, setGayaTerakhir] = useState<Exclude<Putaran, 'mati'>>(() => (putaranAktif() === 'putar' ? 'putar' : 'ayun'))
  useEffect(() => {
    const ikut = () => setPutaran(putaranAktif())
    window.addEventListener('ids-putaran', ikut)
    return () => window.removeEventListener('ids-putaran', ikut)
  }, [])
  const jedaPutaran = () => {
    if (putaran === 'mati') aturPutaran(gayaTerakhir)
    else { setGayaTerakhir(putaran); aturPutaran('mati') }
  }

  const data = useMuat(async () => {
    const { data, error } = await db().from('products').select('*').is('deleted_at', null).order('sort_order').order('name')
    if (error) throw error
    return (data ?? []) as Produk[]
  }, [versi])

  // Foto yang diunggah sendiri disimpan privat: minta tautan sementara sekaligus.
  useEffect(() => {
    const unggahan = (data.data ?? []).filter((p) => p.photo_path && !foto[p.photo_path])
    if (!unggahan.length) return
    db().storage.from('foto-barang').createSignedUrls(unggahan.map((p) => p.photo_path!), 3600).then(({ data: d }) => {
      if (!d) return
      setFoto((f) => ({ ...f, ...Object.fromEntries(d.filter((x) => x.signedUrl && x.path).map((x) => [x.path!, x.signedUrl])) }))
    })
  }, [data.data, foto])

  const semua = data.data ?? []
  const kata = q.trim().toLowerCase()
  const tampil = useMemo(() => semua.filter((p) =>
    (kelas === 'semua' || p.class === kelas)
    && (jenis === 'semua' || p.kind === jenis)
    && (gender === 'semua' || p.gender === gender)
    && (!tersedia || p.stock > 0)
    && (!kata || p.name.toLowerCase().includes(kata) || p.code.toLowerCase().includes(kata))), [semua, kelas, jenis, gender, tersedia, kata])

  const kelompok = KELAS.map((k) => ({ k, isi: tampil.filter((p) => p.class === k) })).filter((x) => x.isi.length)
  const totalStok = semua.reduce((t, p) => t + p.stock, 0)
  const habis = semua.filter((p) => p.stock === 0).length
  const nilai = semua.reduce((t, p) => t + (p.price ?? 0) * p.stock, 0)

  const ubah = async (p: Produk, delta: number) => {
    setProses(p.id)
    try {
      const { error } = await db().rpc('ubah_stok_produk', { p_produk: p.id, p_delta: delta, p_alasan: delta > 0 ? 'Tambah cepat' : 'Kurangi cepat' })
      if (error) throw error
      data.muatUlang()
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setProses(null)
    }
  }

  return (
    <>
      <KepalaHalaman
        judul="Stok barang"
        sub="Jumlah perhiasan jadi yang tersedia untuk setiap model katalog. Tekan + atau − untuk mengubah satu per satu, atau buka kartunya untuk jumlah banyak dan riwayat."
        aksi={
          <div className="flex flex-wrap gap-2">
            <Tombol ragam="kedua" ikon={putaran === 'mati' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} onClick={jedaPutaran}>
              {putaran === 'mati' ? 'Putar perhiasan' : 'Hentikan putaran'}
            </Tombol>
            <Tombol ikon={<Plus className="h-4 w-4" />} onClick={() => setBuka('baru')}>Tambah model</Tombol>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['Model', formatAngka(semua.length), 'text-navy-900'], ['Total stok', `${formatAngka(totalStok)} pcs`, 'text-gold-600'],
          ['Stok habis', formatAngka(habis), habis ? 'text-bad-700' : 'text-ok-700'], ['Nilai stok', formatRupiah(nilai), 'text-navy-900']] as const).map(([l, n, w]) => (
          <Kartu key={l} className="p-3 sm:p-4">
            <p className="text-[11px] font-semibold tracking-wide text-ink-muted">{l.toUpperCase()}</p>
            <p className={cx('mt-1 truncate font-display text-xl font-semibold tabular-nums sm:text-2xl', w)}>{n}</p>
          </Kartu>
        ))}
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau kode, misalnya High Man 03" aria-label="Cari model"
            className="h-11 w-full rounded-xl border border-ice-300 bg-white pl-10 pr-3 text-sm focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300" />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(['semua', ...KELAS] as SaringKelas[]).map((k) => (
            <button key={k} type="button" aria-pressed={kelas === k} onClick={() => setKelas(k)}
              className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
                kelas === k ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft hover:border-navy-700')}>
              {k === 'semua' ? 'Semua' : LABEL_KELAS[k]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Jenis" value={jenis} onChange={(e) => setJenis(e.target.value)} className="h-10 rounded-xl border border-ice-300 bg-white px-3">
            <option value="semua">Semua jenis</option>
            {JENIS.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          {(['semua', 'LADY', 'MAN'] as const).map((g) => (
            <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}
              className={cx('h-10 rounded-xl border px-3 font-semibold', gender === g ? 'border-gold-400 bg-gold-50 text-navy-900' : 'border-ice-300 bg-white text-ink-soft')}>
              {g === 'semua' ? 'Lady & Man' : g}
            </button>
          ))}
          <label className="ml-1 inline-flex items-center gap-2 font-semibold text-navy-900">
            <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={tersedia} onChange={(e) => setTersedia(e.target.checked)} />
            Hanya yang tersedia
          </label>
        </div>
      </div>

      {data.memuat && !data.data && <Pemuat />}
      {data.galat && !data.data && <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />}
      {data.data && tampil.length === 0 && (
        <Kosong judul="Tidak ada model yang cocok" isi={tersedia ? 'Belum ada stok untuk saringan ini. Matikan "Hanya yang tersedia" untuk melihat semua model.' : 'Coba saringan lain.'} />
      )}

      {kelompok.map(({ k, isi }) => (
        <section key={k} className="mb-8" aria-label={LABEL_KELAS[k]}>
          <h2 className="mb-3 rounded-lg bg-gradient-to-r from-gold-300 via-gold-200 to-gold-400 px-4 py-1.5 text-center font-display text-xl font-semibold text-navy-950">
            {LABEL_KELAS[k]} Collection <span className="text-sm font-sans font-semibold">· {isi.reduce((t, p) => t + p.stock, 0)} pcs</span>
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {isi.map((p, i) => {
              const src = fotoProduk(p, foto)
              return (
                <motion.li key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                  <Kartu className={cx('flex h-full flex-col overflow-hidden', p.stock === 0 && 'opacity-80')}>
                    <button type="button" onClick={() => setBuka(p)} className="block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400" aria-label={`Buka ${p.name}`}>
                      <div className={cx('panggung relative aspect-square overflow-hidden bg-[radial-gradient(circle_at_50%_38%,#FFFFFF,#F1F4F8_70%,#E4E9EF)]', putaran !== 'mati' && putaran)}>
                        {src ? (
                          <>
                            <span className="bayangan" style={{ animationDelay: `${-(i * 0.7) % 7}s` }} aria-hidden />
                            <img src={src} alt={p.name} loading="lazy" draggable={false} style={{ animationDelay: `${-(i * 0.7) % 7}s` }}
                              className="perhiasan relative h-full w-full object-contain p-[12%]" />
                          </>
                        ) : <div className="grid h-full place-items-center text-ink-muted"><PackageOpen className="h-10 w-10" /></div>}
                        {p.price != null && (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-gold-600 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white shadow-sm">
                            <Tag className="h-3 w-3" aria-hidden />{formatRupiah(p.price)}
                          </span>
                        )}
                        <span className={cx('absolute right-2 top-2 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums shadow-sm',
                          p.stock > 0 ? 'bg-navy-900 text-white' : 'bg-bad-50 text-bad-700')}>
                          {p.stock > 0 ? `${formatAngka(p.stock)} pcs` : 'Habis'}
                        </span>
                      </div>
                      <div className="px-3 pt-2">
                        <p className="truncate text-sm font-bold text-navy-900">{p.name}</p>
                        <p className="truncate text-[11px] text-ink-muted"><span className="kode-ids">{p.code}</span> · {p.kind}{p.gender ? ` · ${p.gender}` : ''}</p>
                      </div>
                    </button>
                    <div className="mt-auto flex items-center justify-between gap-2 p-3 pt-2">
                      <button type="button" aria-label={`Kurangi stok ${p.name}`} disabled={p.stock === 0 || proses === p.id} onClick={() => void ubah(p, -1)}
                        className="grid h-10 w-10 place-items-center rounded-xl border border-ice-300 bg-white text-navy-900 active:scale-95 disabled:opacity-35"><Minus className="h-4 w-4" /></button>
                      <span className="font-display text-2xl font-semibold tabular-nums text-navy-900">{formatAngka(p.stock)}</span>
                      <button type="button" aria-label={`Tambah stok ${p.name}`} disabled={proses === p.id} onClick={() => void ubah(p, 1)}
                        className="grid h-10 w-10 place-items-center rounded-xl bg-navy-900 text-white active:scale-95 disabled:opacity-35"><Plus className="h-4 w-4" /></button>
                    </div>
                  </Kartu>
                </motion.li>
              )
            })}
          </ul>
        </section>
      ))}

      <DialogProduk produk={buka} tutup={() => setBuka(null)} berubah={data.muatUlang} fotoUnggahan={foto} />
    </>
  )
}
