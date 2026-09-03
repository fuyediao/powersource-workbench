/**
 * Shared brand-styled filter listbox for Map and Admin.
 * When `searchable`, the closed trigger swaps to an inline search row (web
 * `AdminInlineSearchCombobox` parity) instead of nesting search in the panel.
 * The options panel portals to `document.body` with fixed coords so overflow
 * ancestors (form cards, scroll panes) do not clip or offset the menu.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'
import { CheckIcon, ChevronDownIcon, SearchIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useVirtualWindow } from '@/hooks/use-virtual-window'

export interface CrmFilterOption {
  /** Stored filter value ('' for all). */
  value: string
  /** Primary visible label (trigger + option title). */
  label: string
  /** Optional secondary line under the label (e.g. customer code). */
  description?: string
}

/** Visual density: Admin filters use `md`; Map toolbar uses `sm`; inline About rows use `xs`. */
export type CrmFilterSelectSize = 'md' | 'sm' | 'xs'

interface CrmFilterSelectProps {
  value: string
  options: CrmFilterOption[]
  onChange: (value: string) => void
  /** Extra classes on the root (e.g. min-width). */
  className?: string
  /** Trigger / list density. Default `md`. */
  size?: CrmFilterSelectSize
  /**
   * When true, opening replaces the trigger with an inline search field
   * (Vue AdminInlineSearchCombobox style).
   */
  searchable?: boolean
  searchPlaceholder?: string
  /** Accessible label for the chevron that closes an open searchable filter. */
  closeAriaLabel?: string
  /**
   * Custom option filter for search; default matches label substring.
   * @param option - Candidate.
   * @param query - Trimmed query.
   * @returns Whether to show the option.
   */
  filterOption?: (option: CrmFilterOption, query: string) => boolean
  /**
   * Fires when the searchable query string changes (including clear on close).
   * Use for remote option loading; pair with updating `options` from the parent.
   * @param query - Current search string (may be empty).
   */
  onQueryChange?: (query: string) => void
  /**
   * Optional leading node for an option (built only for visible / selected rows).
   * @param option - Option being rendered.
   * @param surface - Closed trigger vs dropdown list row (social chips use both sizes).
   * @returns Leading node or null.
   */
  renderLeading?: (option: CrmFilterOption, surface?: 'trigger' | 'list') => ReactNode
  /** Accessible name for the trigger. */
  ariaLabel?: string
  /** Optional test identifier for the closed trigger. */
  testId?: string
  /** Empty-list copy when search has no matches. */
  emptyLabel?: string
  /**
   * Closed-trigger copy when `value` is empty. The matching empty option
   * (if any) still appears in the list as the clear row.
   */
  placeholder?: string
  disabled?: boolean
  /**
   * Preferred list placement relative to the trigger.
   * Flips automatically when the preferred side lacks space.
   */
  menuPlacement?: 'bottom' | 'top'
  /** Extra classes merged onto the closed trigger (ghost chips, composer rows). */
  triggerClassName?: string
  /**
   * Minimum dropdown width in pixels. The panel still grows with the trigger
   * and is clamped to the viewport.
   */
  menuMinWidth?: number
}

const VIRTUALIZE_THRESHOLD = 40
const MENU_GAP_PX = 4
const VIEWPORT_PAD_PX = 8

interface MenuCoords {
  left: number
  width: number
  maxHeight: number
  placement: 'bottom' | 'top'
  top?: number
  bottom?: number
}

const SIZE_TOKENS: Record<
  CrmFilterSelectSize,
  {
    rowHeightPx: number
    listViewportPx: number
    panelRadiusClass: string
    triggerClosedClass: string
    triggerOpenSearchClass: string
    optionTextClass: string
    searchInputClass: string
    iconClass: string
  }
