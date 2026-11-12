import { useEffect, useState } from 'react'
import { Controller, get, useFormContext, useWatch } from 'react-hook-form'
import { Minus, Plus } from 'lucide-react'
import type { DataMaster } from '../../sync/useMaster'
import { labelPengrajin } from '../../sync/useMaster'
import { formatBulan } from '../../lib/format'
import { Bidang, Isian, IsianPanjang, cx } from '../../components/ui/ui'

interface Props {
  /** Awalan nama isian, mis. 'items.0.' untuk barang di dalam order, atau '' untuk satu barang. */
  awalan: string
  master: DataMaster
  hariIni: string
  tampilJumlah?: boolean
  /** Berat minimal per barang (gram) dari Pengaturan. */
  minBerat: number
}

const KELAS_PILIH =
  'h-11 w-full rounded-xl border bg-white px-3 text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-gold-300 focus:border-gold-400'

/** Isian satu barang: pengrajin, kategori, gender, jumlah, tanggal, deskripsi. Dipakai di semua formulir barang. */
export function BidangBarang({ awalan, master, hariIni, tampilJumlah = true, minBerat }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, control, setValue, formState } = useFormContext<any>()
  const n = (k: string) => `${awalan}${k}`
  const id = (k: string) => `${awalan.replace(/\./g, '-')}${k}`
  const galat = (k: string): string | undefined => get(formState.errors, n(k))?.message

  const pengrajinTerpilih = useWatch({ control, name: n('craftsman_id') }) as string
  const kategoriTerpilih = useWatch({ control, name: n('category_id') }) as string
  const tanggal = useWatch({ control, name: n('assigned_date') }) as string
  const bulanManual = useWatch({ control, name: n('production_month') }) as string | undefined
  const [koreksiBulan, setKoreksiBulan] = useState(Boolean(bulanManual))
  useEffect(() => {
    if (bulanManual) setKoreksiBulan(true)
  }, [bulanManual])

  // Pengrajin dan kategori nonaktif hanya tampil bila sudah terpilih (data lama).
  const daftarPengrajin = master.pengrajin.filter((p) => p.is_active || p.id === pengrajinTerpilih)
  const daftarKategori = master.kategori.filter((k) => k.is_active || k.id === kategoriTerpilih)

  return (
    <div className="space-y-4">
      <Bidang label="Pengrajin" id={id('craftsman_id')} wajib galat={galat('craftsman_id')}>
        <select id={id('craftsman_id')} className={cx(KELAS_PILIH, galat('craftsman_id') ? 'border-bad-600' : 'border-ice-300')} {...register(n('craftsman_id'))}>
          <option value="">Pilih pengrajin</option>
          {daftarPengrajin.map((p) => (
            <option key={p.id} value={p.id}>
              {labelPengrajin(p)}{p.is_active ? '' : ' (nonaktif)'}
            </option>
          ))}
        </select>
      </Bidang>

      <Controller
        control={control}
        name={n('category_id')}
        render={({ field }) => (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-navy-900">Kategori perhiasan <span className="text-gold-600">*</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {daftarKategori.map((k) => {
                const pilih = field.value === k.id
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={pilih}
                    onClick={() => field.onChange(k.id)}
                    className={cx(
                      'min-h-[48px] rounded-xl border px-3 py-2 text-sm font-bold tracking-wide transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      pilih ? 'border-gold-400 bg-navy-900 text-gold-200 shadow-sm' : 'border-ice-300 bg-white text-navy-800 hover:border-gold-300',
                    )}
                  >
                    {k.name}
                  </button>
                )
              })}
            </div>
            {galat('category_id') && <p role="alert" className="mt-1.5 text-sm text-bad-600">{galat('category_id')}</p>}
          </fieldset>
        )}
      />

      <div className={cx('grid gap-4', tampilJumlah && 'sm:grid-cols-2')}>
        <Controller
          control={control}
          name={n('gender')}
          render={({ field }) => (
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold text-navy-900">Gender <span className="text-gold-600">*</span></legend>
              <div className="grid grid-cols-2 gap-2">
                {(['LADY', 'MAN'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={field.value === g}
                    onClick={() => field.onChange(g)}
                    className={cx(
                      'h-11 rounded-xl border text-sm font-bold tracking-wider',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      field.value === g ? 'border-gold-400 bg-navy-900 text-gold-200' : 'border-ice-300 bg-white text-navy-800 hover:border-gold-300',
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {galat('gender') && <p role="alert" className="mt-1.5 text-sm text-bad-600">{galat('gender')}</p>}
            </fieldset>
          )}
        />
        {tampilJumlah && (
          <Controller
            control={control}
            name={n('quantity')}
            render={({ field }) => {
              const nilai = Number(field.value) || 0
              return (
                <Bidang label="Jumlah barang" id={id('quantity')} galat={galat('quantity')}>
                  <div className="flex h-11 items-stretch overflow-hidden rounded-xl border border-ice-300 bg-white">
                    <button type="button" aria-label="Kurangi" className="px-4 text-navy-900 hover:bg-ice-100 disabled:opacity-40"
                      disabled={nilai <= 1} onClick={() => field.onChange(Math.max(1, nilai - 1))}>
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      id={id('quantity')}
                      inputMode="numeric"
                      className="w-full border-x border-ice-200 text-center text-lg font-bold tabular-nums text-navy-900 focus:outline-none"
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                      onBlur={field.onBlur}
                    />
                    <button type="button" aria-label="Tambah" className="px-4 text-navy-900 hover:bg-ice-100 disabled:opacity-40"
                      disabled={nilai >= 100} onClick={() => field.onChange(Math.min(100, nilai + 1))}>
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </Bidang>
              )
            }}
          />
        )}
      </div>

      <Controller
        control={control}
        name={n('weight_grams')}
        render={({ field }) => {
          const angka = Number(String(field.value ?? '').replace(',', '.'))
          const sah = Number.isFinite(angka) && String(field.value ?? '').trim() !== ''
          const geser = (d: number) => {
            const dasar = sah ? angka : minBerat
            field.onChange(String(Math.max(minBerat, Math.round((dasar + d) * 10) / 10)).replace('.', ','))
          }
          const label = minBerat.toLocaleString('id-ID', { maximumFractionDigits: 2 })
          return (
            <Bidang label={tampilJumlah ? 'Berat per barang (gram)' : 'Berat barang (gram)'} id={id('weight_grams')} wajib galat={galat('weight_grams')}
              bantuan={`Minimal ${label} gram (bisa diubah di Pengaturan). Sudah terisi otomatis, tinggal disesuaikan bila perlu.`}>
              <div className={cx('flex h-11 max-w-xs items-stretch overflow-hidden rounded-xl border bg-white', galat('weight_grams') ? 'border-bad-600' : 'border-ice-300')}>
                <button type="button" aria-label="Kurangi 0,5 gram" className="px-4 text-navy-900 hover:bg-ice-100 disabled:opacity-40"
                  disabled={sah && angka <= minBerat} onClick={() => geser(-0.5)}>
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  id={id('weight_grams')}
                  inputMode="decimal"
                  className="w-full border-x border-ice-200 text-center text-lg font-bold tabular-nums text-navy-900 focus:outline-none"
                  value={field.value === undefined || field.value === null ? '' : String(field.value).replace('.', ',')}
                  onChange={(e) => field.onChange(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={field.onBlur}
                />
                <span className="grid place-items-center border-r border-ice-200 px-2 text-sm font-semibold text-ink-muted">g</span>
                <button type="button" aria-label="Tambah 0,5 gram" className="px-4 text-navy-900 hover:bg-ice-100" onClick={() => geser(0.5)}>
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </Bidang>
          )
        }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Bidang label="Tanggal diberikan ke pengrajin" id={id('assigned_date')} wajib galat={galat('assigned_date')}>
          <Isian id={id('assigned_date')} type="date" max={hariIni} salah={!!galat('assigned_date')} {...register(n('assigned_date'))} />
        </Bidang>
        <Bidang label="Mulai produksi" id={id('production_start_date')} galat={galat('production_start_date')} bantuan="Opsional.">
          <Isian id={id('production_start_date')} type="date" min={tanggal || undefined} max={hariIni} salah={!!galat('production_start_date')} {...register(n('production_start_date'))} />
        </Bidang>
      </div>

      <div className="rounded-xl bg-ice-50 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-soft">
            Bulan produksi:{' '}
            <strong className="text-navy-900">
              {koreksiBulan && bulanManual ? formatBulan(`${bulanManual}-01`) : formatBulan(tanggal)}
            </strong>
            {!koreksiBulan && <span className="text-ink-muted"> (otomatis dari tanggal diberikan)</span>}
          </p>
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 accent-navy-900"
              checked={koreksiBulan}
              onChange={(e) => {
                setKoreksiBulan(e.target.checked)
                setValue(n('production_month'), e.target.checked ? (tanggal || hariIni).slice(0, 7) : '', { shouldDirty: true })
              }}
            />
            Koreksi manual
          </label>
        </div>
        {koreksiBulan && (
          <div className="mt-2 max-w-xs">
            <Isian aria-label="Bulan produksi" type="month" {...register(n('production_month'))} />
          </div>
        )}
      </div>

      <Bidang label="Deskripsi barang" id={id('description')} galat={galat('description')}>
        <IsianPanjang id={id('description')} rows={2} placeholder="Contoh: cincin batu safir, ukuran 16" {...register(n('description'))} />
      </Bidang>
      <Bidang label="Catatan untuk pengrajin" id={id('notes')} galat={galat('notes')}>
        <IsianPanjang id={id('notes')} rows={2} {...register(n('notes'))} />
      </Bidang>
    </div>
  )
}
