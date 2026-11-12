import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowDown, ArrowUp, Database, ImageUp, Plus, Trash2, Users } from 'lucide-react'
import { db } from '../lib/supabase'
import { pesanGalat } from '../lib/errors'
import { ZONA_WAKTU, formatTanggalWaktu, tglLokal } from '../lib/format'
import { normalisasiWa, tampilkanWa, waValid } from '../lib/wa'
import { PENANDA, TEMPLATE_BAWAAN } from '../lib/waTemplate'
import { buatCsv } from '../lib/laporan'
import { unduh } from '../lib/unduh'
import type { Barang, Kategori, Pengaturan as TPengaturan } from '../lib/types'
import { useAuth } from '../auth/AuthProvider'
import { useSinkron } from '../sync/SyncProvider'
import { useMaster } from '../sync/useMaster'
import { useNotifikasi } from '../components/ui/Notifikasi'
import { Bidang, Isian, IsianPanjang, Kartu, KepalaHalaman, LencanaAktif, Pemuat, Tombol, cx } from '../components/ui/ui'
import { aturMusik, aturSfx, musikAktif, sfxAktif } from '../lib/suara'
import { animasiPembukaAktif, aturAnimasiPembuka, aturTema, temaAktif, type Tema } from '../components/animasi/pengaturanAnimasi'

function Bagian({ judul, sub, children }: { judul: string; sub?: string; children: ReactNode }) {
  return (
    <Kartu className="p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold text-navy-900">{judul}</h2>
      {sub && <p className="mt-0.5 text-sm text-ink-soft">{sub}</p>}
      <div className="mt-4">{children}</div>
    </Kartu>
  )
}

const skemaUsaha = z.object({
  business_name: z.string().trim().min(1, 'Nama usaha wajib diisi').max(80),
  tagline: z.string().trim().max(80),
  business_address: z.string().max(300).optional(),
  business_whatsapp: z.string().optional().refine((v) => !v || !v.trim() || waValid(v), 'Nomor WhatsApp tidak valid'),
  timezone: z.string(),
  date_format: z.enum(['dd MMMM yyyy', 'dd/MM/yyyy']),
  receipt_paper: z.enum(['A4', 'A5', '80mm', '58mm']),
  min_weight_grams: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : Number(v.replace(',', '.'))) : v),
    z.number({ required_error: 'Isi berat minimal', invalid_type_error: 'Berat harus angka, contoh 6' })
      .gt(0, 'Harus lebih dari 0').max(1000, 'Maksimal 1000 gram'),
  ),
  receipt_show_signature: z.boolean(),
  receipt_footer: z.string().max(300),
  wa_template_proses: z.string().trim().min(1, 'Template tidak boleh kosong').max(2000),
  wa_template_selesai: z.string().trim().min(1, 'Template tidak boleh kosong').max(2000),
  wa_template_diserahkan: z.string().trim().min(1, 'Template tidak boleh kosong').max(2000),
})
type DataUsaha = z.output<typeof skemaUsaha>
type MasukanUsaha = z.input<typeof skemaUsaha>