> = {
  md: {
    rowHeightPx: 40,
    listViewportPx: 240,
    panelRadiusClass: 'rounded-2xl',
    triggerClosedClass:
      'inline-flex h-11 w-full items-center gap-2 rounded-2xl border border-ink/10 bg-white/60 px-3 text-left text-sm font-medium leading-none outline-none transition hover:border-brand/40 focus-visible:border-brand dark:border-white/10 dark:bg-zinc-950/40',
    triggerOpenSearchClass:
      'inline-flex h-11 w-full items-center gap-2 rounded-2xl border border-brand bg-white/60 px-3 text-sm font-medium leading-none text-ink ring-1 ring-brand/25 dark:border-brand dark:bg-zinc-950/40',
    optionTextClass: 'text-sm leading-none',
    searchInputClass: 'text-sm leading-none',
    iconClass: 'block size-3.5 shrink-0 self-center',
  },
  sm: {
    rowHeightPx: 32,
    listViewportPx: 176,
    panelRadiusClass: 'rounded-xl',
    triggerClosedClass:
      'inline-flex h-8 w-full items-center gap-1.5 rounded-md border border-zinc-950/10 bg-white/60 px-2 text-left text-[11px] font-medium leading-none text-ink outline-none transition hover:border-brand/40 focus-visible:border-brand dark:border-white/10 dark:bg-zinc-950/40',
    triggerOpenSearchClass:
      'inline-flex h-8 w-full items-center gap-1.5 rounded-md border border-brand bg-white/60 px-2 text-[11px] font-medium leading-none text-ink ring-1 ring-brand/25 dark:bg-zinc-950/40',
    optionTextClass: 'text-xs leading-none',
    searchInputClass: 'text-[11px] leading-none',
    iconClass: 'block size-3 shrink-0 self-center',
  },
  /** Matches Vue About-panel proxy/sales-rep triggers (`px-2 py-1 text-xs`). */
  xs: {
    rowHeightPx: 28,
    listViewportPx: 160,
    panelRadiusClass: 'rounded-lg',
    triggerClosedClass:
      'inline-flex h-6 w-full items-center gap-1 rounded-md border border-ink/10 bg-white/60 px-2 py-1 text-left text-xs font-medium leading-none text-ink outline-none transition hover:border-brand/40 focus-visible:border-brand dark:border-white/10 dark:bg-zinc-950/40',
    triggerOpenSearchClass:
      'inline-flex h-6 w-full items-center gap-1 rounded-md border border-brand bg-white/60 px-2 py-1 text-left text-xs font-medium leading-none text-ink ring-1 ring-brand/25 dark:bg-zinc-950/40',
    optionTextClass: 'text-xs leading-none',
    searchInputClass: 'text-xs leading-none',
    iconClass: 'block size-3 shrink-0 self-center',
  },
}

/**
 * Computes fixed menu coordinates flush with the trigger box.
 * @param trigger - Trigger / root element to anchor to.
 * @param preferred - Preferred open direction.
 * @param listMaxPx - Soft max list height from density tokens.
 * @param menuMinWidth - Minimum panel width in pixels.
 * @returns Viewport-fixed panel coords.
 */
