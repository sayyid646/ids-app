import { useEffect, useMemo, useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { db } from '../../lib/supabase'
import { pesanGalat } from '../../lib/errors'
import { muatanBarang, skemaBarang, type DataBarang, type MasukanBarang } from '../../lib/orderSchema'
import type { Barang, OrderRingkas, StatusBarang } from '../../lib/types'
import { LABEL_STATUS } from '../../lib/types'
import { normalisasiWa, tampilkanWa, waValid } from '../../lib/wa'
import { formatTanggalWaktu, tglLokal } from '../../lib/format'
import type { DataMaster } from '../../sync/useMaster'
import { Jendela } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Bidang, Isian, IsianPanjang, Tombol, cx } from '../../components/ui/ui'
import { BidangBarang } from './BidangBarang'
import { cekNomor, PeringatanGanda } from './OrderBaru'

// ------------------------------------------------------------ ubah order
const skemaUbahOrder = z.object({
  order_number: z.string().trim().min(1, 'Nomor order wajib diisi').max(30, 'Maksimal 30 karakter'),
  customer_name: z.string().trim().min(1, 'Nama pelanggan wajib diisi').max(100, 'Maksimal 100 karakter'),
  customer_whatsapp: z
    .string()
    .optional()
    .refine((v) => !v || v.trim() === '' || waValid(v), 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890')
    .transform((v) => (v && v.trim() !== '' ? normalisasiWa(v) : null)),
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
    customer_name: order.customer_name,
    customer_whatsapp: order.customer_whatsapp ? tampilkanWa(order.customer_whatsapp) : '',
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
        .update({ order_number: d.order_number, customer_name: d.customer_name.replace(/\s+/g, ' '), customer_whatsapp: d.customer_whatsapp, notes: d.notes })
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
        <Bidang label="Nama pelanggan" id="uo-nama" wajib galat={e.customer_name?.message}>
          <Isian id="uo-nama" salah={!!e.customer_name} {...register('customer_name')} />
        </Bidang>
        <Bidang label="WhatsApp pelanggan" id="uo-wa" galat={e.customer_whatsapp?.message}>
          <Isian id="uo-wa" type="tel" inputMode="tel" salah={!!e.customer_whatsapp} {...register('customer_whatsapp')} />
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
  const skema = useMemo(() => skemaBarang(hariIni), [hariIni])
  const ubah = barang !== null
  const awal = (): MasukanBarang =>
    barang
      ? {
          craftsman_id: barang.craftsman_id, category_id: barang.category_id, gender: barang.gender, quantity: 1,
          assigned_date: barang.assigned_date,
          production_month: barang.production_month_manual ? barang.production_month.slice(0, 7) : '',
          production_start_date: barang.production_start_date ?? '', description: barang.description ?? '', notes: barang.notes ?? '',
        }
      : { craftsman_id: '', category_id: '', gender: undefined as unknown as 'LADY', quantity: 1, assigned_date: hariIni, production_month: '', production_start_date: '', description: '', notes: '' }
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
          craftsman_id: d.craftsman_id, category_id: d.category_id, gender: d.gender,
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
          <BidangBarang awalan="" master={master} hariIni={hariIni} tampilJumlah={!ubah} />
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
      if (new Date(waktu).getTime() > Date.now() + 5 * 60_000) { setGalat('Waktu tidak boleh di masa depan.'); return }
      const tgl = tglLokal(new Date(waktu), zona)
      const lebihAwal = barang.find((b) => tgl < b.assigned_date)
      if (lebihAwal) { setGalat(`Waktu itu sebelum tanggal barang #${lebihAwal.item_no} diberikan ke pengrajin.`); return }
    }
    setProses(true)
    try {
      const { data, error } = await db().rpc('ubah_status', {
        p_items: barang.map((b) => b.id),
        p_status: status,
        p_waktu: pakaiWaktuLain && status !== 'dalam_proses' ? new Date(waktu).toISOString() : null,
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
