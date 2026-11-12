import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db } from '../../lib/supabase'
import { pesanGalat } from '../../lib/errors'
import { BERAT_MINIMAL_BAWAAN, muatanBarang, skemaBarang, type DataBarang, type MasukanBarang } from '../../lib/orderSchema'
import type { Barang, OrderRingkas, Pengaturan, StatusBarang } from '../../lib/types'
import { LABEL_STATUS } from '../../lib/types'
import { tampilkanWa, tautanWa } from '../../lib/wa'
import { isiTemplate, jenisPesanUntuk, templateDari, type JenisPesan } from '../../lib/waTemplate'
import { formatTanggalPanjang, formatTanggalWaktu, isoKeLokal, lokalKeIso, tglLokal } from '../../lib/format'
import type { DataMaster } from '../../sync/useMaster'
import { Jendela } from '../../components/ui/Dialog'
import { useSinkron } from '../../sync/SyncProvider'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Bidang, Isian, IsianPanjang, Tombol, cx } from '../../components/ui/ui'
import { BidangBarang } from './BidangBarang'
import { cekNomor, PeringatanGanda } from './OrderBaru'

// ------------------------------------------------------------ ubah order
const skemaUbahOrder = z.object({
  order_number: z.string().trim().min(1, 'Nomor order wajib diisi').max(30, 'Maksimal 30 karakter'),
  notes: z.string().max(1000).optional().transform((v) => (v && v.trim() !== '' ? v.trim() : null)),
})
type MasukanUbahOrder = z.input<typeof skemaUbahOrder>
type DataUbahOrder = z.output<typeof skemaUbahOrder>

