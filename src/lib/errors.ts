// Mengubah pesan galat teknis menjadi kalimat yang mudah dipahami.
// Pesan dari aturan database IDS sudah berbahasa Indonesia, jadi diteruskan apa adanya.

interface GalatMentah {
  message?: string
  code?: string
  hint?: string
  details?: string
  status?: number
}

export function pesanGalat(e: unknown): string {
  if (!e) return 'Terjadi kesalahan. Coba lagi.'
  const g = (typeof e === 'object' ? e : { message: String(e) }) as GalatMentah
  const msg = g.message ?? String(e)

  if (/Failed to fetch|NetworkError|Load failed|network request failed|fetch failed/i.test(msg)) {
    return 'Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.'
  }
  if (/Invalid login credentials/i.test(msg)) return 'Email atau kata sandi salah.'
  if (/Email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Konfirmasi dulu di Supabase.'
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg)) {
    return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.'
  }
  if (/should be different from the old password/i.test(msg)) return 'Kata sandi baru harus berbeda dari yang lama.'
  if (/Password should be at least/i.test(msg)) return 'Kata sandi terlalu pendek.'
  if (/JWT expired|invalid JWT|PGRST301/i.test(msg) || g.code === 'PGRST301') return 'Sesi berakhir. Silakan masuk lagi.'
  if (g.code === '23505' && /duplicate key/i.test(msg)) {
    if (/craftsmen_code_uq/.test(msg)) return 'ID pengrajin sudah dipakai pengrajin lain.'
    if (/jewelry_categories_name_uq/.test(msg)) return 'Nama kategori sudah ada.'
    if (/orders_number_uq/.test(msg)) return 'Nomor order sudah dipakai.'
    return 'Data yang sama sudah ada.'
  }
  if (g.code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return /administrator/i.test(msg) ? msg : 'Akses ditolak. Pastikan Anda masuk dengan akun administrator.'
  }
  return msg
}
