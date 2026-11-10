import { useState } from 'react'
import { rentangPeriode, type JenisPeriode, type Rentang } from '../lib/periode'
import { cx, Isian } from './ui/ui'

const LABEL: Record<JenisPeriode, string> = {
  hari: 'Hari ini',
  minggu: 'Minggu ini',
  bulan: 'Bulan ini',
  tahun: 'Tahun ini',
  kustom: 'Pilih tanggal',
}

export interface NilaiPeriode { jenis: JenisPeriode; rentang: Rentang }

export function periodeAwal(jenis: Exclude<JenisPeriode, 'kustom'>, hariIni: string): NilaiPeriode {
  return { jenis, rentang: rentangPeriode(jenis, hariIni) }
}

/** Saringan periode: hari ini, minggu ini, bulan ini, tahun ini, atau rentang sendiri. */
export function PilihPeriode({ nilai, ubah, hariIni }: { nilai: NilaiPeriode; ubah: (n: NilaiPeriode) => void; hariIni: string }) {
  const [dari, setDari] = useState(nilai.rentang.dari)
  const [sampai, setSampai] = useState(nilai.rentang.sampai)
  const salah = dari > sampai

  return (
    <div className="space-y-3 print:hidden">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Periode">
        {(Object.keys(LABEL) as JenisPeriode[]).map((j) => (
          <button
            key={j}
            type="button"
            aria-pressed={nilai.jenis === j}
            onClick={() => {
              if (j === 'kustom') ubah({ jenis: 'kustom', rentang: { dari, sampai: salah ? dari : sampai } })
              else {
                const r = rentangPeriode(j, hariIni)
                setDari(r.dari); setSampai(r.sampai)
                ubah({ jenis: j, rentang: r })
              }
            }}
            className={cx(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
              nilai.jenis === j ? 'border-navy-900 bg-navy-900 text-white' : 'border-ice-300 bg-white text-ink-soft hover:border-gold-400',
            )}
          >
            {LABEL[j]}
          </button>
        ))}
      </div>
      {nilai.jenis === 'kustom' && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-navy-900">
            Dari
            <Isian type="date" className="mt-1 w-44" value={dari} max={hariIni} onChange={(e) => setDari(e.target.value)} />
          </label>
          <label className="text-sm font-semibold text-navy-900">
            Sampai
            <Isian type="date" className="mt-1 w-44" value={sampai} onChange={(e) => setSampai(e.target.value)} salah={salah} />
          </label>
          <button
            type="button"
            disabled={!dari || !sampai || salah}
            onClick={() => ubah({ jenis: 'kustom', rentang: { dari, sampai } })}
            className="h-11 rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Terapkan
          </button>
          {salah && <p className="w-full text-sm text-bad-600">Tanggal awal harus sebelum tanggal akhir.</p>}
        </div>
      )}
    </div>
  )
}