function FormUsaha({ p }: { p: TPengaturan }) {
  const { beri } = useNotifikasi()
  const [galat, setGalat] = useState<string | null>(null)
  const awal = (): MasukanUsaha => ({
    business_name: p.business_name, tagline: p.tagline, business_address: p.business_address ?? '',
    business_whatsapp: p.business_whatsapp ? tampilkanWa(p.business_whatsapp) : '', timezone: p.timezone,
    date_format: p.date_format === 'dd/MM/yyyy' ? 'dd/MM/yyyy' : 'dd MMMM yyyy', receipt_paper: p.receipt_paper,
    min_weight_grams: String(Number(p.min_weight_grams ?? 6)).replace('.', ','),
    receipt_show_signature: p.receipt_show_signature, receipt_footer: p.receipt_footer,
    wa_template_proses: p.wa_template_proses, wa_template_selesai: p.wa_template_selesai, wa_template_diserahkan: p.wa_template_diserahkan,
  })
  const { register, handleSubmit, formState, reset, setValue } = useForm<MasukanUsaha, unknown, DataUsaha>({ resolver: zodResolver(skemaUsaha), defaultValues: awal() })
  const sudahDiisi = useRef(false)
  useEffect(() => {
    // Isi ulang dari database hanya bila formulir belum diubah (supaya ketikan tidak tertimpa sinkronisasi).
    if (!sudahDiisi.current || !formState.isDirty) { reset(awal()); sudahDiisi.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.updated_at])

  const simpan = handleSubmit(async (d) => {
    setGalat(null)
    try {
      const { error } = await db().from('app_settings').update({
        ...d,
        business_address: d.business_address?.trim() || null,
        business_whatsapp: d.business_whatsapp?.trim() ? normalisasiWa(d.business_whatsapp) : null,
      }).eq('id', 1)
      if (error) throw error
      reset({ ...d, min_weight_grams: String(d.min_weight_grams).replace('.', ',') })
      beri('Pengaturan disimpan.')
    } catch (e) {
      setGalat(pesanGalat(e))
    }
  })
  const e = formState.errors
  const kelasPilih = 'h-11 w-full rounded-xl border border-ice-300 bg-white px-3 text-[15px]'
  return (
    <form onSubmit={simpan} noValidate className="space-y-6">
      <Bagian judul="Identitas usaha" sub="Tampil di aplikasi, nota, dan laporan.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Bidang label="Nama usaha" id="s-nama" wajib galat={e.business_name?.message}><Isian id="s-nama" {...register('business_name')} /></Bidang>
          <Bidang label="Tagline" id="s-tag"><Isian id="s-tag" {...register('tagline')} /></Bidang>
          <Bidang label="WhatsApp usaha" id="s-wa" galat={e.business_whatsapp?.message}><Isian id="s-wa" type="tel" inputMode="tel" {...register('business_whatsapp')} /></Bidang>
          <Bidang label="Alamat usaha" id="s-alamat"><IsianPanjang id="s-alamat" rows={2} className="min-h-[44px]" {...register('business_address')} /></Bidang>
        </div>
      </Bagian>

      <Bagian judul="Tanggal dan zona waktu" sub="Menentukan kapan sebuah tanggal dimulai, untuk statistik dan nota.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Bidang label="Zona waktu usaha" id="s-zona">
            <select id="s-zona" className={kelasPilih} {...register('timezone')}>{ZONA_WAKTU.map((z) => <option key={z.nilai} value={z.nilai}>{z.label}</option>)}</select>
          </Bidang>
          <Bidang label="Format tanggal" id="s-format">
            <select id="s-format" className={kelasPilih} {...register('date_format')}>
              <option value="dd MMMM yyyy">03 September 2026</option>
              <option value="dd/MM/yyyy">03/09/2026</option>
            </select>
          </Bidang>
        </div>
      </Bagian>

      <Bagian judul="Order" sub="Aturan saat memasukkan order baru.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Bidang label="Berat minimal per barang (gram)" id="s-berat" galat={e.min_weight_grams?.message}
            bantuan="Otomatis terisi di setiap barang baru. Berat di bawah angka ini ditolak.">
            <Isian id="s-berat" inputMode="decimal" {...register('min_weight_grams')} />
          </Bidang>
        </div>
      </Bagian>

      <Bagian judul="Nota" sub="Nota pengrajin dan nota serah terima.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Bidang label="Ukuran kertas bawaan" id="s-kertas" bantuan="Bisa diganti di halaman cetak.">
            <select id="s-kertas" className={kelasPilih} {...register('receipt_paper')}>
              <option value="A4">A4</option><option value="A5">A5 (setengah A4)</option><option value="80mm">Printer thermal 80 mm</option><option value="58mm">Printer thermal 58 mm</option>
            </select>
          </Bidang>
          <label className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-navy-900">
            <input type="checkbox" className="h-4 w-4 accent-navy-900" {...register('receipt_show_signature')} /> Tampilkan kolom tanda tangan
          </label>
        </div>
        <div className="mt-4"><Bidang label="Kalimat penutup nota" id="s-kaki"><IsianPanjang id="s-kaki" rows={2} {...register('receipt_footer')} /></Bidang></div>
      </Bagian>

      <Bagian judul="Pesan WhatsApp" sub={`Penanda yang bisa dipakai: ${PENANDA.join(' ')}`}>
        <div className="space-y-4">
          {([['wa_template_proses', 'Saat dalam proses', 'proses'], ['wa_template_selesai', 'Saat selesai dikerjakan', 'selesai'], ['wa_template_diserahkan', 'Saat sudah diserahkan', 'diserahkan']] as const).map(([k, label, j]) => (
            <Bidang key={k} label={label} id={`s-${k}`} galat={e[k]?.message}>
              <IsianPanjang id={`s-${k}`} rows={7} className="font-mono text-sm" {...register(k)} />
              <button type="button" className="text-xs font-semibold text-gold-600" onClick={() => setValue(k, TEMPLATE_BAWAAN[j], { shouldDirty: true })}>Kembalikan ke bawaan</button>
            </Bidang>
          ))}
        </div>
      </Bagian>

      {galat && <p role="alert" className="rounded-xl bg-bad-50 p-3 text-sm text-bad-700">{galat}</p>}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex justify-end lg:bottom-4">
        <Tombol type="submit" memuat={formState.isSubmitting} disabled={!formState.isDirty} className="shadow-pop">Simpan pengaturan</Tombol>
      </div>
    </form>
  )
}

function Logo({ p }: { p: TPengaturan }) {
  const { beri } = useNotifikasi()
  const [url, setUrl] = useState<string | null>(null)
  const [proses, setProses] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let aktif = true
    if (!p.logo_path) { setUrl(null); return }
    db().storage.from('identitas').createSignedUrl(p.logo_path, 3600).then(({ data }) => { if (aktif) setUrl(data?.signedUrl ?? null) })
    return () => { aktif = false }
  }, [p.logo_path])

  const pilih = async (f: File | undefined) => {
    if (!f) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) { beri('Gunakan gambar PNG, JPG, WEBP, atau SVG.', 'galat'); return }
    if (f.size > 2 * 1024 * 1024) { beri('Ukuran logo maksimal 2 MB.', 'galat'); return }
    setProses(true)
    try {
      const ext = f.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `logo/logo-${Date.now()}.${ext}`
      const up = await db().storage.from('identitas').upload(path, f, { contentType: f.type, upsert: false })
      if (up.error) throw up.error
      const { error } = await db().from('app_settings').update({ logo_path: path }).eq('id', 1)
      if (error) throw error
      if (p.logo_path) await db().storage.from('identitas').remove([p.logo_path])
      beri('Logo diganti.')
    } catch (e) {
      beri(pesanGalat(e), 'galat')
    } finally {
      setProses(false)
      if (input.current) input.current.value = ''
    }
  }
  const hapus = async () => {
    setProses(true)
    try {
      const { error } = await db().from('app_settings').update({ logo_path: null }).eq('id', 1)
      if (error) throw error
      if (p.logo_path) await db().storage.from('identitas').remove([p.logo_path])
      beri('Logo dihapus. Nota memakai logo resmi IDS.')
    } catch (e) { beri(pesanGalat(e), 'galat') } finally { setProses(false) }
  }
  return (
    <Bagian judul="Logo" sub="Dipakai di nota. Bila kosong, nota memakai logo resmi IDS.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-ice-300 bg-ice-50">
          {url ? <img src={url} alt="Logo usaha" className="h-full w-full object-contain" /> : <span className="text-xs text-ink-muted">Belum ada</span>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void pilih(e.target.files?.[0])} />
        <Tombol ragam="kedua" ikon={<ImageUp className="h-4 w-4" />} memuat={proses} onClick={() => input.current?.click()}>Unggah logo</Tombol>
        {p.logo_path && <Tombol ragam="hantu" ikon={<Trash2 className="h-4 w-4" />} disabled={proses} onClick={hapus}>Hapus</Tombol>}
      </div>
    </Bagian>
  )
}

