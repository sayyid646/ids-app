import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Minus, PackageOpen, Plus, Tag, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { bacaRupiah, formatAngka, formatRupiah, formatTanggalWaktu, ketikRupiah } from '../../lib/format'
import { pesanGalat } from '../../lib/errors'
import { useSinkron } from '../../sync/SyncProvider'
import { Jendela, Konfirmasi } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Bidang, Isian, Tombol, cx } from '../../components/ui/ui'
import { JENIS, KELAS, LABEL_KELAS, fotoProduk, type GerakStok, type Produk } from './produk'

interface Isi { code: string; name: string; class: Produk['class']; kind: Produk['kind']; gender: '' | 'LADY' | 'MAN'; notes: string; harga: string }
const kosong: Isi = { code: '', name: '', class: 'PREMIUM', kind: 'Cincin', gender: '', notes: '', harga: '' }

/** Detail satu model: tambah/kurangi stok dalam jumlah banyak, riwayat stok, ubah data, foto, dan hapus. */
export function DialogProduk({ produk, tutup, berubah, fotoUnggahan }: {
  produk: Produk | 'baru' | null
  tutup: () => void
  berubah: () => void
  fotoUnggahan: Record<string, string>
}) {
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const baru = produk === 'baru'
  const p = produk && produk !== 'baru' ? produk : null
  const [isi, setIsi] = useState<Isi>(kosong)
  const [ubahData, setUbahData] = useState(false)
  const [jumlah, setJumlah] = useState(1)
  const [arah, setArah] = useState<'masuk' | 'keluar'>('masuk')
  const [alasan, setAlasan] = useState('')
  const [riwayat, setRiwayat] = useState<GerakStok[] | null>(null)
  const [galat, setGalat] = useState<string | null>(null)
  const [simpan, setSimpan] = useState(false)
  const [tanyaHapus, setTanyaHapus] = useState(false)
  const [harga, setHarga] = useState('')
  const berkas = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!produk) return
    setGalat(null)
    setJumlah(1)
    setArah('masuk')
    setAlasan('')
    setUbahData(baru)
    setIsi(p ? { code: p.code, name: p.name, class: p.class, kind: p.kind, gender: p.gender ?? '', notes: p.notes ?? '', harga: p.price != null ? ketikRupiah(String(Math.round(p.price))) : '' } : kosong)
    setHarga(p?.price != null ? ketikRupiah(String(Math.round(p.price))) : '')
    setRiwayat(null)
    if (p) {
      db().from('product_stock_moves').select('id, delta, stock_after, reason, created_at').eq('product_id', p.id)
        .order('created_at', { ascending: false }).limit(30)
        .then(({ data }) => setRiwayat((data ?? []) as GerakStok[]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produk])

  const simpanData = async () => {
    setSimpan(true)
    setGalat(null)
    try {
      const muatan = { code: isi.code, name: isi.name, class: isi.class, kind: isi.kind, gender: isi.gender || null, notes: isi.notes || null, price: bacaRupiah(isi.harga.replace(/\./g, '')) }
      if (!muatan.name.trim()) throw new Error('Nama model wajib diisi.')
      if (!/^[A-Za-z0-9 -]{2,20}$/.test(muatan.code.trim())) throw new Error('Kode 2–20 huruf/angka, contoh LX-M05.')
      if (baru) {
        const { error } = await db().from('products').insert(muatan)
        if (error) throw error
        beri(`Model ${muatan.name} ditambahkan. Stok awal 0, tambahkan lewat tombol +.`)
        berubah()
        tutup()
      } else if (p) {
        const { error } = await db().from('products').update(muatan).eq('id', p.id)
        if (error) throw error
        beri('Data model disimpan.')
        setUbahData(false)
        berubah()
      }
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setSimpan(false)
    }
  }

  const simpanHarga = async () => {
    if (!p) return
    setSimpan(true)
    setGalat(null)
    try {
      const nilai = bacaRupiah(harga.replace(/\./g, ''))
      const { error } = await db().from('products').update({ price: nilai }).eq('id', p.id)
      if (error) throw error
      beri(nilai == null ? `Harga ${p.name} dikosongkan.` : `Harga ${p.name} disimpan: ${formatRupiah(nilai)}.`)
      berubah()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setSimpan(false)
    }
  }

  const simpanStok = async () => {
    if (!p) return
    setSimpan(true)
    setGalat(null)
    try {
      const delta = arah === 'masuk' ? jumlah : -jumlah
      const { data, error } = await db().rpc('ubah_stok_produk', { p_produk: p.id, p_delta: delta, p_alasan: alasan || (arah === 'masuk' ? 'Barang masuk' : 'Barang keluar') })
      if (error) throw error
      beri(`Stok ${p.name} sekarang ${formatAngka(Number(data))} pcs.`)
      berubah()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setSimpan(false)
    }
  }

  const unggahFoto = async (f: File) => {
    if (!p) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setGalat('Foto harus JPG, PNG, atau WEBP.'); return }
    if (f.size > 5 * 1024 * 1024) { setGalat('Ukuran foto maksimal 5 MB.'); return }
    setSimpan(true)
    setGalat(null)
    try {
      const path = `produk/${p.id}-${Date.now()}.${f.type.split('/')[1]}`
      const up = await db().storage.from('foto-barang').upload(path, f, { contentType: f.type, upsert: false })
      if (up.error) throw up.error
      const { error } = await db().from('products').update({ photo_path: path }).eq('id', p.id)
      if (error) throw error
      if (p.photo_path) await db().storage.from('foto-barang').remove([p.photo_path])
      beri('Foto diganti.')
      berubah()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setSimpan(false)
    }
  }

  const src = p ? fotoProduk(p, fotoUnggahan) : null
  const pilihan = (nilai: string, aktif: boolean, klik: () => void) => (
    <button key={nilai} type="button" aria-pressed={aktif} onClick={klik}
      className={cx('rounded-full border px-3 py-1.5 text-sm font-semibold', aktif ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft')}>{nilai}</button>
  )

  return (
    <>
      <Jendela terbuka={produk !== null} tutup={tutup} terkunci={simpan} judul={baru ? 'Tambah model barang' : p?.name ?? ''}
        kaki={ubahData
          ? <><Tombol ragam="hantu" disabled={simpan} onClick={() => (baru ? tutup() : setUbahData(false))}>Batal</Tombol><Tombol memuat={simpan} onClick={() => void simpanData()}>Simpan</Tombol></>
          : <><Tombol ragam="hantu" disabled={simpan} onClick={tutup}>Tutup</Tombol><Tombol memuat={simpan} onClick={() => void simpanStok()}>{arah === 'masuk' ? `Tambah ${jumlah} pcs` : `Kurangi ${jumlah} pcs`}</Tombol></>}>
        {ubahData ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Bidang label="Nama model" id="pr-nama" wajib><Isian id="pr-nama" value={isi.name} maxLength={80} placeholder="Contoh: Luxury Man 05" onChange={(e) => setIsi({ ...isi, name: e.target.value })} /></Bidang>
              <Bidang label="Kode" id="pr-kode" wajib bantuan="Singkat dan unik, contoh LX-M05."><Isian id="pr-kode" value={isi.code} maxLength={20} onChange={(e) => setIsi({ ...isi, code: e.target.value.toUpperCase() })} /></Bidang>
            </div>
            <div><p className="mb-2 text-sm font-semibold text-navy-900">Kelas</p><div className="flex flex-wrap gap-2">{KELAS.map((k) => pilihan(LABEL_KELAS[k], isi.class === k, () => setIsi({ ...isi, class: k })))}</div></div>
            <div><p className="mb-2 text-sm font-semibold text-navy-900">Jenis</p><div className="flex flex-wrap gap-2">{JENIS.map((j) => pilihan(j, isi.kind === j, () => setIsi({ ...isi, kind: j })))}</div></div>
            <div><p className="mb-2 text-sm font-semibold text-navy-900">Gender</p><div className="flex flex-wrap gap-2">
              {pilihan('LADY', isi.gender === 'LADY', () => setIsi({ ...isi, gender: 'LADY' }))}
              {pilihan('MAN', isi.gender === 'MAN', () => setIsi({ ...isi, gender: 'MAN' }))}
              {pilihan('Tanpa gender', isi.gender === '', () => setIsi({ ...isi, gender: '' }))}
            </div></div>
            <Bidang label="Harga jual (Rp)" id="pr-harga" bantuan="Tampil sebagai label harga di kartu. Boleh dikosongkan.">
              <Isian id="pr-harga" inputMode="numeric" value={isi.harga} placeholder="Contoh: 2.500.000" onChange={(e) => setIsi({ ...isi, harga: ketikRupiah(e.target.value) })} />
            </Bidang>
            <Bidang label="Catatan" id="pr-catatan"><Isian id="pr-catatan" value={isi.notes} maxLength={300} onChange={(e) => setIsi({ ...isi, notes: e.target.value })} /></Bidang>
          </div>
        ) : p && (
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-ice-200 bg-white">
                {src ? <img src={src} alt={p.name} className="h-full w-full object-contain p-1" /> : <div className="grid h-full place-items-center text-ink-muted"><PackageOpen className="h-8 w-8" /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-soft"><span className="kode-ids">{p.code}</span> · {LABEL_KELAS[p.class]} · {p.kind}{p.gender ? ` · ${p.gender}` : ''}</p>
                <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-navy-900">{formatAngka(p.stock)} <span className="text-lg">pcs</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tombol kecil ragam="kedua" onClick={() => setUbahData(true)}>Ubah data</Tombol>
                  <Tombol kecil ragam="kedua" ikon={<ImagePlus className="h-4 w-4" />} onClick={() => berkas.current?.click()}>Ganti foto</Tombol>
                  <Tombol kecil ragam="hantu" className="text-bad-700 hover:bg-bad-50" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setTanyaHapus(true)}>Hapus</Tombol>
                </div>
                <input ref={berkas} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void unggahFoto(f); e.target.value = '' }} />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gold-200 bg-gold-50/60 p-3">
              <label className="min-w-[10rem] flex-1 text-sm">
                <span className="mb-1 flex items-center gap-1.5 font-semibold text-navy-900"><Tag className="h-4 w-4 text-gold-600" /> Label harga</span>
                <span className="flex items-center rounded-xl border border-ice-300 bg-white pl-3 focus-within:border-gold-400 focus-within:ring-2 focus-within:ring-gold-300">
                  <span className="text-ink-muted">Rp</span>
                  <input inputMode="numeric" aria-label="Harga jual" value={harga} placeholder="belum diatur" onChange={(e) => setHarga(ketikRupiah(e.target.value))}
                    className="h-11 w-full rounded-xl bg-transparent px-2 font-semibold tabular-nums focus:outline-none" />
                </span>
              </label>
              <Tombol ragam="kedua" memuat={simpan} disabled={harga === (p.price != null ? ketikRupiah(String(Math.round(p.price))) : '')} onClick={() => void simpanHarga()}>Simpan harga</Tombol>
            </div>

            <div className="rounded-xl bg-ice-50 p-4">
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(['masuk', 'keluar'] as const).map((a) => (
                  <button key={a} type="button" aria-pressed={arah === a} onClick={() => setArah(a)}
                    className={cx('rounded-xl border-2 py-2 text-sm font-bold', arah === a ? (a === 'masuk' ? 'border-ok-600 bg-ok-50 text-ok-700' : 'border-bad-600 bg-bad-50 text-bad-700') : 'border-ice-200 bg-white text-ink-soft')}>
                    {a === 'masuk' ? 'Barang masuk (+)' : 'Barang keluar (−)'}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-4">
                <button type="button" aria-label="Kurangi jumlah" disabled={jumlah <= 1} onClick={() => setJumlah((j) => Math.max(1, j - 1))}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-ice-300 bg-white disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                <input inputMode="numeric" aria-label="Jumlah" value={jumlah} onChange={(e) => setJumlah(Math.max(1, Math.min(10000, Number(e.target.value.replace(/\D/g, '')) || 1)))}
                  className="h-12 w-24 rounded-xl border border-ice-300 bg-white text-center font-display text-2xl font-semibold tabular-nums" />
                <button type="button" aria-label="Tambah jumlah" onClick={() => setJumlah((j) => Math.min(10000, j + 1))}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-ice-300 bg-white"><Plus className="h-4 w-4" /></button>
              </div>
              <Isian className="mt-3" aria-label="Keterangan" placeholder={arah === 'masuk' ? 'Keterangan, misalnya: dari IDS 003' : 'Keterangan, misalnya: terjual / dikirim ke toko'}
                value={alasan} maxLength={200} onChange={(e) => setAlasan(e.target.value)} />
              {arah === 'keluar' && jumlah > p.stock && <p className="mt-2 text-sm font-semibold text-bad-700">Stok hanya {p.stock} pcs.</p>}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-navy-900">Riwayat stok</h3>
              {riwayat === null ? <p className="text-sm text-ink-muted">Memuat…</p> : riwayat.length === 0 ? <p className="text-sm text-ink-muted">Belum ada perubahan stok.</p> : (
                <ul className="max-h-48 divide-y divide-ice-200 overflow-y-auto rounded-xl border border-ice-200 text-sm">
                  {riwayat.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cx('w-12 font-bold tabular-nums', r.delta > 0 ? 'text-ok-700' : 'text-bad-700')}>{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate">{r.reason ?? '-'}</span><span className="block text-xs text-ink-muted">{formatTanggalWaktu(r.created_at, zona)}</span></span>
                      <span className="text-xs text-ink-soft">sisa {r.stock_after}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {galat && <p role="alert" className="mt-3 rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      </Jendela>

      <Konfirmasi
        terbuka={tanyaHapus}
        tutup={() => setTanyaHapus(false)}
        judul={`Hapus model ${p?.name ?? ''}?`}
        pesan={<p>Model ini pindah ke <strong className="text-navy-900">Sampah</strong> beserta catatan stoknya ({p?.stock ?? 0} pcs). Bisa dipulihkan selama 7 hari.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          if (!p) return
          const { error } = await db().rpc('hapus_produk', { p_id: p.id })
          if (error) throw error
          beri(`${p.name} dipindah ke Sampah.`)
          berubah()
          tutup()
        }}
      />
    </>
  )
}
