import { createHashRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SyncProvider } from './sync/SyncProvider'
import { PenyediaNotifikasi } from './components/ui/Notifikasi'
import { AppLayout } from './components/layout/AppLayout'
import { SUDAH_DIATUR } from './lib/env'
import { Masuk } from './pages/Masuk'
import { LupaSandi } from './pages/LupaSandi'
import { SandiBaru } from './pages/SandiBaru'
import { BelumDiatur, BukanAdmin, GalatAuth, LayarMemuat, TidakDitemukan } from './pages/Layar'
import { DaftarPengrajin } from './pages/pengrajin/DaftarPengrajin'
import { DetailPengrajin } from './pages/pengrajin/DetailPengrajin'

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

// HashRouter: alamat seperti .../ids-app/#/pengrajin, cocok untuk GitHub Pages.
const router = createHashRouter([
  { path: '/masuk', element: <Masuk /> },
  { path: '/lupa-sandi', element: <LupaSandi /> },
  {
    element: <KhususAdmin />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/pengrajin" replace /> },
          { path: 'pengrajin', element: <DaftarPengrajin /> },
          { path: 'pengrajin/:id', element: <DetailPengrajin /> },
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
