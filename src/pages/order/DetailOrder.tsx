import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Ban, CalendarClock, CheckCheck, MessageCircle, Pencil, Phone, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react'
import { db } from '../../lib/supabase'
import type { Barang, OrderRingkas, Riwayat } from '../../lib/types'
import { formatBulan, formatTanggal, formatTanggalWaktu, hariIni as tglHariIni } from '../../lib/format'
import { tampilkanWa } from '../../lib/wa'
import { useMuat } from '../../sync/useMuat'
import { useSinkron, useVersiData } from '../../sync/SyncProvider'
import { useMaster } from '../../sync/useMaster'
import { DaftarRiwayat } from '../../components/DaftarRiwayat'
import { Konfirmasi } from '../../components/ui/Dialog'
import { useNotifikasi } from '../../components/ui/Notifikasi'
import { Kartu, KodePengrajin, Kosong, KotakGalat, LencanaStatus, NamaPengrajin, Pemuat, Tombol, cx } from '../../components/ui/ui'
import { LencanaOrder } from './DaftarOrder'
import { DialogBarang, DialogBatal, DialogKoreksiTanggal, DialogStatus, DialogUbahOrder, DialogWhatsApp } from './DialogOrder'

export function DetailOrder() {
  const { id = '' } = useParams()
  const [param, setParam] = useSearchParams()
  const { zona, pengaturan } = useSinkron()
  const { beri } = useNotifikasi()
  const master = useMaster()
  const versi = useVersiData(['orders', 'order_items', 'craftsmen', 'jewelry_categories'])
  const versiLog = useVersiData(['activity_logs'])
  const hariIni = tglHariIni(zona)

  const [ubahOrder, setUbahOrder] = useState(false)
  const [dialogBarang, setDialogBarang] = useState<{ buka: boolean; barang: Barang | null }>({ buka: false, barang: null })
  const [statusUntuk, setStatusUntuk] = useState<Barang[] | null>(null)
  const [batalOrder, setBatalOrder] = useState(false)
  const [pulihkan, setPulihkan] = useState(false)
  const [batalBarang, setBatalBarang] = useState<Barang | null>(null)
  const [tampilBatal, setTampilBatal] = useState(false)
  const [koreksi, setKoreksi] = useState<Barang | null>(null)
  const [wa, setWa] = useState(false)
  const [hapusOrder, setHapusOrder] = useState(false)
  const [hapusBarang, setHapusBarang] = useState<Barang | null>(null)
  const navigasi = useNavigate()

  const data = useMuat(async () => {
    const [o, b] = await Promise.all([
      db().from('v_orders').select('*').eq('id', id).maybeSingle(),
      db().from('v_items').select('*').eq('order_id', id).order('item_no'),
    ])
    if (o.error) throw o.error
    if (b.error) throw b.error
    return { order: o.data as OrderRingkas | null, barang: (b.data ?? []) as Barang[] }
  }, [id, versi])

  const riwayat = useMuat(async () => {
    const { data, error } = await db()
      .from('activity_logs')
      .select('id, created_at, actor_email, action, entity_type, order_number, old_value, new_value, note')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw error
    return (data ?? []) as Riwayat[]
  }, [id, versiLog])

  // Dari peringatan nomor ganda: ?tambah=1 langsung membuka formulir tambah barang.
  useEffect(() => {
    if (param.get('tambah') === '1' && data.data?.order && !data.data.order.cancelled_at && master.data) {
      setDialogBarang({ buka: true, barang: null })
      param.delete('tambah')
      setParam(param, { replace: true })
    }
  }, [param, setParam, data.data, master.data])

  if ((data.memuat && !data.data) || (master.memuat && !master.data)) return <Pemuat />
  if (data.galat && !data.data) return <KotakGalat pesan={data.galat} ulangi={data.muatUlang} />
  if (master.galat && !master.data) return <KotakGalat pesan={master.galat} ulangi={master.muatUlang} />
  const o = data.data?.order
  if (!o) {
    return <Kosong judul="Order tidak ditemukan" isi="Mungkin tautannya salah." aksi={<Link to="/order" className="font-semibold text-gold-600">Kembali ke daftar order</Link>} />
  }
  const semua = data.data!.barang
  const aktif = semua.filter((b) => b.is_active)
  const tampil = tampilBatal ? semua : aktif
  const jumlahBatal = semua.length - aktif.length
  const batal = o.cancelled_at !== null
  const muatUlang = data.muatUlang

  return (
    <>
      <Link to="/order" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Semua order
      </Link>

      <Kartu className="relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-gold-200" aria-hidden />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.2em] text-gold-600">NOMOR ORDER</span>
              <LencanaOrder status={o.order_status} />
            </div>
            <h1 className="mt-1 font-display text-5xl font-semibold leading-none text-navy-900">{o.order_number}</h1>
            <p className="mt-3 text-lg font-semibold text-navy-900">{o.customer_name}</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
              {o.customer_whatsapp && <span className="inline-flex items-center gap-1.5"><Phone className="h-4 w-4" aria-hidden />{tampilkanWa(o.customer_whatsapp)}</span>}
              <span>Diterima {formatTanggal(o.order_date)}</span>
              <span>{o.quantity} barang</span>
            </div>
            {o.notes && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm text-ink-soft">{o.notes}</p>}
            {batal && (
              <p className="mt-3 rounded-xl bg-bad-50 px-3 py-2 text-sm text-bad-700">
                Dibatalkan {formatTanggalWaktu(o.cancelled_at, zona)}{o.cancel_reason ? ` · ${o.cancel_reason}` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!batal && (
              <>
                <Tombol ragam="kedua" ikon={<Pencil className="h-4 w-4" />} onClick={() => setUbahOrder(true)}>Ubah order</Tombol>
                <Tombol ragam="kedua" ikon={<Plus className="h-4 w-4" />} onClick={() => setDialogBarang({ buka: true, barang: null })}>Tambah barang</Tombol>
                {aktif.length > 1 && (
                  <Tombol ikon={<CheckCheck className="h-4 w-4" />} onClick={() => setStatusUntuk(aktif)}>Status semua barang</Tombol>
                )}
                <Tombol ragam="hantu" ikon={<Ban className="h-4 w-4" />} onClick={() => setBatalOrder(true)}>Batalkan order</Tombol>
              </>
            )}
            {batal && <Tombol ikon={<RotateCcw className="h-4 w-4" />} onClick={() => setPulihkan(true)}>Pulihkan order</Tombol>}
            <Tombol ragam="hantu" className="text-bad-700 hover:bg-bad-50" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setHapusOrder(true)}>Hapus order</Tombol>
          </div>
        </div>
        {!batal && aktif.length > 0 && (
          <div className="relative mt-5 flex flex-wrap gap-2 border-t border-ice-200 pt-4">
            <Tombol kecil ragam="kedua" ikon={<MessageCircle className="h-4 w-4 text-[#1E8E4E]" />} onClick={() => setWa(true)}>Kirim via WhatsApp</Tombol>
            <Link to={`/cetak/pengrajin/${o.id}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-gold-300 bg-white px-3 text-sm font-semibold text-navy-900 hover:bg-gold-50">
              <Printer className="h-4 w-4" /> Nota pengrajin
            </Link>
            <Link to={`/cetak/serah/${o.id}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-gold-300 bg-white px-3 text-sm font-semibold text-navy-900 hover:bg-gold-50">
              <Printer className="h-4 w-4" /> Nota serah terima
            </Link>
          </div>
        )}
      </Kartu>

      <section className="mt-8" aria-labelledby="judul-barang">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="judul-barang" className="font-display text-2xl font-semibold text-navy-900">Barang</h2>
          {jumlahBatal > 0 && (
            <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="h-4 w-4 accent-navy-900" checked={tampilBatal} onChange={(e) => setTampilBatal(e.target.checked)} />
              Tampilkan {jumlahBatal} barang yang dibatalkan
            </label>
          )}
        </div>
        {tampil.length === 0 ? (
          <div className="mt-3"><Kosong judul="Tidak ada barang aktif" isi="Tambahkan barang ke order ini." /></div>
        ) : (
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {tampil.map((b) => (
              <li key={b.id}>
                <Kartu className={cx('flex h-full flex-col p-5', !b.is_active && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-[0.15em] text-ink-muted">BARANG #{b.item_no}</p>
                      <p className="mt-1 font-display text-2xl font-semibold text-navy-900">{b.category_name} <span className="text-base font-sans font-bold text-gold-600">{b.gender}</span></p>
                    </div>
                    <LencanaStatus status={b.status} batal={!b.is_active} />
                  </div>
                  <Link to={`/pengrajin/${b.craftsman_id}`} className="mt-2 inline-flex items-center gap-2 text-sm hover:underline">
                    <KodePengrajin kode={b.craftsman_code} /><NamaPengrajin nama={b.craftsman_name} className="font-semibold text-navy-900" />
                  </Link>
                  {b.description && <p className="mt-2 text-sm text-ink-soft">{b.description}</p>}
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-ice-50 p-3 text-sm sm:grid-cols-3">
                    <div><dt className="text-xs text-ink-muted">Diberikan ke pengrajin</dt><dd className="font-semibold text-navy-900">{formatTanggal(b.assigned_date)}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Bulan produksi</dt><dd className="font-semibold text-navy-900">{formatBulan(b.production_month)}{b.production_month_manual && <span className="text-xs font-normal text-ink-muted"> (manual)</span>}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Mulai produksi</dt><dd className="font-semibold text-navy-900">{formatTanggal(b.production_start_date)}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Selesai dikerjakan</dt><dd className="font-semibold text-navy-900">{formatTanggalWaktu(b.completed_at, zona)}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Diserahkan ke pembeli</dt><dd className="font-semibold text-navy-900">{formatTanggalWaktu(b.delivered_at, zona)}</dd></div>
                  </dl>
                  {b.notes && <p className="mt-2 text-xs text-ink-soft">Catatan: {b.notes}</p>}
                  {!b.is_active && b.cancelled_at && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-xs text-bad-700">Barang dibatalkan {formatTanggalWaktu(b.cancelled_at, zona)}{b.cancel_reason ? ` · ${b.cancel_reason}` : ''}</p>
                      {!batal && <Tombol kecil ragam="hantu" className="ml-auto text-bad-700 hover:bg-bad-50" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setHapusBarang(b)}>Hapus</Tombol>}
                    </div>
                  )}
                  {b.is_active && (
                    <div className="mt-4 flex flex-wrap gap-2 pt-1">
                      <Tombol kecil onClick={() => setStatusUntuk([b])}>Ubah status</Tombol>
                      <Tombol kecil ragam="kedua" ikon={<Pencil className="h-4 w-4" />} onClick={() => setDialogBarang({ buka: true, barang: b })}>Ubah</Tombol>
                      {b.status !== 'dalam_proses' && (
                        <Tombol kecil ragam="kedua" ikon={<CalendarClock className="h-4 w-4" />} onClick={() => setKoreksi(b)}>Koreksi tanggal</Tombol>
                      )}
                      <Tombol kecil ragam="hantu" className="ml-auto" onClick={() => setBatalBarang(b)}>Batalkan barang</Tombol>
                      <Tombol kecil ragam="hantu" className="text-bad-700 hover:bg-bad-50" ikon={<Trash2 className="h-4 w-4" />} onClick={() => setHapusBarang(b)}>Hapus</Tombol>
                    </div>
                  )}
                </Kartu>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="judul-riwayat">
        <h2 id="judul-riwayat" className="font-display text-2xl font-semibold text-navy-900">Riwayat order</h2>
        <div className="mt-3">
          {riwayat.galat && <KotakGalat pesan={riwayat.galat} ulangi={riwayat.muatUlang} />}
          {riwayat.data && <DaftarRiwayat data={riwayat.data} zona={zona} tampilOrder={false} />}
        </div>
      </section>

      <DialogUbahOrder order={o} terbuka={ubahOrder} tutup={() => setUbahOrder(false)} berubah={muatUlang} />
      {master.data && (
        <DialogBarang
          terbuka={dialogBarang.buka}
          tutup={() => setDialogBarang((d) => ({ ...d, buka: false }))}
          berubah={muatUlang}
          master={master.data}
          hariIni={hariIni}
          orderId={o.id}
          barang={dialogBarang.barang}
        />
      )}
      <DialogKoreksiTanggal barang={koreksi} tutup={() => setKoreksi(null)} berubah={muatUlang} zona={zona} />
      <DialogWhatsApp order={o} barang={aktif} terbuka={wa} tutup={() => setWa(false)} zona={zona} pengaturan={pengaturan} />
      <DialogStatus barang={statusUntuk} tutup={() => setStatusUntuk(null)} berubah={muatUlang} zona={zona} />
      <DialogBatal
        judul={`Batalkan order ${o.order_number}?`}
        pesan="Order dan semua barangnya tidak dihitung lagi di dashboard. Datanya tetap tersimpan dan order bisa dipulihkan."
        terbuka={batalOrder}
        tutup={() => setBatalOrder(false)}
        jalankan={async (alasan) => {
          const { error } = await db().rpc('batalkan_order', { p_order: o.id, p_alasan: alasan })
          if (error) throw error
          beri(`Order ${o.order_number} dibatalkan.`)
          muatUlang()
        }}
      />
      <DialogBatal
        judul={batalBarang ? `Batalkan barang #${batalBarang.item_no}?` : 'Batalkan barang?'}
        pesan="Barang ini tidak dihitung lagi. Datanya tetap tersimpan di riwayat."
        terbuka={batalBarang !== null}
        tutup={() => setBatalBarang(null)}
        jalankan={async (alasan) => {
          if (!batalBarang) return
          const { error } = await db().rpc('batalkan_barang', { p_item: batalBarang.id, p_alasan: alasan })
          if (error) throw error
          beri(`Barang #${batalBarang.item_no} dibatalkan.`)
          muatUlang()
        }}
      />
      <Konfirmasi
        terbuka={hapusOrder}
        tutup={() => setHapusOrder(false)}
        judul={`Hapus order ${o.order_number}?`}
        pesan={<p>Order dan semua barangnya pindah ke <strong className="text-navy-900">Sampah</strong> dan tidak tampil atau dihitung lagi. Selama 7 hari masih bisa dipulihkan dari menu Sampah. Setelah itu hilang permanen.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          const { error } = await db().rpc('hapus_order', { p_order: o.id })
          if (error) throw error
          beri(`Order ${o.order_number} dipindah ke Sampah. Bisa dipulihkan selama 7 hari.`)
          navigasi('/order', { replace: true })
        }}
      />
      <Konfirmasi
        terbuka={hapusBarang !== null}
        tutup={() => setHapusBarang(null)}
        judul={hapusBarang ? `Hapus barang #${hapusBarang.item_no}?` : 'Hapus barang?'}
        pesan={<p>Barang ini pindah ke <strong className="text-navy-900">Sampah</strong> dan tidak dihitung lagi. Cocok untuk barang yang salah ketik. Selama 7 hari masih bisa dipulihkan dari menu Sampah.</p>}
        labelYa="Pindahkan ke Sampah"
        bahaya
        jalankan={async () => {
          if (!hapusBarang) return
          const { error } = await db().rpc('hapus_barang', { p_item: hapusBarang.id })
          if (error) throw error
          beri(`Barang #${hapusBarang.item_no} dipindah ke Sampah.`)
          muatUlang()
        }}
      />
      <Konfirmasi
        terbuka={pulihkan}
        tutup={() => setPulihkan(false)}
        judul={`Pulihkan order ${o.order_number}?`}
        pesan={<p>Order ini akan aktif lagi dan kembali dihitung di dashboard.</p>}
        labelYa="Pulihkan"
        jalankan={async () => {
          const { error } = await db().rpc('pulihkan_order', { p_order: o.id })
          if (error) throw error
          beri(`Order ${o.order_number} dipulihkan.`)
          muatUlang()
        }}
      />
    </>
  )
}
