import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BarChart3, Boxes, Coins, Gem, History, LayoutDashboard, LogOut, MoreHorizontal, Receipt, Search, Settings, Trash2, Users, Volume2, VolumeX, WifiOff, X,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useSinkron, type StatusSinkron } from '../../sync/SyncProvider'
import { formatTanggalPanjang, hariIni } from '../../lib/format'
import { Logo } from './Logo'
import { BingkaiPerak } from './BingkaiPerak'
import { Konfirmasi } from '../ui/Dialog'
import { Pemuat, cx } from '../ui/ui'
import { Pembuka } from '../animasi/Pembuka'
import { LampuSorot } from '../animasi/LampuSorot'
import { perluPembuka } from '../animasi/pengaturanAnimasi'
import { aturMusik, hentikanMusik, mainMusik, musikAktif } from '../../lib/suara'

const MENU = [
  { ke: '/beranda', label: 'Beranda', Ikon: LayoutDashboard },
  { ke: '/order', label: 'Order', Ikon: Gem },
  { ke: '/nota', label: 'Nota', Ikon: Receipt },
  { ke: '/pengrajin', label: 'Pengrajin', Ikon: Users },
  { ke: '/stok', label: 'Stok barang', Ikon: Boxes },
  { ke: '/barang', label: 'Cari barang', Ikon: Search },
  { ke: '/perak', label: 'Stok perak', Ikon: Coins },
  { ke: '/laporan', label: 'Laporan', Ikon: BarChart3 },
  { ke: '/riwayat', label: 'Riwayat', Ikon: History },
  { ke: '/sampah', label: 'Sampah', Ikon: Trash2 },
  { ke: '/pengaturan', label: 'Pengaturan', Ikon: Settings },
]
const MENU_BAWAH = MENU.slice(0, 4)
const MENU_LAIN = MENU.slice(4)

const LABEL_SINKRON: Record<StatusSinkron, string> = {
  tersinkron: 'Tersinkron',
  menghubungkan: 'Menghubungkan...',
  offline: 'Offline',
  terputus: 'Sinkron terputus',
}

function PenandaSinkron({ terang }: { terang?: boolean }) {
  const { status } = useSinkron()
  const warna = status === 'tersinkron' ? 'bg-ok-600' : status === 'menghubungkan' ? 'bg-gold-400 animate-pulse' : 'bg-bad-600'
  return (
    <span className={cx('inline-flex items-center gap-2 text-xs font-semibold', terang ? 'text-ice-200' : 'text-ink-soft')}
      title="Perubahan dari perangkat lain muncul otomatis saat tersinkron">
      <span className={cx('h-2 w-2 rounded-full', warna)} aria-hidden />
      {LABEL_SINKRON[status]}
    </span>
  )
}

/** Tombol nyalakan/matikan musik latar. Hanya tampil di halaman depan. */
function TombolMusik({ nyala, ubah }: { nyala: boolean; ubah: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => ubah(!nyala)} aria-pressed={nyala}
      aria-label={nyala ? 'Matikan musik latar' : 'Nyalakan musik latar'} title={nyala ? 'Matikan musik latar' : 'Nyalakan musik latar'}
      className="grid h-9 w-9 place-items-center rounded-full text-navy-800 hover:bg-ice-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
      {nyala ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5 text-ink-muted" aria-hidden />}
    </button>
  )
}

function CariAtas() {
  const navigasi = useNavigate()
  const [q, setQ] = useState('')
  const kirim = (e: FormEvent) => {
    e.preventDefault()
    navigasi(q.trim() ? `/barang?q=${encodeURIComponent(q.trim())}` : '/barang')
    setQ('')
  }
  return (
    <form onSubmit={kirim} className="relative w-full max-w-md" role="search">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        aria-label="Cari order, pelanggan, pengrajin"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari nomor order, pelanggan, pengrajin..."
        className="h-10 w-full rounded-xl border border-ice-300 bg-white pl-10 pr-3 text-sm focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-300"
      />
    </form>
  )
}

