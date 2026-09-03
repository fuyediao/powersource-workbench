/**
 * Single composer model picker: vendor icon plus "OpenAI · GPT-5.6 Sol" on
 * both the trigger and every menu row (no vendor header / model wrap).
 * The list portals to `document.body` so Harness / Ask overflow ancestors
 * cannot clip combined labels or the Not Configured hint.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  chatProviderIcon,
  groupAiModelsByProvider,
  modelLabelKey,
  providerDisplayName,
  providerLabelKey,
  type AiCatalogModel,
} from '@/chat/ai-model-catalog'
import { ChevronDownIcon } from '@/icons/AllIcons'

const MENU_GAP_PX = 8
const VIEWPORT_PAD_PX = 12
const MENU_MAX_HEIGHT_PX = 320
const COMPACT_MENU_MIN_WIDTH_PX = 360
const DEFAULT_MENU_MIN_WIDTH_PX = 384

interface AiCombinedModelPickerProps {
  /** Allowlisted catalog rows to show. */
  models: AiCatalogModel[]
  /** Currently selected provider slug. */
  provider: string
  /** Currently selected vendor or local model id. */
  modelId: string
  /** Whether a provider has credentials / a reachable local runtime. */
  isConfigured: (provider: string) => boolean
  /** Called when the user picks a catalog row. */
  onSelect: (provider: string, modelId: string) => void
  /** Disables the trigger (busy send, generating, etc.). */
  disabled?: boolean
  /** Controlled open state; omit for internal state. */
  open?: boolean
  /** Controlled open-state setter. */
  onOpenChange?: (open: boolean) => void
  /** Compact matches Ask-panel / Harness chips; default matches the Ask page. */
  density?: 'default' | 'compact'
  /** Menu alignment relative to the trigger. */
  menuAlign?: 'left' | 'right'
  /** Accessible name for the trigger. */
  'aria-label'?: string
}

interface PickerMenuCoords {
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
  top?: number
  bottom?: number
}

/**
 * Resolves a localised vendor label (OpenAI / Google / …).
 * @param t - i18next translator.
 * @param i18n - i18next instance (for `exists`).
 * @param provider - Catalog provider id.
 * @returns Display label.
 */
function resolveProviderLabel(
  t: (key: string, options?: { defaultValue?: string }) => string,
  i18n: { exists: (key: string) => boolean },
  provider: string,
): string {
  const key = providerLabelKey(provider)
  if (i18n.exists(key)) {
    return t(key)
  }
  return t(key, { defaultValue: providerDisplayName(provider) })
}

/**
 * Resolves a localised model label.
 * @param t - i18next translator.
 * @param model - Catalog row, or undefined when the id is missing from the list.
 * @param modelId - Fallback id.
 * @returns Display label.
 */
function resolveModelLabel(
  t: (key: string, options?: { defaultValue?: string }) => string,
  model: AiCatalogModel | undefined,
  modelId: string,
): string {
  const id = model?.id ?? modelId
  return t(modelLabelKey(id), { defaultValue: model?.labelEn ?? id })
}

/**
 * Computes viewport-fixed menu coordinates so overflow ancestors cannot clip it.
 * @param trigger - Closed trigger button.
 * @param menuAlign - Which trigger edge the panel should share.
 * @param minWidth - Minimum panel width in pixels.
 * @returns Fixed left / width / maxHeight and top or bottom.
 */
function computePickerMenuCoords(
  trigger: HTMLElement,
  menuAlign: 'left' | 'right',
  minWidth: number,
): PickerMenuCoords {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(
    window.innerWidth - VIEWPORT_PAD_PX * 2,
    Math.max(minWidth, Math.round(rect.width)),
  )
  const preferredLeft = menuAlign === 'right' ? rect.right - width : rect.left
  const left = Math.min(
    Math.max(VIEWPORT_PAD_PX, preferredLeft),
    Math.max(VIEWPORT_PAD_PX, window.innerWidth - width - VIEWPORT_PAD_PX),
  )

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD_PX - MENU_GAP_PX
  const spaceAbove = rect.top - VIEWPORT_PAD_PX - MENU_GAP_PX
  const minComfort = Math.min(160, MENU_MAX_HEIGHT_PX)
  let placement: 'top' | 'bottom' = 'top'
  if (spaceAbove < minComfort && spaceBelow > spaceAbove) {
    placement = 'bottom'
  }

  const available = placement === 'bottom' ? spaceBelow : spaceAbove
  const maxHeight = Math.max(96, Math.min(MENU_MAX_HEIGHT_PX, available))

  if (placement === 'bottom') {
    return {
      left,
      width,
      maxHeight,
      placement,
      top: rect.bottom + MENU_GAP_PX,
    }
  }

  return {
    left,
    width,
    maxHeight,
    placement,
    bottom: window.innerHeight - rect.top + MENU_GAP_PX,
  }
}

/**
 * Combined vendor + model picker for Ask / Agent composers.
 * @param props - Catalog, selection, and configuration gating.
 * @returns Trigger plus single-line model list.
 */
