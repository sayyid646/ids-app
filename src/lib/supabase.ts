import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUDAH_DIATUR, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

// Kunci yang dipakai di sini hanya kunci publik (anon/publishable).
// Keamanan data dijaga oleh login dan Row Level Security di database.
export const supabase: SupabaseClient | null = SUDAH_DIATUR
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'ids-auth',
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null

/** Klien Supabase. Melempar galat bila aplikasi belum diatur. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Aplikasi belum tersambung ke database.')
  return supabase
}
