import { unduh } from './unduh'

/** Membuat PDF tabel laporan (A4) dan mengunduhnya. Pustaka PDF baru dimuat saat tombol ditekan. */
export async function unduhPdf(opsi: {
  judul: string
  sub: string
  usaha: string
  kepala: string[]
  baris: (string | number)[][]
  kaki?: (string | number)[]
  namaBerkas: string
  mendatar?: boolean
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: opsi.mendatar ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const lebar = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('IDS', 14, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(opsi.usaha.toUpperCase(), 26, 16)
  doc.setDrawColor(150)
  doc.line(14, 19, lebar - 14, 19)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(opsi.judul, 14, 27)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(opsi.sub, 14, 32)
  autoTable(doc, {
    head: [opsi.kepala],
    body: opsi.baris,
    foot: opsi.kaki ? [opsi.kaki] : undefined,
    startY: 36,
    styles: { fontSize: 8, cellPadding: 1.6, textColor: 20, lineColor: 200, lineWidth: 0.1 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 245, 245], textColor: 20, fontStyle: 'bold' },
    theme: 'grid',
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight()
      doc.setFontSize(7)
      doc.setTextColor(120)
      doc.text(`Halaman ${doc.getCurrentPageInfo().pageNumber}`, lebar - 14, h - 8, { align: 'right' })
      doc.text('Dibuat dari aplikasi IDS', 14, h - 8)
      doc.setTextColor(20)
    },
  })
  unduh(doc.output('blob'), opsi.namaBerkas)
}
