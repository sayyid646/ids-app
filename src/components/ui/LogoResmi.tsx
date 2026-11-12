import { cx } from './ui'

/**
 * Logo resmi CV. Intan Dua Saudara (versi mendatar: tanda + tulisan), diambil langsung dari berkas IDS.pdf
 * tanpa mengubah bentuk, proporsi, warna, maupun tulisannya. Dipakai di nota.
 */
export function LogoResmi({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo-ids.png`}
      alt="CV. Intan Dua Saudara"
      className={cx('h-auto w-auto object-contain', className)}
      draggable={false}
    />
  )
}
