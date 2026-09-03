/**
 * Shared expand / collapse / hover control used by Admin, Settings, and Clash rails.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { SidebarMode } from '@/hooks/use-sidebar-mode'
import { SidebarIcon } from '@/icons/AllIcons'

const MODE_OPTIONS: { value: Exclude<SidebarMode, 'hidden'>; labelKey: string }[] = [
  { value: 'expanded', labelKey: 'admin.sidebar.mode.expanded' },
  { value: 'collapsed', labelKey: 'admin.sidebar.mode.collapsed' },
  { value: 'hover', labelKey: 'admin.sidebar.mode.hover' },
]

export interface SidebarModeControlProps {
  expanded: boolean
  mode: SidebarMode
  onSetMode: (mode: SidebarMode) => void
}

/**
 * Footer trigger plus a portaled radio card for rail width mode.
 * @param props - Current mode and setter.
 * @returns Mode-control footer.
 */
export function SidebarModeControl({
  expanded,
  mode,
  onSetMode,
}: SidebarModeControlProps) {
  const { t } = useTranslation()
  const controlRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [controlOpen, setControlOpen] = useState(false)
  const control = useDialogPresence(controlOpen, 180)
  const [panelPos, setPanelPos] = useState<{ left: number; bottom: number } | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!control.mounted) {
      setPanelPos(null)
      return
    }
    /**
     * Anchors the mode card above the trigger.
     * @returns Nothing.
     */
    function updatePanelPos(): void {
      const button = controlRef.current
      if (!button) {
        return
      }
      const buttonRect = button.getBoundingClientRect()
      setPanelPos({
        left: buttonRect.left,
        bottom: window.innerHeight - buttonRect.top + 8,
      })
    }
    updatePanelPos()
    window.addEventListener('resize', updatePanelPos)
    window.addEventListener('scroll', updatePanelPos, true)
    return () => {
      window.removeEventListener('resize', updatePanelPos)
      window.removeEventListener('scroll', updatePanelPos, true)
    }
  }, [control.mounted, expanded])

  useEffect(() => {
    /**
     * Closes the mode card on outside pointer down.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function onPointerDown(event: PointerEvent): void {
      if (!controlOpen) {
        return
      }
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (controlRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setControlOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [controlOpen])

  return (
    <div className="relative shrink-0 px-1.5 py-2">
      <button
        ref={controlRef}
        type="button"
        className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        title={t('admin.sidebar.mode.control')}
        aria-label={t('admin.sidebar.mode.control')}
        aria-expanded={controlOpen}
        onClick={() => setControlOpen((open) => !open)}
      >
        <SidebarIcon collapsed={!expanded} />
      </button>
      {control.mounted && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className={[
                'fixed z-[80] w-44 rounded-xl border border-ink/10 bg-white/95 p-2 shadow-xl backdrop-blur-xl dark:bg-zinc-950/95',
                control.leaving || !controlOpen
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in',
              ].join(' ')}
              style={{ bottom: panelPos.bottom, left: panelPos.left }}
            >
              <p className="mb-1.5 text-[11px] font-medium text-muted">
                {t('admin.sidebar.mode.control')}
              </p>
              <div className="flex flex-col gap-1">
                {MODE_OPTIONS.map((option) => {
                  const selected = mode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                        selected
                          ? 'bg-brand/10 text-brand'
                          : 'text-ink hover:bg-ink/5'
                      }`}
                      onClick={() => {
                        onSetMode(option.value)
                        setControlOpen(false)
                      }}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${selected ? 'bg-brand' : 'bg-muted/50'}`}
                      />
                      <span>{t(option.labelKey)}</span>
                    </button>
                  )
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
