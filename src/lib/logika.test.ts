import { describe, expect, it } from 'vitest'
import { formatBulan, formatTanggal, formatTanggalPendek, formatTanggalWaktu, tglLokal } from './format'
import { normalisasiWa, tampilkanWa, tautanWa, waValid } from './wa'
import { kodeSama, normalisasiKode, skemaPengrajin } from './pengrajinSchema'
import { pesanGalat } from './errors'

describe('format tanggal Indonesia', () => {
  it('menulis tanggal lengkap dengan nol di depan', () => {
    expect(formatTanggal('2026-09-03')).toBe('03 September 2026')
    expect(formatTanggal('2026-12-31')).toBe('31 Desember 2026')
  })
  it('kosong menjadi tanda strip', () => {
    expect(formatTanggal(null)).toBe('-')
    expect(formatTanggal('')).toBe('-')
    expect(formatTanggal('bukan tanggal')).toBe('-')
  })
  it('format pendek dan bulan', () => {
    expect(formatTanggalPendek('2026-09-23')).toBe('23/09')
    expect(formatBulan('2026-02-01')).toBe('Februari 2026')
  })
  it('batas zona waktu WITA: 23.30 tetap tanggal yang sama', () => {
    expect(tglLokal('2025-03-31T15:30:00Z', 'Asia/Makassar')).toBe('2025-03-31')
    expect(tglLokal('2025-03-31T16:30:00Z', 'Asia/Makassar')).toBe('2025-04-01')
    expect(tglLokal('2025-03-31T16:30:00Z', 'Asia/Jakarta')).toBe('2025-03-31')
  })
  it('tanggal dan jam', () => {
    expect(formatTanggalWaktu('2026-09-23T02:00:00Z', 'Asia/Makassar')).toBe('23 September 2026, 10.00')
    expect(formatTanggalWaktu(null, 'Asia/Makassar')).toBe('-')
  })
})

describe('nomor WhatsApp (sama dengan database)', () => {
  it('merapikan ke format 62', () => {
    expect(normalisasiWa('0812-3456-7890')).toBe('6281234567890')
    expect(normalisasiWa('+62 813 1111 2222')).toBe('6281311112222')
    expect(normalisasiWa('812 3456 7890')).toBe('6281234567890')
    expect(normalisasiWa('   ')).toBeNull()
  })
  it('menolak nomor tidak valid', () => {
    expect(waValid('abc')).toBe(false)
    expect(waValid('12345')).toBe(false)
    expect(waValid('0812 3456 7890')).toBe(true)
  })
  it('menampilkan dan membuat tautan', () => {
    expect(tampilkanWa('6281234567890')).toBe('0812-3456-7890')
    expect(tautanWa('0812 3456 7890', 'Nomor Order: 2574')).toBe('https://wa.me/6281234567890?text=Nomor%20Order%3A%202574')
  })
})

describe('data pengrajin', () => {
  it('merapikan ID', () => {
    expect(normalisasiKode('  ids   001 ')).toBe('IDS 001')
    expect(kodeSama('ids 001', 'IDS  001')).toBe(true)
  })
  it('nama boleh kosong (IDS 008 dan 009)', () => {
    const r = skemaPengrajin.parse({ code: 'IDS 008', name: '   ' })
    expect(r.name).toBeNull()
    expect(r.phone).toBeNull()
  })
  it('ID wajib diisi', () => {
    expect(skemaPengrajin.safeParse({ code: '   ' }).success).toBe(false)
  })
  it('nomor HP dirapikan dan divalidasi', () => {
    expect(skemaPengrajin.parse({ code: 'IDS 010', phone: '0812 9999 0000' }).phone).toBe('6281299990000')
    expect(skemaPengrajin.safeParse({ code: 'IDS 010', phone: '123' }).success).toBe(false)
  })
})

describe('pesan galat', () => {
  it('pesan login', () => {
    expect(pesanGalat({ message: 'Invalid login credentials' })).toBe('Email atau kata sandi salah.')
  })
  it('kode pengrajin ganda', () => {
    expect(pesanGalat({ code: '23505', message: 'duplicate key value violates unique constraint "craftsmen_code_uq"' }))
      .toBe('ID pengrajin sudah dipakai pengrajin lain.')
  })
  it('pesan aturan database diteruskan apa adanya', () => {
    const m = 'Nomor order 2574 sudah dipakai. Tambahkan barang ke order yang ada atau gunakan nomor lain.'
    expect(pesanGalat({ code: '23505', message: m })).toBe(m)
  })
  it('jaringan putus', () => {
    expect(pesanGalat(new TypeError('Failed to fetch'))).toMatch(/koneksi internet/)
  })
})