export function AppLayout() {
  const { email, keluar } = useAuth()
  const { status, zona } = useSinkron()
  const lokasi = useLocation()
  const [tanyaKeluar, setTanyaKeluar] = useState(false)
  const [lainnya, setLainnya] = useState(false)
  const gerakHalus = useReducedMotion() ?? false
  const [pembuka, setPembuka] = useState(perluPembuka)
  const kunciHalaman = lokasi.pathname.split('/').slice(0, 2).join('/')

  // Musik latar: mulai setelah animasi pembuka dan terus berjalan di semua halaman.
  const [musik, setMusik] = useState(musikAktif)
  useEffect(() => {
    if (!pembuka && musik) mainMusik()
    else hentikanMusik()
  }, [pembuka, musik])
  useEffect(() => () => hentikanMusik(), [])
  const ubahMusik = (v: boolean) => { aturMusik(v); setMusik(v) }

  return (
    <div className="latar-app min-h-dvh bg-ice-50 lg:pl-64 print:pl-0">
      <LampuSorot />
      {pembuka && <Pembuka selesai={() => setPembuka(false)} />}

      {/* Sidebar komputer */}
      <motion.aside
        className="kaca-gelap sidebar-ids fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 text-white print:hidden lg:flex"
        initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.5, delay: pembuka ? 4.2 : 0, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="px-4 pb-5 pt-6">
          <BingkaiPerak latar="var(--latar-menu)">
            <div className="px-3 py-3"><Logo /></div>
          </BingkaiPerak>
          <p className="mt-3 text-[10px] font-semibold tracking-[0.2em] text-ice-400">SMART JEWELRY MANAGEMENT</p>
        </div>
        <div className="mx-6 h-px bg-gradient-to-r from-gold-400/60 via-gold-400/20 to-transparent" />
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Menu utama">
          {MENU.map(({ ke, label, Ikon }) => (
            <NavLink key={ke} to={ke}
              className={({ isActive }) => cx(
                'menu-cair group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors duration-300',
                isActive ? 'aktif text-white ring-1 ring-gold-400/40' : 'text-ice-200',
              )}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="penanda-menu" className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-gold-400" />}
                  <Ikon className="h-5 w-5" aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/10 px-6 py-5">
          <p className="truncate text-sm text-ice-200" title={email ?? ''}>{email}</p>
          <button type="button" onClick={() => setTanyaKeluar(true)} className="inline-flex items-center gap-2 text-sm font-semibold text-gold-300 hover:text-gold-200">
            <LogOut className="h-4 w-4" aria-hidden /> Keluar
          </button>
        </div>
      </motion.aside>

      {/* Bilah atas komputer */}
      <header className="kaca-bilah sticky top-0 z-20 hidden items-center gap-4 border-b border-ice-200 bg-white/85 px-10 py-3 backdrop-blur print:hidden lg:flex">
        <CariAtas />
        <span className="ml-auto text-sm text-ink-soft">{formatTanggalPanjang(hariIni(zona))}</span>
        <TombolMusik nyala={musik} ubah={ubahMusik} />
        <PenandaSinkron />
      </header>

      {/* Kepala HP */}
      <header className="kaca-bilah sticky top-0 z-30 flex items-center justify-between border-b border-ice-200 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur print:hidden lg:hidden">
        <BingkaiPerak latar="var(--latar-kepala)" kecil>
          <div className="px-2.5 py-1.5"><Logo terang={false} kecil /></div>
        </BingkaiPerak>
        <span className="flex items-center gap-2">
          <TombolMusik nyala={musik} ubah={ubahMusik} />
          <PenandaSinkron />
        </span>
      </header>

      {status === 'offline' && (
        <div role="status" className="flex items-center gap-2 bg-gold-100 px-4 py-2 text-sm text-gold-700 print:hidden lg:px-10">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          Anda sedang offline. Data yang tampil mungkin belum terbaru dan perubahan belum bisa disimpan.
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl overflow-x-clip px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8 print:overflow-visible print:p-0">
        {/* Transisi halaman sinematik: halaman baru masuk dari sedikit lebih besar dan buram, lalu tajam. */}
        <motion.div
          key={kunciHalaman}
          style={{ transformOrigin: '50% 0%' }}
          initial={gerakHalus ? { opacity: 0 } : { opacity: 0, scale: 1.08, filter: 'blur(10px)' }}
          animate={gerakHalus
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
          transition={{ duration: gerakHalus ? 0.2 : 0.8, ease: [0.645, 0.045, 0.355, 1], opacity: { duration: gerakHalus ? 0.2 : 0.5, ease: 'easeOut' } }}
        >
          <Suspense fallback={<Pemuat />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>

      {/* Navigasi bawah HP */}
      <nav aria-label="Menu utama" className="kaca-bilah fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-ice-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:hidden">
        {MENU_BAWAH.map(({ ke, label, Ikon }) => (
          <NavLink key={ke} to={ke} className={({ isActive }) => cx('menu-cair flex min-w-[64px] rounded-2xl flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold', isActive ? 'text-navy-900' : 'text-ink-muted')}>
            {({ isActive }) => (
              <>
                <span className="relative rounded-full px-4 py-1">
                  {isActive && <motion.span layoutId="penanda-bawah" className="absolute inset-0 rounded-full bg-gold-100" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
                  <Ikon className="relative h-5 w-5" aria-hidden />
                </span>
                {label === 'Cari barang' ? 'Cari' : label}
              </>
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setLainnya(true)} className={cx('flex min-w-[64px] flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-semibold',
          MENU_LAIN.some((m) => lokasi.pathname.startsWith(m.ke)) ? 'text-navy-900' : 'text-ink-muted')}>
          <span className="rounded-full px-4 py-1"><MoreHorizontal className="h-5 w-5" aria-hidden /></span>
          Lainnya
        </button>
      </nav>

      {/* Lembar "Lainnya" HP */}
      <AnimatePresence>
        {lainnya && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div className="absolute inset-0 bg-navy-950/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setLainnya(false)} />
            <motion.div role="dialog" aria-modal="true" aria-label="Menu lainnya"
              className="kaca-kuat absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-pop"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="truncate text-sm text-ink-soft">{email}</p>
                <button type="button" aria-label="Tutup" onClick={() => setLainnya(false)} className="rounded-full p-2 hover:bg-ice-100"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MENU_LAIN.map(({ ke, label, Ikon }) => (
                  <NavLink key={ke} to={ke} onClick={() => setLainnya(false)}
                    className={({ isActive }) => cx('menu-cair flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm font-semibold', isActive ? 'aktif border-gold-400' : 'border-ice-200 text-navy-800')}>
                    <Ikon className="h-6 w-6" aria-hidden /> {label}
                  </NavLink>
                ))}
              </div>
              <button type="button" onClick={() => { setLainnya(false); setTanyaKeluar(true) }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-bad-600/20 py-3 text-sm font-semibold text-bad-700">
                <LogOut className="h-4 w-4" /> Keluar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Konfirmasi
        terbuka={tanyaKeluar}
        tutup={() => setTanyaKeluar(false)}
        judul="Keluar dari IDS?"
        pesan={<p>Anda masuk sebagai <strong className="text-navy-900">{email}</strong>. Setelah keluar, data tidak bisa dibuka di perangkat ini sampai Anda masuk lagi.</p>}
        labelYa="Keluar"
        jalankan={keluar}
      />
    </div>
  )
}