function KelolaKategori() {
  const master = useMaster()
  const { beri } = useNotifikasi()
  const [baru, setBaru] = useState('')
  const [ubah, setUbah] = useState<Record<string, string>>({})
  const [proses, setProses] = useState(false)
  const daftar: Kategori[] = master.data?.kategori ?? []

  const jalankan = async (f: () => PromiseLike<{ error: unknown }>, pesan: string) => {
    setProses(true)
    try {
      const { error } = await f()
      if (error) throw error
      beri(pesan)
      master.muatUlang()
    } catch (e) { beri(pesanGalat(e), 'galat') } finally { setProses(false) }
  }
  const tukar = async (i: number, j: number) => {
    const a = daftar[i], b = daftar[j]
    if (!a || !b) return
    setProses(true)
    try {
      const r1 = await db().from('jewelry_categories').update({ sort_order: b.sort_order === a.sort_order ? a.sort_order + (j > i ? 1 : -1) : b.sort_order }).eq('id', a.id)
      if (r1.error) throw r1.error
      const r2 = await db().from('jewelry_categories').update({ sort_order: a.sort_order }).eq('id', b.id)
      if (r2.error) throw r2.error
      master.muatUlang()
    } catch (e) { beri(pesanGalat(e), 'galat') } finally { setProses(false) }
  }

  return (
    <Bagian judul="Kategori perhiasan" sub="Ganti nama atau nonaktifkan tanpa merusak order lama. Kategori tidak bisa dihapus.">
      {!master.data ? <Pemuat /> : (
        <ul className="divide-y divide-ice-100 rounded-xl border border-ice-200">
          {daftar.map((k, i) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="flex flex-col">
                <button type="button" aria-label="Naikkan" disabled={proses || i === 0} onClick={() => void tukar(i, i - 1)} className="text-ink-muted hover:text-navy-900 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="Turunkan" disabled={proses || i === daftar.length - 1} onClick={() => void tukar(i, i + 1)} className="text-ink-muted hover:text-navy-900 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              </div>
              {k.id in ubah ? (
                <>
                  <Isian aria-label="Nama kategori" className="h-9 w-48 uppercase" value={ubah[k.id]} onChange={(e) => setUbah({ ...ubah, [k.id]: e.target.value })} />
                  <Tombol kecil disabled={proses || !ubah[k.id].trim()} onClick={() => void jalankan(() => db().from('jewelry_categories').update({ name: ubah[k.id] }).eq('id', k.id), 'Nama kategori diganti.').then(() => { const u = { ...ubah }; delete u[k.id]; setUbah(u) })}>Simpan</Tombol>
                  <Tombol kecil ragam="hantu" onClick={() => { const u = { ...ubah }; delete u[k.id]; setUbah(u) }}>Batal</Tombol>
                </>
              ) : (
                <>
                  <span className={cx('flex-1 font-bold tracking-wide', k.is_active ? 'text-navy-900' : 'text-ink-muted line-through')}>{k.name}</span>
                  <LencanaAktif aktif={k.is_active} />
                  <Tombol kecil ragam="hantu" onClick={() => setUbah({ ...ubah, [k.id]: k.name })}>Ganti nama</Tombol>
                  <Tombol kecil ragam="kedua" disabled={proses} onClick={() => void jalankan(() => db().from('jewelry_categories').update({ is_active: !k.is_active }).eq('id', k.id), k.is_active ? `${k.name} dinonaktifkan.` : `${k.name} diaktifkan.`)}>
                    {k.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                  </Tombol>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="mt-3 flex gap-2" onSubmit={(e) => {
        e.preventDefault()
        if (!baru.trim()) return
        const urut = Math.max(0, ...daftar.map((k) => k.sort_order)) + 1
        void jalankan(() => db().from('jewelry_categories').insert({ name: baru, sort_order: urut }), `Kategori ${baru.toUpperCase()} ditambahkan.`).then(() => setBaru(''))
      }}>
        <Isian aria-label="Kategori baru" placeholder="Nama kategori baru" className="uppercase" value={baru} onChange={(e) => setBaru(e.target.value)} />
        <Tombol type="submit" ikon={<Plus className="h-4 w-4" />} disabled={proses || !baru.trim()}>Tambah</Tombol>
      </form>
    </Bagian>
  )
}

function Profil() {
  const { email } = useAuth()
  const { beri } = useNotifikasi()
  const [nama, setNama] = useState('')
  const [sandi, setSandi] = useState('')
  const [ulangi, setUlangi] = useState('')
  const [proses, setProses] = useState(false)
  useEffect(() => {
    void (async () => {
      const { data: u } = await db().auth.getUser()
      if (!u.user) return
      const { data } = await db().from('profiles').select('full_name').eq('id', u.user.id).maybeSingle()
      setNama((data as { full_name: string | null } | null)?.full_name ?? '')
    })()
  }, [])
  const galatSandi = sandi && sandi.length < 8 ? 'Minimal 8 karakter' : ulangi && sandi !== ulangi ? 'Kata sandi tidak sama' : null
  return (
    <Bagian judul="Profil administrator" sub={`Masuk sebagai ${email ?? '-'}`}>
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          setProses(true)
          try {
            const { data } = await db().auth.getUser()
            const { error } = await db().from('profiles').update({ full_name: nama.trim() || null }).eq('id', data.user?.id ?? '')
            if (error) throw error
            beri('Nama disimpan.')
          } catch (er) { beri(pesanGalat(er), 'galat') } finally { setProses(false) }
        }}>
          <Bidang label="Nama tampilan" id="p-nama"><Isian id="p-nama" value={nama} onChange={(e) => setNama(e.target.value)} /></Bidang>
          <Tombol type="submit" ragam="kedua" memuat={proses}>Simpan nama</Tombol>
        </form>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault()
          if (galatSandi || !sandi) return
          setProses(true)
          try {
            const { error } = await db().auth.updateUser({ password: sandi })
            if (error) throw error
            setSandi(''); setUlangi('')
            beri('Kata sandi diganti.')
          } catch (er) { beri(pesanGalat(er), 'galat') } finally { setProses(false) }
        }}>
          <Bidang label="Kata sandi baru" id="p-sandi"><Isian id="p-sandi" type="password" autoComplete="new-password" value={sandi} onChange={(e) => setSandi(e.target.value)} /></Bidang>
          <Bidang label="Ulangi kata sandi" id="p-ulangi" galat={galatSandi ?? undefined}><Isian id="p-ulangi" type="password" autoComplete="new-password" value={ulangi} onChange={(e) => setUlangi(e.target.value)} salah={!!galatSandi} /></Bidang>
          <Tombol type="submit" ragam="kedua" memuat={proses} disabled={!sandi || !!galatSandi}>Ganti kata sandi</Tombol>
        </form>
      </div>
    </Bagian>
  )
}

const PILIHAN_TEMA: { nilai: Tema; judul: string; isi: string; contoh: string }[] = [
  { nilai: 'glass', judul: 'Glass', isi: 'Kaca bening dengan emas, biru langit, putih, dan hitam.', contoh: 'bg-[radial-gradient(circle_at_20%_20%,#BFE3FA,transparent_55%),radial-gradient(circle_at_85%_30%,#E8D3A9,transparent_50%),linear-gradient(#F7FBFF,#EAF4FC)]' },
  { nilai: 'klasik', judul: 'Klasik', isi: 'Putih bersih dengan menu navy.', contoh: 'bg-ice-50' },
]

function Tampilan() {
  const [pembuka, setPembuka] = useState(animasiPembukaAktif)
  const [tema, setTema] = useState<Tema>(temaAktif)
  const [musik, setMusik] = useState(musikAktif)
  const [sfx, setSfx] = useState(sfxAktif)
  return (
    <Bagian judul="Tampilan dan animasi" sub="Berlaku untuk perangkat ini saja. Animasi otomatis mati bila perangkat diatur untuk mengurangi gerakan.">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-navy-900">Tema</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {PILIHAN_TEMA.map((t) => (
              <label key={t.nilai} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-colors', tema === t.nilai ? 'border-gold-400 bg-gold-50/60' : 'border-ice-200 hover:border-ice-300')}>
                <input type="radio" name="tema" className="sr-only" checked={tema === t.nilai} onChange={() => { setTema(t.nilai); aturTema(t.nilai) }} />
                <span className={cx('relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-ice-200', t.contoh)} aria-hidden>
                  <span className={cx('absolute inset-y-0 left-0 w-5', t.nilai === 'glass' ? 'bg-black/80' : 'bg-navy-900')} />
                  <span className={cx('absolute left-7 top-2 h-4 w-10 rounded', t.nilai === 'glass' ? 'border border-white/80 bg-white/60' : 'border border-ice-200 bg-white')} />
                  <span className={cx('absolute left-7 top-8 h-4 w-10 rounded', t.nilai === 'glass' ? 'border border-white/80 bg-white/60' : 'border border-ice-200 bg-white')} />
                  <span className="absolute left-1.5 top-2 h-2 w-2 rotate-45 bg-gold-400" />
                </span>
                <span><span className="block font-semibold text-navy-900">{t.judul}</span><span className="text-sm text-ink-soft">{t.isi}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-ice-50 px-4 py-3">
          <span><span className="block font-semibold text-navy-900">Animasi pembuka</span><span className="text-sm text-ink-soft">Logo IDS di atas kaca, huruf muncul satu per satu saat aplikasi dibuka, sekali per sesi.</span></span>
          <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={pembuka} onChange={(e) => { setPembuka(e.target.checked); aturAnimasiPembuka(e.target.checked) }} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-ice-50 px-4 py-3">
          <span><span className="block font-semibold text-navy-900">Efek suara pembuka</span><span className="text-sm text-ink-soft">Denting dan kilau yang mengikuti animasi pembuka. Bila menyala, pembuka menunggu satu ketukan karena HP baru mengizinkan suara setelah layar disentuh.</span></span>
          <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={sfx} onChange={(e) => { setSfx(e.target.checked); aturSfx(e.target.checked) }} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-ice-50 px-4 py-3">
          <span><span className="block font-semibold text-navy-900">Musik latar halaman depan</span><span className="text-sm text-ink-soft">Diputar berulang selama Anda di Beranda, berhenti saat pindah halaman. Bisa juga dimatikan lewat ikon pengeras suara di Beranda.</span></span>
          <input type="checkbox" className="h-5 w-5 accent-navy-900" checked={musik} onChange={(e) => { setMusik(e.target.checked); aturMusik(e.target.checked) }} />
        </label>
      </div>
    </Bagian>
  )
}

function Cadangan() {
  const { zona } = useSinkron()
  const { beri } = useNotifikasi()
  const [proses, setProses] = useState(false)
  const unduhSemua = async () => {
    setProses(true)
    try {
      const semua: Barang[] = []
      for (let dari = 0; dari < 100000; dari += 1000) {
        const { data, error } = await db().from('v_items').select('*').order('created_at').range(dari, dari + 999)
        if (error) throw error
        semua.push(...(data as Barang[]))
        if ((data as Barang[]).length < 1000) break
      }
      const tgl = tglLokal(new Date(), zona)
      unduh(new Blob([buatCsv(
        ['Nomor order', 'Barang ke', 'Pelanggan', 'WhatsApp', 'Catatan barang', 'ID pengrajin', 'Pengrajin', 'Kategori', 'Gender', 'Deskripsi', 'Diberikan', 'Bulan produksi', 'Mulai produksi', 'Status', 'Selesai', 'Diserahkan', 'Barang dibatalkan', 'Alasan batal', 'Order dibatalkan'],
        semua.map((b) => [b.order_number, b.item_no, b.customer_name, b.customer_whatsapp ?? '', b.notes ?? '', b.craftsman_code, b.craftsman_name ?? '', b.category_name, b.gender, b.description ?? '',
          b.assigned_date, b.production_month.slice(0, 7), b.production_start_date ?? '', b.status_label, formatTanggalWaktu(b.completed_at, zona), formatTanggalWaktu(b.delivered_at, zona),
          b.cancelled_at ? formatTanggalWaktu(b.cancelled_at, zona) : '', b.cancel_reason ?? '', b.order_cancelled_at ? formatTanggalWaktu(b.order_cancelled_at, zona) : '']),
      )], { type: 'text/csv;charset=utf-8' }), `ids-cadangan-${tgl}.csv`)
      beri(`Cadangan ${semua.length} barang diunduh.`)
    } catch (e) { beri(pesanGalat(e), 'galat') } finally { setProses(false) }
  }
  return (
    <Bagian judul="Cadangan data" sub="Unduh semua order dan barang (termasuk yang dibatalkan) sebagai file Excel CSV. Simpan di Google Drive atau email Anda secara rutin, misalnya tiap minggu.">
      <Tombol ragam="kedua" ikon={<Database className="h-4 w-4" />} memuat={proses} onClick={unduhSemua}>Unduh cadangan CSV</Tombol>
    </Bagian>
  )
}

export default function Pengaturan() {
  const { pengaturan } = useSinkron()
  return (
    <>
      <KepalaHalaman judul="Pengaturan" />
      <div className="space-y-6">
        {!pengaturan ? <Pemuat /> : (
          <>
            <Logo p={pengaturan} />
            <FormUsaha p={pengaturan} />
          </>
        )}
        <KelolaKategori />
        <Bagian judul="Pengrajin" sub="Tambah, ubah, aktifkan, dan nonaktifkan pengrajin.">
          <Link to="/pengrajin" className="inline-flex h-11 items-center gap-2 rounded-xl border border-gold-300 bg-white px-5 font-semibold text-navy-900 hover:bg-gold-50"><Users className="h-4 w-4" /> Kelola pengrajin</Link>
        </Bagian>
        <Profil />
        <Tampilan />
        <Cadangan />
      </div>
    </>
  )
}
