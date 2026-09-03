import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon, RotateIcon } from '@/icons/AllIcons'
import {
  closeImagePreview,
  getImagePreview,
  subscribeImagePreview,
  type ImagePreviewState,
} from '@/hooks/aura/image-preview-store'

const overlayClass = [
  'aura fixed inset-0 z-[300000] flex flex-col',
].join(' ')

const barClass = [
  'box-border flex h-9 items-center justify-center border-b border-solid',
  'border-(--border-color) bg-(--overlay-bg-color) text-center',
].join(' ')

const btnClass = [
  'ml-6 inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent',
  'text-(--overlay-icon-color) select-none',
  'hover:text-(--overlay-icon-hover-color)',
  '[&_svg]:mr-0 [&_svg]:size-3.5 [&_svg]:fill-current',
].join(' ')

/**
 * Fullscreen image lightbox owned by the React shell.
 *
 * @returns Overlay element, or null when closed.
 */
export function ImagePreviewOverlay() {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<ImagePreviewState | null>(() =>
    getImagePreview(),
  )
  const [deg, setDeg] = useState(0)
  const [centered, setCentered] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    return subscribeImagePreview(() => {
      setPreview(getImagePreview())
      setDeg(0)
      setCentered(false)
    })
  }, [])

  useEffect(() => {
    if (!preview) {
      document.body.style.overflow = ''
      return
    }
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => setCentered(true), 16)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = ''
    }
  }, [preview])

  useEffect(() => {
    if (!preview) {
      return
    }
    /**
     * Close on Escape.
     *
     * @param event - Keyboard event.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        closeImagePreview()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [preview])

  if (!preview) {
    return null
  }

  const barHeight = 36
  const translate = centered
    ? `translate3d(${Math.max(0, window.innerWidth - preview.naturalWidth) / 2}px, ${Math.max(0, window.innerHeight - barHeight - preview.naturalHeight) / 2}px, 0)`
    : `translate3d(${preview.originLeft}px, ${preview.originTop - barHeight}px, 0)`

  const oddQuarter = (deg / 90) % 2 === 1
  const transform =
    oddQuarter && preview.naturalWidth > window.innerHeight - barHeight
      ? `translate3d(${Math.max(0, window.innerWidth - preview.naturalWidth) / 2}px, ${preview.naturalWidth / 2 - preview.naturalHeight / 2}px, 0) rotateZ(${deg}deg)`
      : `${translate} rotateZ(${deg}deg)`

  return (
    <div
      className={`${overlayClass}${preview.theme === 'dark' ? ' aura--dark' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('aura.shell.imagePreview')}
    >
      <div className={barClass}>
        <button
          type="button"
          className={btnClass}
          onClick={() => setDeg((value) => value + 90)}
        >
          <RotateIcon className="size-3.5" />
          {t('aura.shell.rotate')}
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => closeImagePreview()}
        >
          <CloseIcon className="size-3.5" />
          {t('aura.menu.close')}
        </button>
      </div>
      <div
        className="flex-1 cursor-zoom-out overflow-auto bg-(--textarea-background-color)"
        onClick={() => closeImagePreview()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            closeImagePreview()
          }
        }}
        role="presentation"
      >
        <img
          ref={imgRef}
          src={preview.src}
          alt=""
          className="max-w-none"
          style={{
            width: preview.displayWidth,
            height: preview.displayHeight,
            transform,
            transition: centered ? 'transform .3s ease-in-out' : undefined,
          }}
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  )
}
