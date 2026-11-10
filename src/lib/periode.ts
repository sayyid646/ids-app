// Rentang tanggal untuk saringan dashboard dan laporan. Semua tanggal berbentuk 'YYYY-MM-DD'.

export type JenisPeriode = 'hari' | 'minggu' | 'bulan' | 'tahun' | 'kustom'

export interface Rentang {
  dari: string
  sampai: string
}

function keTanggal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function keTeks(d: Date): string {
  return d.toISOString().slice(0, 10)
}
export function tambahHari(s: string, n: number): string {
  const d = keTanggal(s)
  d.setUTCDate(d.getUTCDate() + n)
  return keTeks(d)
}

/** Rentang periode yang berisi `hariIni`. Minggu dimulai hari Senin. */
export function rentangPeriode(jenis: Exclude<JenisPeriode, 'kustom'>, hariIni: string): Rentang {
  const [y, m] = hariIni.split('-').map(Number)
  switch (jenis) {
    case 'hari':
      return { dari: hariIni, sampai: hariIni }
    case 'minggu': {
      const hari = keTanggal(hariIni).getUTCDay() // 0 = Minggu
      const keSenin = hari === 0 ? -6 : 1 - hari
      const senin = tambahHari(hariIni, keSenin)
      return { dari: senin, sampai: tambahHari(senin, 6) }
    }
    case 'bulan': {
      const akhir = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return { dari: `${y}-${String(m).padStart(2, '0')}-01`, sampai: `${y}-${String(m).padStart(2, '0')}-${String(akhir).padStart(2, '0')}` }
    }
    case 'tahun':
      return { dari: `${y}-01-01`, sampai: `${y}-12-31` }
  }
}

/** Daftar semua tanggal dari `dari` sampai `sampai` (maks 400 hari). */
export function daftarHari(r: Rentang): string[] {
  const hasil: string[] = []
  let t = r.dari
  while (t <= r.sampai && hasil.length < 400) {
    hasil.push(t)
    t = tambahHari(t, 1)
  }
  return hasil
}

/** Daftar bulan ('YYYY-MM') dari `dari` sampai `sampai`. */
export function daftarBulan(r: Rentang): string[] {
  const hasil: string[] = []
  let [y, m] = r.dari.split('-').map(Number)
  const [y2, m2] = r.sampai.split('-').map(Number)
  while ((y < y2 || (y === y2 && m <= m2)) && hasil.length < 240) {
    hasil.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  return hasil
}
