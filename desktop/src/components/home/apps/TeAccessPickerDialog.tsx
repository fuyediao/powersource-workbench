import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { mintOfficialCommunityHandoff } from '@/services/te-community-official-handoff-api'
import { NEXTORCH_TE_WEB_URL } from '@/constants/nextorch-te'

interface TeAccessPickerDialogProps {
  open: boolean
  /** When true, show the admin Official handoff option. */
  showOfficial: boolean
  onClose: () => void
  onOpenUrl: (url: string) => void
}

/**
 * Modal to open NEXTORCH T&E as a public site or via admin Official handoff.
 * @param props - Open state, admin option flag, and handlers.
 * @returns Dialog portal or null.
 */
export function TeAccessPickerDialog({
  open,
  showOfficial,
  onClose,
  onOpenUrl,
}: TeAccessPickerDialogProps) {
  const { t } = useTranslation()
  const { mounted, leaving } = useDialogPresence(open)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setBusy(false)
      setError(null)
      busyRef.current = false
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    /**
     * Closes the picker on Escape when idle.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busyRef.current) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!mounted) {
    return null
  }

  /**
   * Opens the public T&E website and closes the dialog.
   * @returns Nothing.
   */
  function handleOpenWeb(): void {
    if (leaving || busy) {
      return
    }
    onOpenUrl(NEXTORCH_TE_WEB_URL)
    onClose()
  }

  /**
   * Mints an Official admin handoff URL, then opens it.
   * @returns Nothing.
   */
  async function handleOpenOfficial(): Promise<void> {
    if (leaving || busy || !showOfficial) {
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const { openUrl: handoffUrl } = await mintOfficialCommunityHandoff()
      onOpenUrl(handoffUrl)
      onClose()
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t('functions.openOfficialError')
      setError(message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[200] grid place-items-center bg-zinc-950/50 p-4 backdrop-blur-sm ${
        leaving ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
      }`}
      onClick={() => {
        if (!leaving && !busy) {
          onClose()
        }
      }}
    >
      <div
        className={`glass-dialog flex w-full max-w-sm flex-col overflow-hidden rounded-3xl p-5 shadow-2xl ${
          leaving ? 'dialog-panel-out' : 'dialog-panel-in'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="te-access-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h2
            id="te-access-picker-title"
            className="text-lg font-extrabold text-brand"
          >
            {t('functions.tePicker.title')}
          </h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl text-brand transition hover:bg-brand/10 hover:text-brand"
            aria-label={t('actions.cancel')}
            disabled={leaving || busy}
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        {error ? (
          <p className="mb-3 text-sm text-rose-500">{error}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          <li>
            <button
              type="button"
              disabled={leaving || busy}
              className="w-full rounded-2xl bg-zinc-950/5 px-4 py-3 text-left text-sm font-bold text-brand transition hover:bg-zinc-950/10 disabled:pointer-events-none dark:bg-white/5 dark:hover:bg-white/10"
              onClick={handleOpenWeb}
            >
              {t('functions.tePicker.web')}
            </button>
          </li>
          {showOfficial ? (
            <li>
              <button
                type="button"
                disabled={leaving || busy}
                className="w-full rounded-2xl bg-zinc-950/5 px-4 py-3 text-left text-sm font-bold text-brand transition hover:bg-zinc-950/10 disabled:opacity-60 dark:bg-white/5 dark:hover:bg-white/10"
                onClick={() => {
                  void handleOpenOfficial()
                }}
              >
                {t('functions.tePicker.official')}
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
