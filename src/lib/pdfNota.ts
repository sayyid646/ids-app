import { unduh } from './unduh'
import { formatRupiah } from './format'

// PDF nota yang dibuat langsung di perangkat (tanpa dialog cetak): Nota Pembayaran dan nota manual.
// Pustaka PDF baru dimuat saat tombol "Simpan PDF" ditekan.

export type KertasPdf = 'A4' | 'A5' | '80mm' | '58mm'

interface Gambar { data: string; w: number; h: number }

/** Memuat gambar (logo, tanda tangan) menjadi data URL beserta ukurannya. */
async function muatGambar(url: string): Promise<Gambar | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const blob = await r.blob()
    const data = await new Promise<string>((ok, gagal) => {
      const fr = new FileReader()
      fr.onload = () => ok(String(fr.result))
      fr.onerror = () => gagal(fr.error)
      fr.readAsDataURL(blob)
    })
    const ukuran = await new Promise<{ w: number; h: number }>((ok, gagal) => {
      const im = new Image()
      im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight })
      im.onerror = gagal
      im.src = data
    })
    return { data, ...ukuran }
  } catch {
    return null
  }
}

const logoResmi = () => muatGambar(`${import.meta.env.BASE_URL}logo-ids.png`)

/**
 * Menyimpan PDF. Di HP yang mendukung, membuka lembar bagikan (Simpan ke File, WhatsApp, dll.);
 * selain itu langsung diunduh.
 */