export function AiCombinedModelPicker({
  models,
  provider,
  modelId,
  isConfigured,
  onSelect,
  disabled = false,
  open: openProp,
  onOpenChange,
  density = 'default',
  menuAlign = 'right',
  'aria-label': ariaLabel,
}: AiCombinedModelPickerProps) {
  const { t, i18n } = useTranslation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [menuCoords, setMenuCoords] = useState<PickerMenuCoords | null>(null)
  const open = openProp ?? uncontrolledOpen
  const compact = density === 'compact'
  const configured = isConfigured(provider)
  const menuMinWidth = compact ? COMPACT_MENU_MIN_WIDTH_PX : DEFAULT_MENU_MIN_WIDTH_PX

  const setOpen = useCallback(
    (next: boolean): void => {
      if (onOpenChange) {
        onOpenChange(next)
      } else {
        setUncontrolledOpen(next)
      }
    },
    [onOpenChange],
  )

  const groups = useMemo(() => groupAiModelsByProvider(models), [models])
  const currentModel = useMemo(
    () => models.find((row) => row.provider === provider && row.id === modelId),
    [models, provider, modelId],
  )
  const providerLabel = resolveProviderLabel(t, i18n, provider)
  const modelLabel = resolveModelLabel(t, currentModel, modelId)
  const combinedLabel = t('chat.modelSelector.combinedLabel', {
    provider: providerLabel,
    model: modelLabel,
  })

  /**
   * Measures the trigger and stores fixed menu coordinates.
   * @returns Nothing.
   */
  const syncMenuCoords = useCallback((): void => {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }
    setMenuCoords(computePickerMenuCoords(trigger, menuAlign, menuMinWidth))
  }, [menuAlign, menuMinWidth])

  useLayoutEffect(() => {
    if (!open) {
      setMenuCoords(null)
      return
    }
    syncMenuCoords()
  }, [open, syncMenuCoords, models.length])

  useEffect(() => {
    if (!open) {
      return
    }
    /**
     * Closes the menu on an outside pointer down.
     * @param event - Document pointer.
     * @returns Nothing.
     */
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    /**
     * Keeps the portaled panel anchored while the window scrolls or resizes.
     * @returns Nothing.
     */
    function onReposition(): void {
      syncMenuCoords()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, setOpen, syncMenuCoords])

  const triggerClass = compact
    ? `flex max-w-64 min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
        configured
          ? 'text-brand hover:bg-brand/10'
          : 'text-muted grayscale hover:bg-zinc-950/5 dark:hover:bg-white/5'
      }`
    : `flex max-w-[220px] items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 sm:max-w-[280px] sm:px-3 dark:hover:bg-brand/15 ${
        configured ? '' : 'opacity-50'
      }`

  const menuClass = `fixed z-[200] overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
    menuCoords?.placement === 'bottom'
      ? 'origin-top animate-dropdown-in'
      : 'origin-bottom animate-dropdown-in-up'
  }`

  const ProviderIcon = chatProviderIcon(provider)
  const menu =
    open && menuCoords
      ? createPortal(
          <ul
            ref={menuRef}
            className={menuClass}
            role="listbox"
            style={{
              left: menuCoords.left,
              width: menuCoords.width,
              maxHeight: menuCoords.maxHeight,
              top: menuCoords.top,
              bottom: menuCoords.bottom,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {groups.flatMap((group) => {
              const GroupIcon = chatProviderIcon(group.provider)
              const groupConfigured = isConfigured(group.provider)
              const groupLabel = resolveProviderLabel(t, i18n, group.provider)
              return group.models.map((entry) => {
                const selected = entry.provider === provider && entry.id === modelId
                const rowLabel = t('chat.modelSelector.combinedLabel', {
                  provider: groupLabel,
                  model: resolveModelLabel(t, entry, entry.id),
                })
                return (
                  <li key={`${entry.provider}:${entry.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={!groupConfigured}
                      title={
                        groupConfigured
                          ? rowLabel
                          : `${rowLabel} — ${t('chat.modelSelector.notConfigured')}`
                      }
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold ${
                        !groupConfigured
                          ? 'cursor-not-allowed text-muted opacity-40'
                          : selected
                            ? 'bg-brand/15 text-brand'
                            : 'text-brand hover:bg-brand/10'
                      }`}
                      onClick={() => {
                        if (!groupConfigured) {
                          return
                        }
                        onSelect(entry.provider, entry.id)
                        setOpen(false)
                      }}
                    >
                      <GroupIcon className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{rowLabel}</span>
                      {!groupConfigured ? (
                        <span className="shrink-0 text-[10px] font-medium whitespace-nowrap">
                          {t('chat.modelSelector.notConfigured')}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })
            })}
          </ul>,
          document.body,
        )
      : null

  return (
    <div className="relative min-w-0 shrink-0">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? combinedLabel}
        title={combinedLabel}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(!open)
        }}
      >
        <ProviderIcon className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'} aria-hidden />
        <span className="truncate">{combinedLabel}</span>
        <ChevronDownIcon
          className={`size-3 shrink-0 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  )
}
