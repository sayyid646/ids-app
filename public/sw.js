// Service worker sederhana: membuat IDS bisa dipasang sebagai aplikasi dan tetap terbuka saat sinyal lemah.
// Data order TIDAK disimpan di sini; data selalu diambil langsung dari database.
const CACHE = 'ids-v6'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './ikon-192.png'])))
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Hanya file aplikasi dari alamat yang sama. Permintaan ke Supabase tidak disentuh.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  // Musik diputar langsung dari internet (pemutar audio meminta potongan file, tidak cocok disimpan di sini).
  if (url.pathname.endsWith('.mp3')) return
  // Halaman: ambil versi terbaru dulu, pakai simpanan bila offline.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('./index.html', c)); return r }).catch(() => caches.match('./index.html')))
    return
  }
  // File aplikasi (nama berisi kode versi): simpanan dulu, lalu internet.
  e.respondWith(caches.match(e.request).then((ada) => ada || fetch(e.request).then((r) => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)) }
    return r
  })))
})
