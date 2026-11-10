import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { NAMA_BULAN, formatAngka } from '../lib/format'

const WARNA = { navy: '#16304F', emas: '#C9A96E', ice: '#8FB4D2', hijau: '#2F7D55', garis: '#E3ECF4', teks: '#7A8494' }

const gayaTooltip = {
  contentStyle: { borderRadius: 12, border: '1px solid #D7E6F2', boxShadow: '0 12px 40px rgba(10,20,34,.12)', fontSize: 13 },
  labelStyle: { color: '#0F1E33', fontWeight: 600 },
}

export interface TitikBulan { bulan: string; order_masuk: number; barang_masuk: number; barang_selesai: number; barang_diserahkan: number }

function labelBulan(b: string): string {
  const [y, m] = b.split('-')
  return `${NAMA_BULAN[Number(m) - 1]?.slice(0, 3) ?? ''} ${y.slice(2)}`
}

/** Grafik garis per bulan: barang masuk, selesai dikerjakan, dan diserahkan. */
export function GrafikBulanan({ data }: { data: TitikBulan[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gMasuk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={WARNA.emas} stopOpacity={0.35} />
            <stop offset="100%" stopColor={WARNA.emas} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={WARNA.garis} vertical={false} />
        <XAxis dataKey="bulan" tickFormatter={labelBulan} tick={{ fontSize: 11, fill: WARNA.teks }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: WARNA.teks }} axisLine={false} tickLine={false} />
        <Tooltip {...gayaTooltip} labelFormatter={(b) => labelBulan(String(b))} formatter={(v) => formatAngka(Number(v))} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="barang_masuk" name="Barang masuk" stroke={WARNA.emas} strokeWidth={2.4} fill="url(#gMasuk)" />
        <Area type="monotone" dataKey="barang_selesai" name="Selesai dikerjakan" stroke={WARNA.navy} strokeWidth={2} fill="none" />
        <Area type="monotone" dataKey="barang_diserahkan" name="Diserahkan" stroke={WARNA.hijau} strokeWidth={2} strokeDasharray="5 4" fill="none" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Donat: dalam proses, selesai belum diserahkan, sudah diserahkan. */
export function GrafikStatus({ dalamProses, selesai, diserahkan }: { dalamProses: number; selesai: number; diserahkan: number }) {
  const data = [
    { nama: 'Dalam proses', nilai: dalamProses, warna: WARNA.ice },
    { nama: 'Selesai, belum diserahkan', nilai: selesai, warna: WARNA.emas },
    { nama: 'Sudah diserahkan', nilai: diserahkan, warna: WARNA.hijau },
  ]
  const total = dalamProses + selesai + diserahkan
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={total ? data : [{ nama: 'Kosong', nilai: 1, warna: WARNA.garis }]} dataKey="nilai" nameKey="nama" innerRadius="62%" outerRadius="88%" paddingAngle={total ? 2 : 0} stroke="none">
            {(total ? data : [{ warna: WARNA.garis }]).map((d, i) => <Cell key={i} fill={d.warna} />)}
          </Pie>
          {total > 0 && <Tooltip {...gayaTooltip} formatter={(v) => formatAngka(Number(v))} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-ink-muted">Total barang</span>
        <span className="font-display text-4xl font-semibold text-navy-900">{formatAngka(total)}</span>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.nama} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-ink-soft"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.warna }} />{d.nama}</span>
            <span className="font-semibold tabular-nums text-navy-900">
              {formatAngka(d.nilai)} <span className="text-xs font-normal text-ink-muted">{total ? Math.round((d.nilai / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export interface TitikPengrajin { code: string; name: string | null; ditugaskan: number; selesai: number }

/** Batang produktivitas per pengrajin: barang diterima vs selesai dikerjakan dalam periode. */
export function GrafikProduktivitas({ data }: { data: TitikPengrajin[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={WARNA.garis} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: WARNA.teks }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="code" width={62} tick={{ fontSize: 11, fill: '#0F1E33', fontWeight: 600 }} axisLine={false} tickLine={false} />
        <Tooltip {...gayaTooltip} labelFormatter={(c) => { const p = data.find((d) => d.code === c); return p?.name ? `${c} · ${p.name}` : String(c) }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="ditugaskan" name="Diterima" fill={WARNA.ice} radius={[0, 6, 6, 0]} barSize={10} />
        <Bar dataKey="selesai" name="Selesai dikerjakan" fill={WARNA.emas} radius={[0, 6, 6, 0]} barSize={10} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface TitikKategori { kategori: string; LADY: number; MAN: number }

export function GrafikKategori({ data }: { data: TitikKategori[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={WARNA.garis} vertical={false} />
        <XAxis dataKey="kategori" tick={{ fontSize: 10, fill: WARNA.teks }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: WARNA.teks }} axisLine={false} tickLine={false} />
        <Tooltip {...gayaTooltip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="LADY" stackId="g" fill={WARNA.emas} />
        <Bar dataKey="MAN" stackId="g" fill={WARNA.navy} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