export function DialogUbahOrder({ order, terbuka, tutup, berubah }: { order: OrderRingkas; terbuka: boolean; tutup: () => void; berubah: () => void }) {
  const { beri } = useNotifikasi()
  const [galat, setGalat] = useState<string | null>(null)
  const [sama, setSama] = useState<Awaited<ReturnType<typeof cekNomor>>>([])
  const awal = (): MasukanUbahOrder => ({
    order_number: order.order_number,
    notes: order.notes ?? '',
  })
  const { register, handleSubmit, formState, reset } = useForm<MasukanUbahOrder, unknown, DataUbahOrder>({
    resolver: zodResolver(skemaUbahOrder),
    defaultValues: awal(),
  })
  useEffect(() => {
    if (terbuka) {
      reset(awal())
      setGalat(null)
      setSama([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terbuka])

  const simpan = handleSubmit(async (d) => {
    setGalat(null)
    try {
      const r = await cekNomor(d.order_number, order.id)
      setSama(r)
      if (r.length > 0) return
      const { error } = await db()
        .from('orders')
        .update({ order_number: d.order_number, notes: d.notes })
        .eq('id', order.id)
      if (error) throw error
      beri('Data order disimpan.')
      berubah()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    }
  })
  const e = formState.errors
  return (
    <Jendela terbuka={terbuka} tutup={tutup} terkunci={formState.isSubmitting} judul={`Ubah order ${order.order_number}`}
      kaki={<><Tombol ragam="hantu" onClick={tutup} disabled={formState.isSubmitting}>Batal</Tombol><Tombol type="submit" form="form-ubah-order" memuat={formState.isSubmitting}>Simpan</Tombol></>}>
      <form id="form-ubah-order" onSubmit={simpan} noValidate className="space-y-4">
        {sama.length > 0 && <PeringatanGanda sama={sama} />}
        <Bidang label="Nomor order" id="uo-nomor" wajib galat={e.order_number?.message}>
          <Isian id="uo-nomor" salah={!!e.order_number} {...register('order_number')} />
        </Bidang>
        <Bidang label="Catatan order" id="uo-catatan">
          <IsianPanjang id="uo-catatan" rows={2} {...register('notes')} />
        </Bidang>
        {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      </form>
    </Jendela>
  )
}

// -------------------------------------------- tambah / ubah satu barang
export function DialogBarang({
  terbuka, tutup, berubah, master, hariIni, orderId, barang,
}: {
  terbuka: boolean
  tutup: () => void
  berubah: () => void
  master: DataMaster
  hariIni: string
  orderId: string
  /** Kosong = tambah barang baru ke order. */
  barang: Barang | null
}) {
  const { beri } = useNotifikasi()
  const [galat, setGalat] = useState<string | null>(null)
  const { pengaturan } = useSinkron()
  const minBerat = Number(pengaturan?.min_weight_grams) || BERAT_MINIMAL_BAWAAN
  // Barang lama yang beratnya di bawah minimal baru tetap boleh disimpan selama beratnya tidak diubah.
  const minSkema = barang?.weight_grams != null ? Math.min(minBerat, Number(barang.weight_grams)) : minBerat
  const skema = useMemo(() => skemaBarang(hariIni, minSkema), [hariIni, minSkema])
  const ubah = barang !== null
  const awal = (): MasukanBarang =>
    barang
      ? {
          craftsman_id: barang.craftsman_id, category_id: barang.category_id, gender: barang.gender, quantity: 1,
          weight_grams: barang.weight_grams ?? minBerat,
          assigned_date: barang.assigned_date,
          production_month: barang.production_month_manual ? barang.production_month.slice(0, 7) : '',
          production_start_date: barang.production_start_date ?? '', description: barang.description ?? '', notes: barang.notes ?? '',
        }
      : { craftsman_id: '', category_id: '', gender: undefined as unknown as 'LADY', weight_grams: minBerat, quantity: 1, assigned_date: hariIni, production_month: '', production_start_date: '', description: '', notes: '' }
  const form = useForm<MasukanBarang, unknown, DataBarang>({ resolver: zodResolver(skema), defaultValues: awal() })
  useEffect(() => {
    if (terbuka) {
      form.reset(awal())
      setGalat(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terbuka, barang?.id])

  const simpan = form.handleSubmit(async (d) => {
    setGalat(null)
    try {
      if (!barang) {
        const { data, error } = await db().rpc('tambah_barang', { p_order: orderId, p_item: muatanBarang(d) })
        if (error) throw error
        beri(`${data as number} barang ditambahkan.`)
      } else {
        const ubahan: Record<string, unknown> = {
          craftsman_id: d.craftsman_id, category_id: d.category_id, gender: d.gender, weight_grams: d.weight_grams,
          assigned_date: d.assigned_date, production_start_date: d.production_start_date || null,
          description: d.description, notes: d.notes,
        }
        // Bulan produksi: manual bila diisi; bila koreksi dimatikan, kembali otomatis.
        if (d.production_month) ubahan.production_month = `${d.production_month}-01`
        else if (barang.production_month_manual) ubahan.production_month = `${d.assigned_date.slice(0, 7)}-01`
        const { error } = await db().from('order_items').update(ubahan).eq('id', barang.id)
        if (error) throw error
        beri(`Barang #${barang.item_no} disimpan.`)
      }
      berubah()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    }
  })
  return (
    <Jendela terbuka={terbuka} tutup={tutup} lebar="lg" terkunci={form.formState.isSubmitting}
      judul={ubah ? `Ubah barang #${barang.item_no}` : 'Tambah barang ke order'}
      kaki={<><Tombol ragam="hantu" onClick={tutup} disabled={form.formState.isSubmitting}>Batal</Tombol><Tombol type="submit" form="form-barang" memuat={form.formState.isSubmitting}>Simpan</Tombol></>}>
      <FormProvider {...form}>
        <form id="form-barang" onSubmit={simpan} noValidate className="space-y-4">
          <BidangBarang awalan="" master={master} hariIni={hariIni} tampilJumlah={!ubah} minBerat={minSkema} />
          {ubah && <p className="text-xs text-ink-muted">Status dan tanggal selesai/serah diubah lewat tombol status.</p>}
          {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
        </form>
      </FormProvider>
    </Jendela>
  )
}

// ---------------------------------------------------------- ubah status
const PENJELASAN: Record<StatusBarang, string> = {
  dalam_proses: 'Barang sedang dikerjakan pengrajin. Tanggal selesai dan tanggal serah dikosongkan.',
  selesai: 'Pengrajin sudah selesai mengerjakan. Tanggal selesai dicatat. Barang BELUM diserahkan ke pembeli.',
  diserahkan: 'Barang sudah diterima pembeli. Tanggal serah dicatat.',
}

/** Mengubah status satu atau beberapa barang, dengan pilihan waktu sekarang atau waktu lain. */
export function DialogStatus({
  barang, tutup, berubah, zona,
}: {
  barang: Barang[] | null
  tutup: () => void
  berubah: () => void
  zona: string
}) {
  const { beri } = useNotifikasi()
  const [status, setStatus] = useState<StatusBarang>('selesai')
  const [pakaiWaktuLain, setPakaiWaktuLain] = useState(false)
  const [waktu, setWaktu] = useState('')
  const [proses, setProses] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  const terbuka = barang !== null && barang.length > 0

  useEffect(() => {
    if (!terbuka || !barang) return
    // Usulkan status berikutnya dari status barang pertama.
    const s = barang[0].status
    setStatus(s === 'dalam_proses' ? 'selesai' : s === 'selesai' ? 'diserahkan' : 'diserahkan')
    setPakaiWaktuLain(false)
    setWaktu('')
    setGalat(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terbuka])

  if (!barang) return null
  const satu = barang.length === 1
  const simpan = async () => {
    setGalat(null)
    if (pakaiWaktuLain && status !== 'dalam_proses') {
      if (!waktu) { setGalat('Isi tanggal dan jam.'); return }
      const iso = lokalKeIso(waktu, zona)
      if (!iso) { setGalat('Isi tanggal dan jam dengan lengkap.'); return }
      if (new Date(iso).getTime() > Date.now() + 5 * 60_000) { setGalat('Waktu tidak boleh di masa depan.'); return }
      const tgl = tglLokal(iso, zona)
      const lebihAwal = barang.find((b) => tgl < b.assigned_date)
      if (lebihAwal) { setGalat(`Waktu itu sebelum tanggal barang #${lebihAwal.item_no} diberikan ke pengrajin.`); return }
    }
    setProses(true)
    try {
      const { data, error } = await db().rpc('ubah_status', {
        p_items: barang.map((b) => b.id),
        p_status: status,
        p_waktu: pakaiWaktuLain && status !== 'dalam_proses' ? lokalKeIso(waktu, zona) : null,
      })
      if (error) throw error
      const n = Number(data ?? 0)
      beri(n > 0 ? `${n} barang: ${LABEL_STATUS[status]}.` : 'Tidak ada yang berubah, status sudah sama.', n > 0 ? 'berhasil' : 'info')
      berubah()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setProses(false)
    }
  }

  return (
    <Jendela terbuka={terbuka} tutup={tutup} terkunci={proses}
      judul={satu ? `Status barang #${barang[0].item_no}` : `Status ${barang.length} barang`}
      kaki={<><Tombol ragam="hantu" onClick={tutup} disabled={proses}>Batal</Tombol><Tombol onClick={simpan} memuat={proses}>Simpan status</Tombol></>}>
      <div className="space-y-4">
        {satu && (
          <p className="text-sm text-ink-soft">
            Sekarang: <strong className="text-navy-900">{LABEL_STATUS[barang[0].status]}</strong>
            {barang[0].completed_at && <> · selesai {formatTanggalWaktu(barang[0].completed_at, zona)}</>}
            {barang[0].delivered_at && <> · diserahkan {formatTanggalWaktu(barang[0].delivered_at, zona)}</>}
          </p>
        )}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-navy-900">Ubah menjadi</legend>
          {(['dalam_proses', 'selesai', 'diserahkan'] as StatusBarang[]).map((s) => (
            <label key={s} className={cx('flex cursor-pointer gap-3 rounded-xl border p-3', status === s ? 'border-gold-400 bg-gold-50' : 'border-ice-300 bg-white')}>
              <input type="radio" name="status" className="mt-1 h-4 w-4 accent-navy-900" checked={status === s} onChange={() => setStatus(s)} />
              <span>
                <span className="block font-semibold text-navy-900">{LABEL_STATUS[s]}</span>
                <span className="block text-sm text-ink-soft">{PENJELASAN[s]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {status !== 'dalam_proses' && (
          <div className="rounded-xl bg-ice-50 p-3">
            <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={pakaiWaktuLain} onChange={(e) => setPakaiWaktuLain(e.target.checked)} />
              Bukan sekarang, isi tanggal dan jam yang sebenarnya
            </label>
            {pakaiWaktuLain && (
              <div className="mt-2 max-w-xs">
                <Isian type="datetime-local" aria-label="Tanggal dan jam" value={waktu} onChange={(e) => setWaktu(e.target.value)} />
              </div>
            )}
          </div>
        )}
        {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      </div>
    </Jendela>
  )
}

// ------------------------------------------------------------- batalkan
export function DialogBatal({
  judul, pesan, terbuka, tutup, jalankan,
}: {
  judul: string
  pesan: string
  terbuka: boolean
  tutup: () => void
  jalankan: (alasan: string) => Promise<void>
}) {
  const [alasan, setAlasan] = useState('')
  const [proses, setProses] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  useEffect(() => {
    if (terbuka) { setAlasan(''); setGalat(null) }
  }, [terbuka])
  const ya = async () => {
    if (!alasan.trim()) { setGalat('Tulis alasan pembatalan.'); return }
    setProses(true)
    setGalat(null)
    try {
      await jalankan(alasan.trim())
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setProses(false)
    }
  }
  return (
    <Jendela terbuka={terbuka} tutup={tutup} lebar="sm" terkunci={proses} judul={judul}
      kaki={<><Tombol ragam="hantu" onClick={tutup} disabled={proses}>Kembali</Tombol><Tombol ragam="bahaya" onClick={ya} memuat={proses}>Batalkan</Tombol></>}>
      <div className="space-y-3">
        <p className="text-[15px] text-ink-soft">{pesan}</p>
        <Bidang label="Alasan" id="alasan-batal" wajib galat={galat ?? undefined}>
          <IsianPanjang id="alasan-batal" rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: pembeli membatalkan pesanan" />
        </Bidang>
      </div>
    </Jendela>
  )
}

// ------------------------------------------------------ koreksi tanggal
/** Koreksi tanggal selesai dan tanggal serah tanpa mengubah status. Tercatat di riwayat. */
export function DialogKoreksiTanggal({ barang, tutup, berubah, zona }: { barang: Barang | null; tutup: () => void; berubah: () => void; zona: string }) {
  const { beri } = useNotifikasi()
  const [selesai, setSelesai] = useState('')
  const [serah, setSerah] = useState('')
  const [proses, setProses] = useState(false)
  const [galat, setGalat] = useState<string | null>(null)
  useEffect(() => {
    if (!barang) return
    setSelesai(isoKeLokal(barang.completed_at, zona))
    setSerah(isoKeLokal(barang.delivered_at, zona))
    setGalat(null)
  }, [barang, zona])
  if (!barang) return null
  const adaSerah = barang.status === 'diserahkan'
  const simpan = async () => {
    setGalat(null)
    const isoSelesai = lokalKeIso(selesai, zona)
    const isoSerah = adaSerah ? lokalKeIso(serah, zona) : null
    if (!isoSelesai || (adaSerah && !isoSerah)) { setGalat('Isi tanggal dan jam dengan lengkap.'); return }
    if (tglLokal(isoSelesai, zona) < barang.assigned_date) { setGalat('Tanggal selesai tidak boleh sebelum tanggal diberikan ke pengrajin.'); return }
    if (isoSerah && isoSerah < isoSelesai) { setGalat('Tanggal diserahkan tidak boleh sebelum tanggal selesai dikerjakan.'); return }
    const ubahan: Record<string, string> = {}
    if (isoSelesai !== (barang.completed_at && new Date(barang.completed_at).toISOString())) ubahan.completed_at = isoSelesai
    if (isoSerah && isoSerah !== (barang.delivered_at && new Date(barang.delivered_at).toISOString())) ubahan.delivered_at = isoSerah
    if (!Object.keys(ubahan).length) { tutup(); return }
    setProses(true)
    try {
      const { error } = await db().from('order_items').update(ubahan).eq('id', barang.id)
      if (error) throw error
      beri('Tanggal dikoreksi dan dicatat di riwayat.')
      berubah()
      tutup()
    } catch (e) {
      setGalat(pesanGalat(e))
    } finally {
      setProses(false)
    }
  }
  return (
    <Jendela terbuka tutup={tutup} terkunci={proses} judul={`Koreksi tanggal barang #${barang.item_no}`}
      kaki={<><Tombol ragam="hantu" onClick={tutup} disabled={proses}>Batal</Tombol><Tombol onClick={simpan} memuat={proses}>Simpan koreksi</Tombol></>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">Diberikan ke pengrajin {formatTanggalPanjang(barang.assigned_date)}. Setiap koreksi tercatat di riwayat beserta nilai lamanya.</p>
        <Bidang label="Selesai dikerjakan (tanggal dan jam)" id="k-selesai">
          <Isian id="k-selesai" type="datetime-local" value={selesai} onChange={(e) => setSelesai(e.target.value)} />
        </Bidang>
        {adaSerah && (
          <Bidang label="Diserahkan ke pembeli (tanggal dan jam)" id="k-serah">
            <Isian id="k-serah" type="datetime-local" value={serah} onChange={(e) => setSerah(e.target.value)} />
          </Bidang>
        )}
        {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      </div>
    </Jendela>
  )
}

// ------------------------------------------------------------- WhatsApp
/** Pesan WhatsApp yang bisa diubah dulu sebelum dikirim. Tidak ada yang terkirim tanpa admin menekan tombol. */
export function DialogWhatsApp({ order, barang, terbuka, tutup, zona, pengaturan }: {
  order: OrderRingkas; barang: Barang[]; terbuka: boolean; tutup: () => void; zona: string; pengaturan: Pengaturan | null
}) {
  const [jenis, setJenis] = useState<JenisPesan>(jenisPesanUntuk(order.order_status))
  const [pesan, setPesan] = useState('')
  const isi = useMemo(() => {
    const kategori = [...new Set(barang.map((b) => b.category_name))].join(', ') || '-'
    const tSelesai = barang.reduce<string | null>((m, b) => (b.completed_at && (!m || b.completed_at > m) ? b.completed_at : m), null)
    const tSerah = barang.reduce<string | null>((m, b) => (b.delivered_at && (!m || b.delivered_at > m) ? b.delivered_at : m), null)
    return {
      nama: order.customer_name ?? 'Bapak/Ibu', nomor_order: order.order_number, kategori, jumlah: String(barang.length),
      tanggal_selesai: tSelesai ? formatTanggalPanjang(tglLokal(tSelesai, zona)) : '-',
      tanggal_serah: tSerah ? formatTanggalPanjang(tglLokal(tSerah, zona)) : '-',
      nama_usaha: pengaturan?.business_name ?? 'Intan Dua Saudara',
    }
  }, [order, barang, zona, pengaturan])
  useEffect(() => {
    if (terbuka) setJenis(jenisPesanUntuk(order.order_status))
  }, [terbuka, order.order_status])
  useEffect(() => {
    if (terbuka) setPesan(isiTemplate(templateDari(pengaturan, jenis), isi))
  }, [terbuka, jenis, isi, pengaturan])

  const nomor = order.customer_whatsapp
  return (
    <Jendela terbuka={terbuka} tutup={tutup} judul="Kirim via WhatsApp"
      kaki={<>
        <Tombol ragam="hantu" onClick={tutup}>Batal</Tombol>
        {pesan.trim() ? (
          <a href={nomor ? tautanWa(nomor, pesan) : `https://wa.me/?text=${encodeURIComponent(pesan)}`} target="_blank" rel="noopener noreferrer" onClick={tutup}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1E8E4E] px-5 text-[15px] font-semibold text-white hover:bg-[#177540]">
            Buka WhatsApp
          </a>
        ) : null}
      </>}>
      {(
        <div className="space-y-4">
          {nomor
            ? <p className="text-sm text-ink-soft">Ke <strong className="text-navy-900">{order.customer_name ?? 'pelanggan'}</strong> · {tampilkanWa(nomor)}</p>
            : <p className="text-sm text-ink-soft">Setelah WhatsApp terbuka, pilih kontak tujuan pesan ini.</p>}
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jenis pesan">
            {(['proses', 'selesai', 'diserahkan'] as JenisPesan[]).map((j) => (
              <button key={j} type="button" aria-pressed={jenis === j} onClick={() => setJenis(j)}
                className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', jenis === j ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft')}>
                {j === 'proses' ? 'Dalam proses' : j === 'selesai' ? 'Selesai dikerjakan' : 'Sudah diserahkan'}
              </button>
            ))}
          </div>
          <Bidang label="Pesan (bisa diubah)" id="wa-pesan">
            <IsianPanjang id="wa-pesan" rows={11} value={pesan} onChange={(e) => setPesan(e.target.value)} />
          </Bidang>
          <p className="text-xs text-ink-muted">WhatsApp akan terbuka dengan pesan ini. Pesan baru terkirim setelah Anda menekan kirim di WhatsApp.</p>
        </div>
      )}
    </Jendela>
  )
}