export async function simpanPdf(blob: Blob, namaBerkas: string): Promise<void> {
  const berkas = new File([blob], namaBerkas, { type: 'application/pdf' })
  const sentuh = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  if (sentuh && typeof navigator.canShare === 'function' && navigator.canShare({ files: [berkas] })) {
    try {
      await navigator.share({ files: [berkas], title: namaBerkas })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  unduh(blob, namaBerkas)
}

function ukuranKertas(kertas: KertasPdf, tinggiPerkiraan: number): { format: [number, number] | string; tepi: number; sempit: boolean } {
  if (kertas === 'A4') return { format: 'a4', tepi: 14, sempit: false }
  if (kertas === 'A5') return { format: 'a5', tepi: 10, sempit: false }
  const lebar = kertas === '80mm' ? 80 : 58
  return { format: [lebar, Math.max(120, tinggiPerkiraan)], tepi: 4, sempit: true }
}

async function pustaka() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  return { jsPDF, autoTable }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const akhirTabel = (doc: any): number => (doc.lastAutoTable?.finalY as number | undefined) ?? 60

/* ------------------------------------------------------------ Nota Pembayaran */

export interface HalamanPembayaran {
  kode: string
  nama: string | null
  tanggalBayar: string
  baris: { kodeOr: string; kategori: string; harga: number | null }[]
}

export async function pdfNotaPembayaran(halaman: HalamanPembayaran[], kertas: KertasPdf, diterbitkan: string, namaBerkas: string): Promise<void> {
  const { jsPDF, autoTable } = await pustaka()
  const logo = await logoResmi()
  const maksBaris = Math.max(1, ...halaman.map((h) => h.baris.length))
  const k = ukuranKertas(kertas, 95 + maksBaris * 8)
  const doc = new jsPDF({ unit: 'mm', format: k.format })
  const fs = k.sempit ? 0.8 : 1

  halaman.forEach((hal, idx) => {
    if (idx > 0) doc.addPage(k.format, 'portrait')
    const W = doc.internal.pageSize.getWidth()
    let y = k.tepi
    if (logo) {
      const lw = Math.min(k.sempit ? W - 2 * k.tepi : 80, W - 2 * k.tepi)
      const lh = (lw * logo.h) / logo.w
      doc.addImage(logo.data, 'PNG', (W - lw) / 2, y, lw, lh)
      y += lh + 5
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15 * fs)
    doc.text('NOTA PEMBAYARAN', W / 2, y + 2, { align: 'center', charSpace: 0.8 })
    y += 5
    doc.setLineWidth(0.6)
    doc.line(k.tepi, y, W - k.tepi, y)
    y += 6
    doc.setFontSize(10 * fs)
    const label = k.sempit ? 24 : 42
    for (const [l, v] of [['Nama pengrajin', hal.nama ?? '(nama belum diisi)'], ['ID pengrajin', hal.kode], ['Tanggal pembayaran', hal.tanggalBayar]]) {
      doc.setFont('helvetica', 'normal')
      doc.text(k.sempit ? l.replace('pengrajin', '').replace('Tanggal pembayaran', 'Tgl bayar').trim() : l, k.tepi, y)
      doc.setFont('helvetica', 'bold')
      doc.text(`: ${v}`, k.tepi + label, y)
      y += 5.5 * fs + 0.5
    }
    const total = hal.baris.reduce((t, b) => t + (b.harga ?? 0), 0)
    autoTable(doc, {
      startY: y + 1,
      head: [['No', 'Kode OR', 'Kategori + Gender', 'Harga Satuan']],
      body: hal.baris.length
        ? hal.baris.map((b, i) => [String(i + 1), b.kodeOr, b.kategori, b.harga != null ? formatRupiah(b.harga) : ''])
        : [['', '', 'Tidak ada barang', '']],
      foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, formatRupiah(total)]],
      theme: 'plain',
      margin: { left: k.tepi, right: k.tepi },
      styles: { fontSize: 9.5 * fs, cellPadding: k.sempit ? 1 : 1.8, textColor: 0, lineColor: 0 },
      headStyles: { fontStyle: 'bold', lineWidth: { top: 0.5, bottom: 0.5 } },
      bodyStyles: { lineWidth: { bottom: 0.15 } },
      footStyles: { fontStyle: 'bold', lineWidth: { top: 0.5, bottom: 0.5 }, cellPadding: k.sempit ? 1.5 : 2.5 },
      columnStyles: { 0: { cellWidth: k.sempit ? 6 : 12 }, 3: { halign: 'right' } },
    })
    y = akhirTabel(doc) + (k.sempit ? 8 : 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9 * fs)
    if (k.sempit) {
      if (logo) { const lw = W - 2 * k.tepi - 10; doc.addImage(logo.data, 'PNG', (W - lw) / 2, y, lw, (lw * logo.h) / logo.w); y += (lw * logo.h) / logo.w + 4 }
      doc.text(`Diterbitkan pada: ${diterbitkan}`, W / 2, y, { align: 'center' })
    } else {
      if (logo) { const lw = 55; doc.addImage(logo.data, 'PNG', k.tepi, y, lw, (lw * logo.h) / logo.w) }
      doc.text('Diterbitkan pada: ', W - k.tepi - doc.getTextWidth(diterbitkan) - 1, y + 5, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(diterbitkan, W - k.tepi, y + 5, { align: 'right' })
    }
  })
  await simpanPdf(doc.output('blob'), namaBerkas)
}

/* ---------------------------------------------------------------- Nota manual */

export interface NotaManualPdf {
  nomor: string
  tanggal: string
  kepada: string | null
  baris: { banyak: number; nama: string; harga: number; jumlah: number }[]
  total: number
  tandaTanganUrl: string | null
}

export async function pdfNotaManual(n: NotaManualPdf, kertas: 'A4' | 'A5', namaBerkas: string): Promise<void> {
  const { jsPDF, autoTable } = await pustaka()
  const [logo, ttd] = await Promise.all([logoResmi(), n.tandaTanganUrl ? muatGambar(n.tandaTanganUrl) : Promise.resolve(null)])
  const k = ukuranKertas(kertas, 0)
  const doc = new jsPDF({ unit: 'mm', format: k.format })
  const W = doc.internal.pageSize.getWidth()
  let y = k.tepi
  if (logo) {
    const lw = Math.min(80, W - 2 * k.tepi)
    const lh = (lw * logo.h) / logo.w
    doc.addImage(logo.data, 'PNG', (W - lw) / 2, y, lw, lh)
    y += lh + 4
  }
  doc.setLineWidth(0.6)
  doc.line(k.tepi, y, W - k.tepi, y)
  y += 7
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('Kepada Yth.', k.tepi, y)
  doc.setFont('helvetica', 'bold')
  doc.text(n.kepada ?? '....................................', k.tepi + 24, y)
  doc.setFont('helvetica', 'normal')
  doc.text(`No. ${n.nomor}`, W - k.tepi, y - 5, { align: 'right' })
  doc.text(n.tanggal, W - k.tepi, y, { align: 'right' })
  autoTable(doc, {
    startY: y + 5,
    head: [['Banyaknya', 'Nama Barang', 'Harga', 'Jumlah']],
    body: n.baris.length
      ? n.baris.map((b) => [b.banyak ? b.banyak.toLocaleString('id-ID') : '', b.nama, b.harga ? formatRupiah(b.harga) : '', b.jumlah ? formatRupiah(b.jumlah) : ''])
      : [['', '', '', '']],
    foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, formatRupiah(n.total)]],
    theme: 'plain',
    margin: { left: k.tepi, right: k.tepi },
    styles: { fontSize: 10, cellPadding: 1.8, textColor: 0, lineColor: 0 },
    headStyles: { fontStyle: 'bold', lineWidth: { top: 0.5, bottom: 0.5 } },
    bodyStyles: { lineWidth: { bottom: 0.15 } },
    footStyles: { fontStyle: 'bold', lineWidth: { top: 0.5, bottom: 0.5 }, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 22, halign: 'center' }, 2: { halign: 'right', cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34 } },
  })
  // Area tanda tangan dengan logo di sebelah kanan garis.
  let ty = akhirTabel(doc) + 14
  const H = doc.internal.pageSize.getHeight()
  if (ty + 45 > H - k.tepi) { doc.addPage(); ty = k.tepi + 10 }
  const logoW = logo ? 40 : 0
  const garisKanan = W - k.tepi - (logo ? logoW + 6 : 0)
  const garisKiri = garisKanan - 55
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Hormat kami,', (garisKiri + garisKanan) / 2, ty, { align: 'center' })
  const garisY = ty + 26
  if (ttd) {
    const maxW = 50, maxH = 20
    const s = Math.min(maxW / ttd.w, maxH / ttd.h)
    const w = ttd.w * s, h = ttd.h * s
    doc.addImage(ttd.data, 'PNG', (garisKiri + garisKanan) / 2 - w / 2, garisY - h - 1, w, h)
  }
  doc.setLineWidth(0.3)
  doc.line(garisKiri, garisY, garisKanan, garisY)
  if (logo) doc.addImage(logo.data, 'PNG', W - k.tepi - logoW, garisY - (logoW * logo.h) / logo.w, logoW, (logoW * logo.h) / logo.w)
  await simpanPdf(doc.output('blob'), namaBerkas)
}
