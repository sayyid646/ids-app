/** Mengunduh berkas buatan aplikasi (CSV, PDF) ke perangkat. */
export function unduh(blob: Blob, namaBerkas: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = namaBerkas
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
