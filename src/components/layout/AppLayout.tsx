import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, UserRound, Users, WifiOff } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useSinkron, type StatusSinkron } from '../../sync/SyncProvider'
import { Logo } from './Logo'
import { Konfirmasi } from '../ui/Dialog'
import { cx } from '../ui/ui'

// Menu hanya berisi modul yang sudah berfungsi penuh. Modul berikutnya ditambahkan per fase.
const MENU = [{ ke: '/pengrajin', label: 'Pengrajin', Ikon: Users }]

const LABEL_SINKRON: Record<StatusSinkron, string> = {
  tersinkron: 'Tersinkron',
  menghubungkan: 'Menghubungkan...',
  offline: 'Offline',
  terputus: 'Sinkron terputus',
}

function PenandaSinkron({ terang }: { terang?: boolean }) {
  const { status } = useSinkron()
  const warna =
    status === 'tersinkron' ? 'bg-ok-600' : status === 'menghubungkan' ? 'bg-gold-400 animate-pulse' : 'bg-bad-600'
  return (
    <span
      className={cx('inline-flex items-center gap-2 text-xs font-semibold', terang ? 'text-ice-200' : 'text-ink-soft')}
      title="Perubahan dari perangkat lain muncul otomatis saat tersinkron"
    >
      <span className={cx('h-2 w-2 rounded-full', warna)} aria-hidden />
      {LABEL_SINKRON[status]}
    </span>
  )
}

export function AppLayout() {
  const { email, keluar } = useAuth()
  const { status } = useSinkron()
  const [tanyaKeluar, setTanyaKeluar] = useState(false)

  return (
    <div className="min-h-dvh bg-ice-50 lg:pl-64">
      {/* Sidebar komputer */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy-900 text-white lg:flex">
        <div className="px-6 pb-6 pt-7">
          <Logo />
          <p className="mt-3 text-[10px] font-semibold tracking-[0.2em] text-ice-400">SMART JEWELRY MANAGEMENT</p>
        </div>
        <div className="mx-6 h-px bg-gradient-to-r from-gold-400/60 via-gold-400/20 to-transparent" />
        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Menu utama">
          {MENU.map(({ ke, label, Ikon }) => (
            <NavLink
              key={ke}
              to={ke}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors',
                  isActive ? 'bg-white/10 text-white ring-1 ring-gold-400/40' : 'text-ice-200 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Ikon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/10 px-6 py-5">
          <PenandaSinkron terang />
          <p className="truncate text-sm text-ice-200" title={email ?? ''}>{email}</p>
          <button
            type="button"
            onClick={() => setTanyaKeluar(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gold-300 hover:text-gold-200"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Keluar
          </button>
        </div>
      </aside>

      {/* Kepala HP */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ice-200 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <Logo terang={false} kecil />
        <PenandaSinkron />
      </header>

      {status === 'offline' && (
        <div role="status" className="flex items-center gap-2 bg-gold-100 px-4 py-2 text-sm text-gold-700 lg:px-8">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          Anda sedang offline. Data yang tampil mungkin belum terbaru dan perubahan belum bisa disimpan.
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
        <Outlet />
      </main>

      {/* Navigasi bawah HP */}
      <nav
        aria-label="Menu utama"
        className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-ice-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {MENU.map(({ ke, label, Ikon }) => (
          <NavLink
            key={ke}
            to={ke}
            className={({ isActive }) =>
              cx('flex min-w-[76px] flex-col items-center gap-1 px-3 py-2.5 text-xs font-semibold', isActive ? 'text-navy-900' : 'text-ink-muted')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cx('rounded-full px-4 py-1', isActive && 'bg-gold-100')}>
                  <Ikon className="h-5 w-5" aria-hidden />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setTanyaKeluar(true)}
          className="flex min-w-[76px] flex-col items-center gap-1 px-3 py-2.5 text-xs font-semibold text-ink-muted"
        >
          <span className="rounded-full px-4 py-1"><UserRound className="h-5 w-5" aria-hidden /></span>
          Akun
        </button>
      </nav>

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
