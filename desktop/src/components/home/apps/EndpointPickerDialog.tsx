import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CloseIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  POWERSOURCE_REGIONS,
  buildPowersourceUrl,
  type PowersourceRegionId,
  type PowersourceSystem,
} from '@/constants/powersource-endpoints'

interface EndpointPickerDialogProps {
  open: boolean
  system: PowersourceSystem | null
  onClose: () => void
  onSelect: (url: string) => void
}

/**
 * Modal to pick intranet / China / other host for POWERSOURCE OA or ERP.
 * @param props - Open state, product, and selection handlers.
 * @returns Dialog portal or null.
 */
export function EndpointPickerDialog({
  open,
  system,
  onClose,
  onSelect,
}: EndpointPickerDialogProps) {
  const { t } = useTranslation()
  /** Keep last system while leave animation runs (parent clears `system` on close). */
  const [displaySystem, setDisplaySystem] = useState<PowersourceSystem | null>(system)
  const presenceOpen = open && system !== null
  const { mounted, leaving } = useDialogPresence(presenceOpen)

  useLayoutEffect(() => {
    if (system) {
      setDisplaySystem(system)
    }
  }, [system])

  useEffect(() => {
    if (!presenceOpen) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    /**
     * Closes the picker on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [presenceOpen, onClose])

  if (!mounted || !displaySystem) {
    return null
  }

  const activeSystem = displaySystem
  const titleKey =
    activeSystem === 'oa'
      ? 'functions.endpointPicker.titleOa'
      : 'functions.endpointPicker.titleErp'

  /**
   * Opens the chosen region URL and closes the dialog.
   * @param regionId - Selected region.
   * @returns Nothing.
   */
  function handleSelect(regionId: PowersourceRegionId): void {
    if (leaving) {
      return
    }
    const url = buildPowersourceUrl(activeSystem, regionId)
    if (!url) {
      return
    }
    onSelect(url)
    onClose()
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[200] grid place-items-center bg-zinc-950/50 p-4 backdrop-blur-sm ${
        leaving ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
      }`}
      onClick={() => {
        if (!leaving) {
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
        aria-labelledby="endpoint-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h2
            id="endpoint-picker-title"
            className="text-lg font-extrabold text-brand"
          >
            {t(titleKey)}
          </h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl text-brand transition hover:bg-brand/10 hover:text-brand"
            aria-label={t('actions.cancel')}
            disabled={leaving}
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </button>
        </header>
        <ul className="flex flex-col gap-2">
          {POWERSOURCE_REGIONS.map((region) => (
            <li key={region.id}>
              <button
                type="button"
                disabled={leaving}
                className="w-full rounded-2xl bg-zinc-950/5 px-4 py-3 text-left text-sm font-bold text-brand transition hover:bg-zinc-950/10 disabled:pointer-events-none dark:bg-white/5 dark:hover:bg-white/10"
                onClick={() => handleSelect(region.id)}
              >
                {t(region.labelKey)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
