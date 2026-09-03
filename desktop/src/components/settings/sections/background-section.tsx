import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloseIcon, ImageIcon } from '@/icons/AllIcons'
import type { BackgroundError } from '@/hooks/use-background'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import {
  MIN_WALLPAPER_ROTATE_SECONDS,
  type WallpaperItem,
} from '@/utils/home/library-api'

interface BackgroundSectionProps {
  hasBackground: boolean
  activePath: string | null
  wallpapers: WallpaperItem[]
  backgroundError: BackgroundError | null
  rotateEnabled: boolean
  rotateSeconds: number
  onSetRotateEnabled: (enabled: boolean) => void
  onSetRotateSeconds: (seconds: number) => void
  onUploadBackground: (file: File) => Promise<BackgroundError | null>
  onSelectWallpaper: (path: string) => Promise<BackgroundError | null>
  onRemoveWallpaper: (id: string) => Promise<BackgroundError | null>
  onClearBackground: () => void
  onDismissError: () => void
}

/**
 * Maps a background error code to an i18n message.
 * @param error - Error code.
 * @param t - Translator.
 * @returns Localized message.
 */
function backgroundErrorMessage(
  error: BackgroundError,
  t: (key: string) => string,
): string {
  if (error === 'size') {
    return t('background.tooLarge')
  }
  if (error === 'type') {
    return t('background.invalidType')
  }
  if (error === 'limit') {
    return t('background.limitReached')
  }
  return t('background.saveFailed')
}

/**
 * Wallpaper upload, gallery, and auto-rotate controls for Settings.
 * @param props - Wallpaper state and actions.
 * @returns Background settings section.
 */
export function BackgroundSection({
  hasBackground,
  activePath,
  wallpapers,
  backgroundError,
  rotateEnabled,
  rotateSeconds,
  onSetRotateEnabled,
  onSetRotateSeconds,
  onUploadBackground,
  onSelectWallpaper,
  onRemoveWallpaper,
  onClearBackground,
  onDismissError,
}: BackgroundSectionProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rotateSecondsDraft, setRotateSecondsDraft] = useState(String(rotateSeconds))

  useEffect(() => {
    setRotateSecondsDraft(String(rotateSeconds))
  }, [rotateSeconds])

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.background')}</p>
      {backgroundError ? (
        <p className="flex items-center gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-500">
          <span className="min-w-0 flex-1">
            {backgroundErrorMessage(backgroundError, t)}
          </span>
          <button
            type="button"
            className="shrink-0 underline decoration-rose-500/40 underline-offset-2"
            onClick={onDismissError}
          >
            {t('actions.close')}
          </button>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg transition hover:bg-brand"
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="size-4" />
          {t('actions.uploadBackground')}
        </button>
        {hasBackground ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/10 dark:bg-white/5"
            onClick={onClearBackground}
          >
            <CloseIcon className="size-4" />
            {t('actions.clearBackground')}
          </button>
        ) : null}
      </div>
      {wallpapers.length > 0 ? (
        <>
          <div className="space-y-3 rounded-2xl bg-zinc-950/5 p-3 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand">
                  {t('background.rotateLabel')}
                </p>
              </div>
              <SettingsSwitch
                checked={rotateEnabled}
                disabled={wallpapers.length < 2}
                aria-label={t('background.rotateLabel')}
                onChange={onSetRotateEnabled}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="wallpaper-rotate-seconds"
                className="text-sm font-semibold text-brand"
              >
                {t('background.rotateIntervalLabel')}
              </label>
              <div className="flex items-center gap-2">
                <FocusRingFrame
                  shellClassName={`${FOCUS_RING_SHELL} ${
                    wallpapers.length < 2 ? 'opacity-50' : ''
                  }`}
                >
                  <input
                    id="wallpaper-rotate-seconds"
                    type="number"
                    min={MIN_WALLPAPER_ROTATE_SECONDS}
                    step={1}
                    value={rotateSecondsDraft}
                    disabled={wallpapers.length < 2}
                    className="w-20 bg-transparent px-2 py-1.5 text-right text-sm font-bold tabular-nums text-brand outline-none disabled:cursor-not-allowed"
                    onChange={(event) => {
                      setRotateSecondsDraft(event.target.value)
                    }}
                    onBlur={() => {
                      const next = Number(rotateSecondsDraft)
                      onSetRotateSeconds(
                        Number.isFinite(next) ? next : MIN_WALLPAPER_ROTATE_SECONDS,
                      )
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') {
                        return
                      }
                      event.currentTarget.blur()
                    }}
                  />
                </FocusRingFrame>
                <span className="text-xs font-semibold text-muted">
                  {t('background.rotateSecondsUnit')}
                </span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted">{t('background.galleryHint')}</p>
          <div className="grid grid-cols-3 gap-3 p-1.5 sm:grid-cols-4 sm:gap-3 sm:p-2">
            {wallpapers.map((item) => {
              const selected = item.path === activePath
              return (
                <div key={item.id} className="group relative aspect-video min-w-0">
                  <button
                    type="button"
                    className={`size-full overflow-hidden rounded-xl bg-zinc-950/10 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-white/5 ${
                      selected
                        ? 'ring-2 ring-brand ring-offset-2 ring-offset-(--panel)'
                        : 'hover:ring-2 hover:ring-brand/40'
                    }`}
                    onClick={() => {
                      void onSelectWallpaper(item.path)
                    }}
                  >
                    <img
                      src={item.thumbUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    className="absolute top-1 right-1 z-20 grid size-6 place-items-center rounded-full bg-zinc-950/70 text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-500 focus-visible:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      void onRemoveWallpaper(item.id)
                    }}
                  >
                    <CloseIcon className="size-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) {
            return
          }
          void onUploadBackground(file).then((error) => {
            if (error) {
              window.alert(backgroundErrorMessage(error, t))
            }
          })
        }}
      />
    </div>
  )
}
