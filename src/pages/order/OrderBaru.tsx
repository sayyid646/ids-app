import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormProvider, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import { pesanGalat } from '../../lib/errors'
import { hariIni as tglHariIni, formatTanggal } from '../../lib/format'
import { BERAT_MINIMAL_BAWAAN, barangKosong, muatanOrder, skemaOrder, totalBarang, type DataOrder, type MasukanOrder } from '../../lib/orderSchema'
import { LABEL_STATUS_ORDER, type StatusOrder } from '../../lib/types'
import { useSinkron } from '../../sync/SyncProvider'
import { useMaster } from '../../sync/useMaster'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Bidang, Isian, IsianPanjang, Kartu, KepalaHalaman, KotakGalat, Pemuat, Tombol } from '../../components/ui/ui'
import { BidangBarang } from './BidangBarang'

interface OrderSama {
  id: string
  order_number: string
  customer_name: string | null
  quantity: number
  order_date: string | null
  order_status: StatusOrder
  cancelled: boolean
}

export async function cekNomor(nomor: string, kecuali?: string): Promise<OrderSama[]> {
  const { data, error } = await db().rpc('cek_nomor_order', { p_nomor: nomor, p_kecuali: kecuali ?? null })
  if (error) throw error
  return (data ?? []) as OrderSama[]
}

/** Kotak peringatan nomor order ganda, dengan jalan pintas ke order yang sudah ada. */
export function PeringatanGanda({ sama }: { sama: OrderSama[] }) {
  return (
    <div role="alert" className="rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm text-gold-700">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Nomor order ini sudah dipakai
      </p>
      {sama.map((o) => (
        <div key={o.id} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Order <strong>{o.order_number}</strong>{o.customer_name ? ` · ${o.customer_name}` : ''} · {o.quantity} barang · {formatTanggal(o.order_date)} ·{' '}
            {o.cancelled ? 'Dibatalkan' : LABEL_STATUS_ORDER[o.order_status]}
          </span>
          <span className="flex gap-2">
            <Link to={`/order/${o.id}`} className="font-semibold text-navy-900 underline">Buka</Link>
            {!o.cancelled && <Link to={`/order/${o.id}?tambah=1`} className="font-semibold text-navy-900 underline">Tambah barang ke order ini</Link>}
          </span>
        </div>
      ))}
      <p className="mt-2">Bila pelanggan memesan barang tambahan, masukkan ke order yang sama. Bila ini order lain, gunakan nomor berbeda.</p>
    </div>
  )
}

export function OrderBaru() {
  const { zona, pengaturan } = useSinkron()
  const minBerat = Number(pengaturan?.min_weight_grams) || BERAT_MINIMAL_BAWAAN
  const master = useMaster()
  const navigasi = useNavigate()
  const { beri } = useNotifikasi()
  const hariIni = tglHariIni(zona)
  const skema = useMemo(() => skemaOrder(hariIni, minBerat), [hariIni, minBerat])
  const [sama, setSama] = useState<OrderSama[]>([])
  const [galat, setGalat] = useState<string | null>(null)

  const form = useForm<MasukanOrder, unknown, DataOrder>({
    resolver: zodResolver(skema),
    defaultValues: { order_number: '', notes: '', items: [barangKosong(hariIni, minBerat)] },
  })
  const { register, handleSubmit, control, formState } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = useWatch({ control, name: 'items' }) ?? []
  const total = totalBarang(items)

  const periksaNomor = async (nomor: string) => {
    if (!nomor.trim()) {
      setSama([])
      return []
    }
    try {
      const r = await cekNomor(nomor)
      setSama(r)
      return r
    } catch {
      return []
    }
  }

  const simpan = handleSubmit(async (d) => {
    setGalat(null)
    const r = await periksaNomor(d.order_number)
    if (r.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    try {
      const { data, error } = await db().rpc('buat_order', { p: muatanOrder(d) })
      if (error) throw error
      beri(`Order ${d.order_number} tersimpan (${total} barang).`)
      navigasi(`/order/${data as string}`, { replace: true })
    } catch (e) {
      const pesan = pesanGalat(e)
      if (/sudah dipakai/i.test(pesan)) await periksaNomor(d.order_number)
      setGalat(pesan)
    }
  })

  if (master.memuat && !master.data) return <Pemuat />
  if (master.galat && !master.data) return <KotakGalat pesan={master.galat} ulangi={master.muatUlang} />
  const m = master.data!
  const e = formState.errors

  return (
    <>
      <Link to="/order" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Semua order
      </Link>
      <KepalaHalaman judul="Order baru" sub="Satu order bisa berisi satu atau beberapa barang." />

      <FormProvider {...form}>
        <form onSubmit={simpan} noValidate className="space-y-6">
          <Kartu className="space-y-4 p-5 sm:p-6">
            <h2 className="font-display text-2xl font-semibold text-navy-900">Data order</h2>
            {sama.length > 0 && <PeringatanGanda sama={sama} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <Bidang label="Nomor order" id="order_number" wajib galat={e.order_number?.message}>
                <Isian id="order_number" inputMode="text" autoComplete="off" placeholder="Contoh: 2574" salah={!!e.order_number || sama.length > 0}
                  {...register('order_number', { onBlur: (ev) => void periksaNomor(ev.target.value) })} />
              </Bidang>
              <Bidang label="Catatan order" id="notes" galat={e.notes?.message}>
                <IsianPanjang id="notes" rows={2} className="min-h-[44px]" {...register('notes')} />
              </Bidang>
            </div>
          </Kartu>

          {fields.map((f, i) => (
            <Kartu key={f.id} className="p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold text-navy-900">
                  {fields.length > 1 ? `Barang ${i + 1}` : 'Barang'}
                </h2>
                {fields.length > 1 && (
                  <Tombol kecil ragam="hantu" ikon={<Trash2 className="h-4 w-4" />} onClick={() => remove(i)}>Hapus</Tombol>
                )}
              </div>
              <BidangBarang awalan={`items.${i}.`} master={m} hariIni={hariIni} minBerat={minBerat} />
            </Kartu>
          ))}
          {e.items?.message && <p role="alert" className="text-sm text-bad-600">{e.items.message}</p>}

          <Tombol ragam="kedua" ikon={<Plus className="h-4 w-4" />} className="w-full sm:w-auto"
            onClick={() => append(barangKosong(items[items.length - 1]?.assigned_date || hariIni, minBerat))}>
            Tambah barang dengan pengrajin atau kategori lain
          </Tombol>

          {galat && <KotakGalat pesan={galat} />}

          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-ice-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:bottom-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-soft">
                Total <strong className="text-lg text-navy-900">{total}</strong> barang
              </p>
              <div className="flex gap-2">
                <Link to="/order" className="inline-flex h-11 items-center rounded-xl px-4 text-[15px] font-semibold text-navy-800 hover:bg-ice-100">Batal</Link>
                <Tombol type="submit" memuat={formState.isSubmitting}>Simpan order</Tombol>
              </div>
            </div>
          </div>
        </form>
      </FormProvider>
    </>
  )
}