function computeMenuCoords(
  trigger: HTMLElement,
  preferred: 'bottom' | 'top',
  listMaxPx: number,
  menuMinWidth: number,
): MenuCoords {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(
    window.innerWidth - VIEWPORT_PAD_PX * 2,
    Math.max(rect.width, menuMinWidth),
  )
  const left = Math.min(
    Math.max(VIEWPORT_PAD_PX, rect.left),
    Math.max(VIEWPORT_PAD_PX, window.innerWidth - width - VIEWPORT_PAD_PX),
  )

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD_PX - MENU_GAP_PX
  const spaceAbove = rect.top - VIEWPORT_PAD_PX - MENU_GAP_PX
  const minComfort = Math.min(160, listMaxPx)

  let placement = preferred
  if (preferred === 'bottom' && spaceBelow < minComfort && spaceAbove > spaceBelow) {
    placement = 'top'
  } else if (preferred === 'top' && spaceAbove < minComfort && spaceBelow > spaceAbove) {
    placement = 'bottom'
  }

  const available = placement === 'bottom' ? spaceBelow : spaceAbove
  const maxHeight = Math.max(96, Math.min(listMaxPx, available))

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
 * Brand-styled filter dropdown with brand selection state and open/close motion.
 * Shared by Admin customers filters and Map CRM country / US-state filters.
 * @param props - Value, options, and handlers.
 * @returns Filter control.
 */
export function CrmFilterSelect({
  value,
  options,
  onChange,
  className = '',
  size = 'md',
  searchable = false,
  searchPlaceholder,
  closeAriaLabel,
  filterOption,
  onQueryChange,
  renderLeading,
  ariaLabel,
  testId,
  emptyLabel = '—',
  placeholder,
  disabled = false,
  menuPlacement = 'bottom',
  triggerClassName = '',
  menuMinWidth = 120,
}: CrmFilterSelectProps): ReactNode {
  const tokens = SIZE_TOKENS[size]
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuCoords, setMenuCoords] = useState<MenuCoords | null>(null)
  const presence = useDialogPresence(open, 180)

  useEffect(() => {
    if (!searchable || !onQueryChange) {
      return
    }
    onQueryChange(query)
  }, [onQueryChange, query, searchable])

  const matched = options.find((option) => option.value === value)
  const selected =
    matched ??
    (value.trim() ? { value, label: value } : (options[0] ?? null))
  const triggerLabel =
    !value.trim() && placeholder ? placeholder : (selected?.label ?? '—')
  const selectedLeading =
    selected && renderLeading && (value.trim() || !placeholder)
      ? renderLeading(selected, 'trigger')
      : null
  const hasConcreteValue = Boolean(value.trim())
  const triggerLabelClass = hasConcreteValue ? 'text-ink' : 'text-ink/45'
  const hasDescriptions = options.some((option) => Boolean(option.description?.trim()))
  const optionRowHeightPx = hasDescriptions
    ? size === 'sm'
      ? 44
      : 52
    : tokens.rowHeightPx

  /**
   * Closes the menu and clears the search string.
   * @returns Nothing.
   */
  function close(): void {
    setOpen(false)
    setQuery('')
  }

  /**
   * Re-measures the trigger and updates fixed panel coords.
   * @returns Nothing.
   */
  function syncMenuCoords(): void {
    const trigger = rootRef.current
    if (!trigger) {
      return
    }
    setMenuCoords(computeMenuCoords(trigger, menuPlacement, tokens.listViewportPx, menuMinWidth))
  }

  const visibleOptions = useMemo(() => {
    const trimmed = query.trim()
    if (!searchable || !trimmed) {
      return options
    }
    const match =
      filterOption ??
      ((option: CrmFilterOption, q: string) => {
        const needle = q.toLowerCase()
        if (option.label.toLowerCase().includes(needle)) {
          return true
        }
        return Boolean(option.description?.toLowerCase().includes(needle))
      })
    return options.filter((option) => {
      if (option.value === '' || option.value === '__empty__') {
        return true
      }
      return match(option, trimmed)
    })
  }, [filterOption, options, query, searchable])

  const useVirtual = presence.mounted && visibleOptions.length > VIRTUALIZE_THRESHOLD
  const windowMetrics = useVirtualWindow(
    useVirtual ? visibleOptions.length : 0,
    optionRowHeightPx,
    listRef,
    {
      initialViewportHeight: tokens.listViewportPx,
      overscan: 6,
      resetKey: query,
    },
  )

  const slicedOptions = useVirtual
    ? visibleOptions.slice(windowMetrics.startIndex, windowMetrics.endIndex)
    : visibleOptions

  useLayoutEffect(() => {
    if (!presence.mounted) {
      setMenuCoords(null)
      return
    }
    syncMenuCoords()
    /**
     * Keeps the panel flush with the trigger on viewport changes.
     * @returns Nothing.
     */
    function handleReposition(): void {
      syncMenuCoords()
    }
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [presence.mounted, menuPlacement, menuMinWidth, tokens.listViewportPx])

  useEffect(() => {
    if (!open) {
      return
    }
    /**
     * Closes on outside pointer down (trigger root or portaled panel).
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      close()
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    if (searchable) {
      window.requestAnimationFrame(() => {
        searchRef.current?.focus()
      })
    }
  }, [open, searchable])

  useEffect(() => {
    if (disabled) {
      close()
    }
  }, [disabled])

  /**
   * Renders one option button.
   * @param option - Filter option.
   * @returns Option row.
   */
  function renderOption(option: CrmFilterOption): ReactNode {
    const isSelected = option.value === value
    const leading = renderLeading?.(option, 'list') ?? null
    const description = option.description?.trim()
    return (
      <li
        key={option.value || '__all__'}
        role="presentation"
        style={useVirtual ? { height: optionRowHeightPx } : undefined}
      >
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          className={[
            'flex w-full items-center gap-2 px-3 text-left font-medium transition',
            tokens.optionTextClass,
            useVirtual ? 'h-full' : hasDescriptions ? 'min-h-[3.25rem] py-1.5' : 'min-h-10',
            isSelected
              ? 'bg-brand/10 text-brand'
              : 'text-ink hover:bg-brand/5',
          ].join(' ')}
          onClick={() => {
            onChange(option.value)
            close()
          }}
        >
          {leading ? (
            <span className="inline-flex shrink-0 items-center">{leading}</span>
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate leading-tight">{option.label}</span>
            {description ? (
              <span
                className={[
                  'truncate text-[11px] font-medium leading-tight',
                  isSelected ? 'text-brand/80' : 'text-muted',
                ].join(' ')}
              >
                {description}
              </span>
            ) : null}
          </span>
          {isSelected ? (
            <CheckIcon className={tokens.iconClass} aria-hidden />
          ) : (
            <span className={tokens.iconClass} aria-hidden />
          )}
        </button>
      </li>
    )
  }

  const activePlacement = menuCoords?.placement ?? menuPlacement
  const panelStyle: CSSProperties | undefined = menuCoords
    ? {
        position: 'fixed',
        left: menuCoords.left,
        width: menuCoords.width,
        maxHeight: menuCoords.maxHeight,
        top: menuCoords.top,
        bottom: menuCoords.bottom,
        zIndex: 200,
      }
    : undefined

  const panel =
    presence.mounted && menuCoords ? (
      <div
        ref={panelRef}
        data-crm-filter-select-panel
        style={panelStyle}
        className={[
          'overflow-hidden border border-ink/10 bg-white/95 shadow-xl dark:border-white/10 dark:bg-zinc-950/95',
          activePlacement === 'top' ? 'origin-bottom' : 'origin-top',
          tokens.panelRadiusClass,
          presence.leaving
            ? activePlacement === 'top'
              ? 'animate-dropdown-out-up'
              : 'animate-dropdown-out'
            : activePlacement === 'top'
              ? 'animate-dropdown-in-up'
              : 'animate-dropdown-in',
        ].join(' ')}
      >
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="h-full overflow-y-auto py-1"
          style={{ maxHeight: menuCoords.maxHeight }}
          onScroll={useVirtual ? windowMetrics.onScroll : undefined}
        >
          {visibleOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs font-medium text-muted">{emptyLabel}</div>
          ) : useVirtual ? (
            <div className="relative" style={{ height: windowMetrics.totalHeight }}>
              <ul
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${windowMetrics.offsetY}px)` }}
              >
                {slicedOptions.map((option) => renderOption(option))}
              </ul>
            </div>
          ) : (
            <ul>{slicedOptions.map((option) => renderOption(option))}</ul>
          )}
        </div>
      </div>
    ) : null

  return (
    <div ref={rootRef} className={twMerge('relative w-full min-w-0', className)}>
      {searchable && open ? (
        <div className={tokens.triggerOpenSearchClass}>
          <SearchIcon className={`${tokens.iconClass} shrink-0 text-muted`} aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            autoComplete="off"
            aria-label={searchPlaceholder ?? ariaLabel}
            aria-controls={presence.mounted ? listboxId : undefined}
            aria-expanded
            className={`min-w-0 flex-1 bg-transparent py-0.5 font-medium text-ink outline-none placeholder:text-muted ${tokens.searchInputClass}`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                close()
              }
            }}
          />
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted transition hover:text-ink"
            aria-label={closeAriaLabel ?? 'Close'}
            onMouseDown={(event) => {
              event.preventDefault()
              close()
            }}
          >
            <ChevronDownIcon className={`${tokens.iconClass} rotate-180`} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid={testId}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-controls={presence.mounted ? listboxId : undefined}
          className={twMerge(
            tokens.triggerClosedClass,
            triggerClassName,
            triggerLabelClass,
            open ? 'border-brand ring-1 ring-brand/25' : '',
            disabled ? 'opacity-60' : '',
          )}
          onClick={() => {
            if (disabled) {
              return
            }
            if (searchable) {
              setOpen(true)
              return
            }
            setOpen((prev) => !prev)
          }}
        >
          {selectedLeading ? (
            <span className="inline-flex shrink-0 items-center">{selectedLeading}</span>
          ) : null}
          <span className="min-w-0 flex-1 truncate leading-none">{triggerLabel}</span>
          <ChevronDownIcon
            className={[
              `${tokens.iconClass} transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]`,
              open ? 'rotate-180 text-brand' : 'text-ink/40',
            ].join(' ')}
            aria-hidden
          />
        </button>
      )}
      {panel ? createPortal(panel, document.body) : null}
    </div>
  )
}
