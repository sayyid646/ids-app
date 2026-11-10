import { Suspense, lazy } from 'react'
import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SyncProvider } from './sync/SyncProvider'
import { PenyediaNotifikasi } from './components/ui/Notifikasi'
import { AppLayout } from './components/layout/AppLayout'
import { Pemuat } from './components/ui/ui'
import { SUDAH_DIATUR } from './lib/env'
import { Masuk } from './pages/Masuk'
import { LupaSandi } from './pages/LupaSandi'
import { SandiBaru } from './pages/SandiBaru'
import { BelumDiatur, BukanAdmin, GalatAuth, LayarMemuat, TidakDitemukan } from './pages/Layar'
import { DaftarPengrajin } from './pages/pengrajin/DaftarPengrajin'
import { DetailPengrajin } from './pages/pengrajin/DetailPengrajin'
import { DaftarOrder } from './pages/order/DaftarOrder'
import { OrderBaru } from './pages/order/OrderBaru'
import { DetailOrder } from './pages/order/DetailOrder'

// Halaman berat (grafik, PDF) dimuat saat dibuka saja, supaya aplikasi cepat terbuka.
const Beranda = lazy(() => import('./pages/Beranda'))
const Barang = lazy(() => import('./pages/Barang'))
const Laporan = lazy(() => import('./pages/Laporan'))
const Riwayat = lazy(() => import('./pages/Riwayat'))
const Pengaturan = lazy(() => import('./pages/Pengaturan'))
const Nota = lazy(() => import('./pages/Nota'))

/** Rute terlindungi: hanya administrator yang bisa masuk. */
function KhususAdmin() {
  const { status } = useAuth()
  if (status === 'memuat') return <LayarMemuat />
  if (status === 'keluar') return <Navigate to="/masuk" replace />
  if (status === 'bukan_admin') return <BukanAdmin />
  if (status === 'galat') return <GalatAuth />
  return (
    <SyncProvider>
      <Outlet />
    </SyncProvider>
  )
}

// HashRouter: alamat seperti .../ids-app/#/order, cocok untuk GitHub Pages.
const router = createHashRouter([
  { path: '/masuk', element: <Masuk /> },
  { path: '/lupa-sandi', element: <LupaSandi /> },
  {
    element: <KhususAdmin />,
    children: [
      { path: 'cetak/:jenis/:id', element: <Suspense fallback={<Pemuat />}><Nota /></Suspense> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/beranda" replace /> },
          { path: 'beranda', element: <Beranda /> },
          { path: 'order', element: <DaftarOrder /> },
          { path: 'order/baru', element: <OrderBaru /> },
          { path: 'order/:id', element: <DetailOrder /> },
          { path: 'barang', element: <Barang /> },
          { path: 'pengrajin', element: <DaftarPengrajin /> },
          { path: 'pengrajin/:id', element: <DetailPengrajin /> },
          { path: 'laporan', element: <Laporan /> },
          { path: 'riwayat', element: <Riwayat /> },
          { path: 'pengaturan', element: <Pengaturan /> },
          { path: '*', element: <TidakDitemukan /> },
        ],
      },
    ],
  },
])

function Isi() {
  const { pemulihan } = useAuth()
  // Setelah membuka tautan reset dari email, tampilkan formulir kata sandi baru dulu.
  if (pemulihan) return <SandiBaru />
  return <RouterProvider router={router} />
}

export function App() {
  if (!SUDAH_DIATUR) return <BelumDiatur />
  return (
    <AuthProvider>
      <PenyediaNotifikasi>
        <Isi />
      </PenyediaNotifikasi>
    </AuthProvider>
  )
}
