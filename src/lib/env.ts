export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** true bila alamat dan kunci publik Supabase sudah diisi saat aplikasi dibangun. */
export const SUDAH_DIATUR = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20
