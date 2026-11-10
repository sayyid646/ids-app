import { describe, expect, it } from 'vitest'
import { daftarBulan, rentangPeriode, tambahHari } from './periode'
import { buatCsv, jumlahkan, produktivitas, ringkasBulanan, ringkasHarian, ringkasTahunan, barangDalamRentang, type BarisBarang } from './laporan'
import { isiTemplate, jenisPesanUntuk, templateDari, TEMPLATE_BAWAAN } from './waTemplate'
import { isoKeLokal, lokalKeIso, formatTanggal, aturGayaTanggal, formatTanggalPanjang } from './format'
import { kelompokPengrajin } from './nota'
import type { Barang } from './types'

const Z = 'Asia/Makassar'

describe('periode', () => {
  it('minggu dimulai hari Senin', () => {
    expect(rentangPeriode('minggu', '2026-11-10')).toEqual({ dari: '2026-11-09', sampai: '2026-11-15' })
    expect(rentangPeriode('minggu', '2026-11-15')).toEqual({ dari: '2026-11-09', sampai: '2026-11-15' })
  })
  it('bulan, tahun, hari', () => {
    expect(rentangPeriode('bulan', '2026-02-10')).toEqual({ dari: '2026-02-01', sampai: '2026-02-28' })
    expect(rentangPeriode('bulan', '2028-02-10').sampai).toBe('2028-02-29')
    expect(rentangPeriode('tahun', '2026-11-10')).toEqual({ dari: '2026-01-01', sampai: '2026-12-31' })
    expect(rentangPeriode('hari', '2026-11-10')).toEqual({ dari: '2026-11-10', sampai: '2026-11-10' })
  })
  it('daftar bulan dan tambah hari', () => {
    expect(daftarBulan({ dari: '2025-11-15', sampai: '2026-02-01' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(tambahHari('2026-12-31', 1)).toBe('2027-01-01')
  })
})

// Data yang sama dengan tes database T20, supaya angka laporan cocok dengan statistik database.
const b = (o: Partial<BarisBarang>): BarisBarang => ({
  id: Math.random().toString(), order_id: 'o', order_number: '1', customer_name: 'X', customer_whatsapp: null, item_no: 1,
  craftsman_id: 'p4', craftsman_code: 'IDS 004', craftsman_name: 'Ahmad Rifqi', category_name: 'PREMIUM', gender: 'LADY', description: null,
  assigned_date: '2025-01-10', production_month: '2025-01-01', status: 'dalam_proses', completed_at: null, delivered_at: null, is_active: true, ...o,
})
const DATA: BarisBarang[] = [
  b({ order_id: 'S1', status: 'selesai', completed_at: '2025-01-20T04:00:00Z' }),
  b({ order_id: 'S1', item_no: 2, status: 'diserahkan', completed_at: '2025-01-25T02:00:00Z', delivered_at: '2025-02-03T02:00:00Z' }),
  b({ order_id: 'S2', craftsman_id: 'p5', craftsman_code: 'IDS 005', category_name: 'HIGH', gender: 'MAN', assigned_date: '2025-02-14' }),
  b({ order_id: 'S3', category_name: 'SULTAN', assigned_date: '2025-02-28', status: 'diserahkan', completed_at: '2025-03-31T15:30:00Z', delivered_at: '2025-03-31T16:30:00Z' }),
  b({ order_id: 'S4', craftsman_id: 'p5', assigned_date: '2025-01-05', is_active: false }),
  b({ order_id: 'S5', category_name: 'LUXURY', gender: 'MAN', assigned_date: '2025-03-10' }),
  b({ order_id: 'S5', item_no: 2, assigned_date: '2025-03-10', is_active: false }),
]

describe('laporan (cocok dengan statistik database)', () => {
  it('ringkasan bulanan Jan-Apr 2025', () => {
    const r = ringkasBulanan(DATA, { dari: '2025-01-15', sampai: '2025-04-02' }, Z)
    expect(r.map((x) => `${x.kunci}:${x.order_masuk}/${x.barang_masuk}/${x.barang_selesai}/${x.barang_diserahkan}`).join(' '))
      .toBe('2025-01:1/2/2/0 2025-02:2/2/0/1 2025-03:1/1/1/0 2025-04:0/0/0/1')
  })
  it('batas zona waktu: 23.30 WITA tetap 31 Maret, 00.30 WITA masuk 1 April', () => {
    const h = ringkasHarian(DATA, { dari: '2025-03-31', sampai: '2025-04-01' }, Z)
    expect(h[0]).toMatchObject({ kunci: '2025-03-31', barang_selesai: 1, barang_diserahkan: 0 })
    expect(h[1]).toMatchObject({ kunci: '2025-04-01', barang_selesai: 0, barang_diserahkan: 1 })
  })
  it('tahunan dan total', () => {
    const t = ringkasTahunan(DATA, { dari: '2025-01-01', sampai: '2025-12-31' }, Z)
    expect(t).toHaveLength(1)
    expect(jumlahkan(t)).toEqual({ order_masuk: 4, barang_masuk: 5, barang_selesai: 3, barang_diserahkan: 2 })
  })
  it('produktivitas pengrajin', () => {
    const p = produktivitas(DATA, [{ id: 'p4', code: 'IDS 004', name: 'Ahmad Rifqi' }, { id: 'p5', code: 'IDS 005', name: 'Khairin' }], { dari: '2025-01-01', sampai: '2025-12-31' }, Z)
    expect(p[0]).toMatchObject({ ditugaskan: 4, selesai: 3, diserahkan: 2, sedang_dikerjakan: 1, rata_hari: 18.7 })
    expect(p[1]).toMatchObject({ ditugaskan: 1, selesai: 0, diserahkan: 0, sedang_dikerjakan: 1, rata_hari: null })
  })
  it('barang belum diserahkan dalam rentang', () => {
    expect(barangDalamRentang(DATA, { dari: '2025-01-01', sampai: '2025-12-31' }, 'belum_diserahkan')).toHaveLength(3)
    expect(barangDalamRentang(DATA, { dari: '2025-01-01', sampai: '2025-12-31' }, 'dalam_proses')).toHaveLength(2)
  })
})

describe('CSV untuk Excel', () => {
  it('pakai BOM, titik koma, dan tanda kutip bila perlu', () => {
    const t = buatCsv(['A', 'B'], [['x;y', 'kata "kutip"'], [1, null]])
    expect(t.startsWith('﻿')).toBe(true)
    expect(t).toBe('﻿A;B\r\n"x;y";"kata ""kutip"""\r\n1;\r\n')
  })
})

describe('pesan WhatsApp', () => {
  it('memilih template sesuai status order', () => {
    expect(jenisPesanUntuk('selesai')).toBe('selesai')
    expect(jenisPesanUntuk('diserahkan')).toBe('diserahkan')
    expect(jenisPesanUntuk('sebagian')).toBe('proses')
    expect(templateDari(null, 'selesai')).toBe(TEMPLATE_BAWAAN.selesai)
  })
  it('mengisi penanda', () => {
    const t = isiTemplate(TEMPLATE_BAWAAN.selesai, { nomor_order: '2574', kategori: 'PREMIUM', tanggal_selesai: '23 September 2026' })
    expect(t).toContain('Nomor Order: 2574')
    expect(t).toContain('Kategori: PREMIUM')
    expect(t).toContain('Status: Selesai Dikerjakan')
    expect(t).toContain('23 September 2026')
    expect(isiTemplate('{tidak_dikenal}', {})).toBe('{tidak_dikenal}')
  })
})

describe('tanggal dan jam di zona waktu usaha', () => {
  it('isian jam dibaca sebagai WITA', () => {
    expect(lokalKeIso('2026-03-31T23:30', Z)).toBe('2026-03-31T15:30:00.000Z')
    expect(isoKeLokal('2026-03-31T15:30:00Z', Z)).toBe('2026-03-31T23:30')
    expect(lokalKeIso('2026-09-23T10:00', 'Asia/Jakarta')).toBe('2026-09-23T03:00:00.000Z')
    expect(lokalKeIso('salah', Z)).toBeNull()
  })
  it('format tanggal bisa diganti di pengaturan', () => {
    aturGayaTanggal('dd/MM/yyyy')
    expect(formatTanggal('2026-09-03')).toBe('03/09/2026')
    expect(formatTanggalPanjang('2026-09-03')).toBe('03 September 2026')
    aturGayaTanggal('dd MMMM yyyy')
    expect(formatTanggal('2026-09-03')).toBe('03 September 2026')
  })
})

describe('nota pengrajin', () => {
  it('satu halaman per pengrajin, urut ID', () => {
    const g = kelompokPengrajin([
      { craftsman_id: 'b', craftsman_code: 'IDS 002', craftsman_name: 'B' },
      { craftsman_id: 'a', craftsman_code: 'IDS 001', craftsman_name: 'A' },
      { craftsman_id: 'b', craftsman_code: 'IDS 002', craftsman_name: 'B' },
    ] as Barang[])
    expect(g.map((x) => `${x.kode}:${x.barang.length}`)).toEqual(['IDS 001:1', 'IDS 002:2'])
  })
})
