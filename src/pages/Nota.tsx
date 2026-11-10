import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { db } from '../lib/supabase'
import type { Barang, OrderRingkas } from '../lib/types'
import { LABEL_STATUS } from '../lib/types'
import { formatTanggalPanjang, formatTanggalWaktu, hariIni as tglHariIni, tglLokal } from '../lib/format'
import { tampilkanWa } from '../lib/wa'
import { useMuat } from '../sync/useMuat'
import { useSinkron } from '../sync/SyncProvider'
import { KotakGalat, Pemuat, cx } from '../components/ui/ui'
import { kelompokPengrajin } from '../lib/nota'

type Kertas = 'A4' | 'A5' | '80mm' | '58mm'

function Kop({ nama, alamat, wa, logo, sempit }: { nama: string; alamat: string | null; wa: string | null; logo: string | null; sempit: boolean }) {
  return (
    <div className={cx('flex items-center gap-3 border-b-2 border-black pb-2', sempit && 'flex-col text-center')}>
      {logo ? (
        <img src={logo} alt="" className={cx('object-contain', sempit ? 'h-10' : 'h-14 w-14')} />
      ) : (
        <svg viewBox="0 0 48 48" className={sempit ? 'h-9 w-9' : 'h-12 w-12'} aria-hidden>
          <path d="M13 15h22l7 9-18 18L6 24z" fill="none" stroke="#000" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M6 24h36M19 15l-3.5 9L24 42l8.5-18L29 15M15.5 24 24 15l8.5 9" fill="none" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
      <div className="min-w-0">
        <p className={cx('font-display font-bold tracking-[0.2em]', sempit ? 'text-xl' : 'text-3xl')}>IDS</p>
        <p className={cx('font-bold tracking-[0.15em]', sempit ? 'text-[10px]' : 'text-xs')}>{nama.toUpperCase()}</p>
        {alamat && <p className="text-[10px]">{alamat}</p>}
        {wa && <p className="text-[10px]">WhatsApp {tampilkanWa(wa)}</p>}
      </div>
    </div>
  )
}

function Baris({ label, isi }: { label: string; isi: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0">{label}</span>
      <span className="font-semibold">: {isi}</span>
    </div>
  )
}

function Tanda({ kiri, kanan, sempit }: { kiri: string; kanan: string; sempit: boolean }) {
  return (
    <div className={cx('mt-8 grid gap-6 text-center', sempit ? 'grid-cols-1' : 'grid-cols-2')}>
      {[kiri, kanan].map((x) => (
        <div key={x}>
          <p>{x}</p>
          <div className="mx-auto mt-14 w-44 border-b border-black" />
        </div>
      ))}
    </div>
  )
}

export default function Nota() {
  const { jenis = 'pengrajin', id = '' } = useParams()
  const { pengaturan, zona } = useSinkron()
  const [kertas, setKertas] = useState<Kertas>('A4')
  const [logo, setLogo] = useState<string | null>(null)
  const serah = jenis === 'serah'

  useEffect(() => { if (pengaturan) setKertas(pengaturan.receipt_paper) }, [pengaturan])
  useEffect(() => {
    if (!pengaturan?.logo_path) { setLogo(null); return }
    db().storage.from('identitas').createSignedUrl(pengaturan.logo_path, 3600).then(({ data }) => setLogo(data?.signedUrl ?? null))
  }, [pengaturan?.logo_path])

  const data = useMuat(async () => {
    const [o, b] = await Promise.all([
      db().from('v_orders').select('*').eq('id', id).maybeSingle(),
      db().from('v_items').select('*').eq('order_id', id).eq('is_active', true).order('item_no'),
    ])
    if (o.error) throw o.error
    if (b.error) throw b.error
    return { order: o.data as OrderRingkas | null, barang: (b.data ?? []) as Barang[] }
  }, [id])

  // Ukuran kertas untuk dialog cetak browser.
  useEffect(() => {
    const gaya = document.createElement('style')
    gaya.textContent = kertas === 'A4' ? '@page { size: A4; margin: 14mm; }' : kertas === 'A5' ? '@page { size: A5; margin: 10mm; }' : `@page { size: ${kertas} auto; margin: 3mm; }`
    document.head.appendChild(gaya)
    return () => gaya.remove()
  }, [kertas])

  if (data.memuat && !data.data) return <Pemuat />
  if (data.galat) return <div className="p-6"><KotakGalat pesan={data.galat} ulangi={data.muatUlang} /></div>
  const o = data.data?.order
  if (!o) return <div className="p-6"><KotakGalat pesan="Order tidak ditemukan." /></div>

  const semua = data.data!.barang
  const diserahkan = semua.filter((b) => b.status === 'diserahkan')
  const isiSerah = diserahkan.length ? diserahkan : semua
  const tglSerah = diserahkan.reduce<string | null>((m, b) => (b.delivered_at && (!m || b.delivered_at > m) ? b.delivered_at : m), null)
  const sempit = kertas === '80mm' || kertas === '58mm'
  const nama = pengaturan?.business_name ?? 'Intan Dua Saudara'
  const tandaTangan = pengaturan?.receipt_show_signature ?? true
  const lebar = kertas === 'A4' ? 'max-w-[190mm]' : kertas === 'A5' ? 'max-w-[128mm]' : kertas === '80mm' ? 'max-w-[74mm]' : 'max-w-[52mm]'

  return (
    <div className="min-h-dvh bg-ice-100 print:bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-ice-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] print:hidden">
        <Link to={`/order/${o.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ArrowLeft className="h-4 w-4" /> Kembali</Link>
        <div className="ml-auto flex items-center gap-2">
          <select aria-label="Ukuran kertas" value={kertas} onChange={(e) => setKertas(e.target.value as Kertas)} className="h-10 rounded-xl border border-ice-300 bg-white px-3 text-sm">
            <option value="A4">A4</option><option value="A5">A5</option><option value="80mm">Thermal 80 mm</option><option value="58mm">Thermal 58 mm</option>
          </select>
          <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Cetak
          </button>
        </div>
        <p className="w-full text-xs text-ink-muted">
          Tombol Cetak membuka pilihan printer dari HP atau komputer. Pilih printer yang tersambung, atau "Simpan sebagai PDF".
          {serah && !diserahkan.length && ' Belum ada barang berstatus Sudah Diserahkan, jadi semua barang ditampilkan.'}
        </p>
      </div>

      <div className={cx('mx-auto my-6 bg-white p-6 text-black shadow-card print:my-0 print:max-w-none print:p-0 print:shadow-none', lebar, sempit ? 'text-[11px]' : kertas === 'A5' ? 'text-[12px]' : 'text-[13px]')}>
        {(serah ? [{ id: 'serah', kode: '', nama: null, barang: isiSerah }] : kelompokPengrajin(semua)).map((g, gi, arr) => (
          <section key={g.id} className={cx(gi < arr.length - 1 && 'break-after-page pb-10 print:pb-0')}>
            <Kop nama={nama} alamat={pengaturan?.business_address ?? null} wa={pengaturan?.business_whatsapp ?? null} logo={logo} sempit={sempit} />
            <h1 className={cx('mt-3 text-center font-bold tracking-[0.15em]', sempit ? 'text-sm' : 'text-lg')}>
              {serah ? 'NOTA SERAH TERIMA' : 'NOTA KERJA PENGRAJIN'}
            </h1>
            <div className="mt-3 space-y-0.5">
              <Baris label="Nomor order" isi={o.order_number} />
              {serah ? (
                <>
                  <Baris label="Nama pembeli" isi={o.customer_name} />
                  <Baris label="WhatsApp" isi={tampilkanWa(o.customer_whatsapp)} />
                  <Baris label="Tanggal diserahkan" isi={tglSerah ? formatTanggalPanjang(tglLokal(tglSerah, zona)) : '-'} />
                </>
              ) : (
                <>
                  <Baris label="Pengrajin" isi={g.nama ?? '(nama belum diisi)'} />
                  <Baris label="ID pengrajin" isi={g.kode} />
                  <Baris label="Tanggal diberikan" isi={[...new Set(g.barang.map((b) => formatTanggalPanjang(b.assigned_date)))].join(', ')} />
                  <Baris label="Jumlah barang" isi={`${g.barang.length}`} />
                </>
              )}
            </div>

            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="border-y border-black text-left">
                  <th className="py-1 pr-2">No</th>
                  <th className="py-1 pr-2">Kategori</th>
                  <th className="py-1 pr-2">Gender</th>
                  {!sempit && <th className="py-1 pr-2">Keterangan</th>}
                  {serah && <th className="py-1">Status</th>}
                </tr>
              </thead>
              <tbody>
                {g.barang.map((b) => (
                  <tr key={b.id} className="break-inside-avoid border-b border-dashed border-black/50 align-top">
                    <td className="py-1 pr-2">{b.item_no}</td>
                    <td className="py-1 pr-2 font-semibold">{b.category_name}{sempit && (b.description || b.notes) && <span className="block font-normal">{[b.description, b.notes].filter(Boolean).join(' · ')}</span>}</td>
                    <td className="py-1 pr-2">{b.gender}</td>
                    {!sempit && <td className="py-1 pr-2">{[b.description, b.notes && `Catatan: ${b.notes}`].filter(Boolean).join(' · ') || '-'}</td>}
                    {serah && <td className="py-1">{LABEL_STATUS[b.status]}{b.delivered_at ? `, ${formatTanggalWaktu(b.delivered_at, zona)}` : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 font-semibold">Total: {g.barang.length} barang</p>

            {o.notes && <p className="mt-2">Catatan order: {o.notes}</p>}

            {serah ? (
              <p className="mt-3 border border-black p-2">
                Dengan ini pembeli menyatakan telah menerima barang tersebut di atas dari {nama} dalam keadaan baik dan sesuai pesanan.
              </p>
            ) : (
              <p className="mt-3 border border-black p-2">Pengrajin menerima barang dan pekerjaan di atas untuk dikerjakan sesuai catatan.</p>
            )}

            {tandaTangan && (serah ? <Tanda kiri="Penerima (pembeli)" kanan={`Petugas ${nama}`} sempit={sempit} /> : <Tanda kiri={`Admin ${nama}`} kanan="Pengrajin" sempit={sempit} />)}

            <p className="mt-6 text-center text-[10px]">
              {serah && pengaturan?.receipt_footer ? `${pengaturan.receipt_footer} · ` : ''}Dicetak {formatTanggalPanjang(tglHariIni(zona))}
            </p>
          </section>
        ))}
      </div>
    </div>
  )
}
