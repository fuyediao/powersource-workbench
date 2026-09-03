import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTranslation } from 'react-i18next'
import { AddAppDialog, type NewAppFields } from './AddAppDialog'
import { EndpointPickerDialog } from './EndpointPickerDialog'
import { TeAccessPickerDialog } from './TeAccessPickerDialog'
import { AppIcon } from './AppIcon'
import { MinusIcon, PlusIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { getAppDisplayName, type AppItem } from '@/types/library'
import { animateHeight, HEIGHT_MS } from '@/utils/home/animate-height'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  featureTabFromUrl,
  isErpDeepLink,
  isOaDeepLink,
  isSettingsDeepLink,
  isTeDeepLink,
} from '@/constants/feature-tabs'
import type { FeatureTabId } from '@/constants/feature-tabs'
import type { PowersourceSystem } from '@/constants/powersource-endpoints'
import { NEXTORCH_TE_WEB_URL } from '@/constants/nextorch-te'

const LONG_PRESS_MS = 480
const LONG_PRESS_MOVE_PX = 10
const ADD_APP_FADE_MS = 400
const APP_TILE_FADE_MS = 400

interface AppGridProps {
  userId: string
  categoryId: string
  items: AppItem[]
  editing: boolean
  /** When true, long-press edit / add / reorder are disabled. */
  readOnly?: boolean
  /** When false, edit mode hides the delete control. Defaults to `!readOnly`. */
  allowRemove?: boolean
  /** When false, the add-tile control is hidden. Defaults to `!readOnly`. */
  allowAdd?: boolean
  onEditingChange: (editing: boolean) => void
  onReorder: (itemIds: string[]) => void
  onCreate: (fields: NewAppFields) => Promise<void>
  onRemove: (appId: string) => Promise<void>
  onLinkExisting: (siteId: string) => Promise<void>
  /** Opens a Workbench feature sub-page (AI Chat / Map / Admin). */
  onOpenFeature?: (feature: FeatureTabId) => void
  /** Opens Settings as a title-bar sub-page. */
  onOpenSettings?: () => void
  /**
   * When true, the T&E picker includes admin Official handoff
   * (system / group admin). Non-admins open the public site directly.
   */
  canOpenTeOfficial?: boolean
}

interface SortableAppProps {
  app: AppItem
  label: string
  index: number
  editing: boolean
  isDraggingAny: boolean
  /** Enter/leave fade when the app joins or leaves this category list. */
  tileMotion: 'in' | 'out' | null
  /** Localized Beta badge text when the app is unfinished. */
  betaLabel?: string
  onEnterEdit: () => void
  onRequestRemove: (app: AppItem) => void
  /** When false, the delete badge is hidden while editing. */
  allowRemove: boolean
  onOpenFeature?: (feature: FeatureTabId) => void
  onOpenSettings?: () => void
  /** Opens the POWERSOURCE OA / ERP region picker. */
  onOpenEndpointPicker?: (system: PowersourceSystem) => void
  /** Opens NEXTORCH T&E (picker for admins, public site otherwise). */
  onOpenTe?: () => void
}

interface AppTileProps {
  app: AppItem
  label: string
  dragging?: boolean
  /** Localized Beta badge text when the app is unfinished. */
  betaLabel?: string
}

interface AppIconWithBetaProps {
  app: AppItem
  label: string
  /** Localized Beta badge text; omitted when the app is complete. */
  betaLabel?: string
}

/**
 * Renders the app icon with an optional Beta corner badge.
 * @param props - App data, label, and optional badge copy.
 * @returns Icon shell (badge overlays the top-right corner).
 */
function AppIconWithBeta({ app, label, betaLabel }: AppIconWithBetaProps) {
  if (!betaLabel) {
    return <AppIcon app={app} label={label} />
  }
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute -top-1 -right-1.5 z-10 rounded-full bg-brand px-1.5 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-brand-fg shadow-sm ring-1 ring-white/30 dark:ring-zinc-950/40"
        aria-label={betaLabel}
      >
        {betaLabel}
      </span>
      <AppIcon app={app} label={label} />
    </div>
  )
}

/**
 * Renders the visual app tile used by the drag overlay.
 * @param props - App data, label, and optional drag styling.
 * @returns App tile contents.
 */
function AppTile({ app, label, dragging = false, betaLabel }: AppTileProps) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl p-2 ${
        dragging ? 'bg-panel shadow-2xl' : ''
      }`}
    >
      <AppIconWithBeta app={app} label={label} betaLabel={betaLabel} />
      <span className="line-clamp-2 w-full px-0.5 text-center text-[10px] font-semibold leading-tight tracking-tight text-brand sm:text-[11px]">
        {label}
      </span>
    </div>
  )
}

/**
 * Renders a grid app tile: open on tap, long-press to edit, drag while editing.
 * @param props - App data, edit state, and handlers.
 * @returns Sortable app tile.
 */
function SortableApp({
  app,
  label,
  index,
  editing,
  isDraggingAny,
  tileMotion,
  betaLabel,
  onEnterEdit,
  onRequestRemove,
  allowRemove,
  onOpenFeature,
  onOpenSettings,
  onOpenEndpointPicker,
  onOpenTe,
}: SortableAppProps) {
  const { openUrl } = useLinkOpen()
  const sortable = useSortable({
    id: app.id,
    disabled: !editing || tileMotion === 'out',
    transition: {
      duration: 280,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  })
  const pressTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)

  /**
   * Clears a pending long-press timer.
   * @returns Nothing.
   */
  function clearPressTimer(): void {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressOrigin.current = null
  }

  useEffect(() => () => clearPressTimer(), [])

  /**
   * Opens Settings, a feature sub-page, OA/ERP/T&E picker, or the app URL when not in edit mode.
   * @returns Nothing.
   */
  function openApp(): void {
    if (editing || suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (isSettingsDeepLink(app.url) && onOpenSettings) {
      onOpenSettings()
      return
    }
    const feature = featureTabFromUrl(app.url)
    if (feature && onOpenFeature) {
      onOpenFeature(feature)
      return
    }
    if (isOaDeepLink(app.url) && onOpenEndpointPicker) {
      onOpenEndpointPicker('oa')
      return
    }
    if (isErpDeepLink(app.url) && onOpenEndpointPicker) {
      onOpenEndpointPicker('erp')
      return
    }
    if (isTeDeepLink(app.url) && onOpenTe) {
      onOpenTe()
      return
    }
    openUrl(app.url)
  }

  /**
   * Starts the long-press timer used to enter edit mode.
   * @param event - Pointer event.
   * @returns Nothing.
   */
  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (editing || event.button !== 0) {
      return
    }
    suppressClick.current = false
    pressOrigin.current = { x: event.clientX, y: event.clientY }
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      pressOrigin.current = null
      suppressClick.current = true
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate(12)
      }
      onEnterEdit()
    }, LONG_PRESS_MS)
  }

  /**
   * Cancels long-press when the pointer moves too far.
   * @param event - Pointer event.
   * @returns Nothing.
   */
  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!pressOrigin.current || pressTimer.current === null) {
      return
    }
    const dx = event.clientX - pressOrigin.current.x
    const dy = event.clientY - pressOrigin.current.y
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_PX) {
      clearPressTimer()
    }
  }

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: sortable.isDragging
          ? undefined
          : CSS.Translate.toString(sortable.transform),
        // Only apply sortable transition while editing/reordering so idle hover CSS can run.
        transition:
          sortable.isDragging
            ? undefined
            : editing || isDraggingAny
              ? sortable.transition
              : undefined,
        animationDelay:
          editing && !sortable.isDragging && !isDraggingAny
            ? `${(index % 6) * 28}ms`
            : undefined,
      }}
      className={`relative flex flex-col items-center gap-2 rounded-2xl p-2 ${
        editing ? 'touch-none' : ''
      } ${
        tileMotion === 'out'
          ? 'animate-app-tile-out pointer-events-none'
          : tileMotion === 'in'
            ? 'animate-app-tile-in'
            : ''
      } ${
        sortable.isDragging
          ? 'z-0 opacity-0'
          : editing && !isDraggingAny && tileMotion !== 'out'
            ? 'app-jiggle cursor-grab active:cursor-grabbing'
            : editing
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-pointer transition-[background-color,transform,box-shadow] duration-200 ease-out hover:scale-[1.04] hover:bg-zinc-950/10 hover:shadow-md dark:hover:bg-white/12 dark:hover:shadow-black/40'
      }`}
      onPointerDown={editing ? undefined : handlePointerDown}
      onPointerMove={editing ? undefined : handlePointerMove}
      onPointerUp={editing ? undefined : clearPressTimer}
      onPointerCancel={editing ? undefined : clearPressTimer}
      onContextMenu={(event) => {
        if (!editing) {
          event.preventDefault()
        }
      }}
      onClick={editing ? undefined : openApp}
      {...(editing && tileMotion !== 'out'
        ? { tabIndex: sortable.attributes.tabIndex }
        : {})}
      {...(editing && tileMotion !== 'out' ? sortable.listeners : {})}
    >
      {editing && allowRemove && !sortable.isDragging && tileMotion !== 'out' ? (
        <div className="relative">
          <button
            type="button"
            className="absolute -top-1.5 -left-1.5 z-20 grid size-5 place-items-center rounded-full bg-zinc-400 text-white shadow-md transition hover:bg-rose-500"
            onPointerDown={(event) => {
              event.stopPropagation()
              event.preventDefault()
            }}
            onClick={(event) => {
              event.stopPropagation()
              event.preventDefault()
              onRequestRemove(app)
            }}
          >
            <MinusIcon className="size-3.5" />
          </button>
          <AppIconWithBeta app={app} label={label} betaLabel={betaLabel} />
        </div>
      ) : (
        <AppIconWithBeta app={app} label={label} betaLabel={betaLabel} />
      )}
      <span className="line-clamp-2 w-full px-0.5 text-center text-[10px] font-semibold leading-tight tracking-tight text-brand sm:text-[11px]">
        {label}
      </span>
    </div>
  )
}

/**
 * Renders a sortable application grid with iPhone-style edit mode.
 * @param props - Apps and library actions.
 * @returns Interactive application grid.
 */
export function AppGrid({
  userId,
  categoryId,
  items,
  editing,
  readOnly = false,
  allowRemove,
  allowAdd,
  onEditingChange,
  onReorder,
  onCreate,
  onRemove,
  onLinkExisting,
  onOpenFeature,
  onOpenSettings,
  canOpenTeOfficial = false,
}: AppGridProps) {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [endpointPicker, setEndpointPicker] = useState<PowersourceSystem | null>(null)
  const [tePickerOpen, setTePickerOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<AppItem | null>(null)
  const [removing, setRemoving] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const canRemove = allowRemove ?? !readOnly
  const canAdd = allowAdd ?? !readOnly
  const draggingItem = items.find((item) => item.id === draggingId) ?? null
  const draggingLabel = draggingItem ? getAppDisplayName(draggingItem, t) : ''
  const pendingLabel = pendingRemove ? getAppDisplayName(pendingRemove, t) : ''
  const showAddButton = canAdd && (editing || items.length === 0)
  const addButtonPresence = useDialogPresence(showAddButton, ADD_APP_FADE_MS)
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set())
  const [leavingIds, setLeavingIds] = useState<Set<string>>(() => new Set())
  const knownIdsRef = useRef<Set<string>>(new Set())
  const skipEnterRef = useRef(true)
  const enterTimersRef = useRef<Map<string, number>>(new Map())
  const shellRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const readyToAnimateRef = useRef(false)
  const heightAnimatingRef = useRef(false)

  /**
   * Clears all pending enter-animation timers.
   * @returns Nothing.
   */
  function clearEnterTimers(): void {
    for (const timer of enterTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    enterTimersRef.current.clear()
  }

  useLayoutEffect(() => {
    skipEnterRef.current = true
    knownIdsRef.current = new Set(items.map((item) => item.id))
    clearEnterTimers()
    setEnteringIds(new Set())
    setLeavingIds(new Set())
  }, [categoryId])

  useEffect(() => {
    if (readOnly && editing) {
      onEditingChange(false)
    }
  }, [readOnly, editing, onEditingChange])

  useEffect(() => () => clearEnterTimers(), [])

  useLayoutEffect(() => {
    const nextIds = new Set(items.map((item) => item.id))
    if (skipEnterRef.current) {
      skipEnterRef.current = false
      knownIdsRef.current = nextIds
      return
    }

    const added: string[] = []
    for (const id of nextIds) {
      if (!knownIdsRef.current.has(id)) {
        added.push(id)
      }
    }

    for (const [id, timer] of enterTimersRef.current) {
      if (!nextIds.has(id)) {
        window.clearTimeout(timer)
        enterTimersRef.current.delete(id)
      }
    }

    knownIdsRef.current = nextIds

    if (added.length === 0) {
      return
    }

    setEnteringIds((current) => {
      const merged = new Set(current)
      for (const id of added) {
        merged.add(id)
      }
      return merged
    })

    // Per-id timers must survive later `items` identity churn; a single
    // effect-cleanup timeout was cancelled before firing and left tiles stuck
    // on `animate-app-tile-in`, which overrides `app-jiggle`.
    for (const id of added) {
      const existing = enterTimersRef.current.get(id)
      if (existing !== undefined) {
        window.clearTimeout(existing)
      }
      const timer = window.setTimeout(() => {
        enterTimersRef.current.delete(id)
        setEnteringIds((current) => {
          if (!current.has(id)) {
            return current
          }
          const next = new Set(current)
          next.delete(id)
          return next
        })
      }, APP_TILE_FADE_MS)
      enterTimersRef.current.set(id, timer)
    }
  }, [items])

  useLayoutEffect(() => {
    readyToAnimateRef.current = false
    const shell = shellRef.current
    if (shell) {
      shell.style.height = ''
      shell.style.transition = 'none'
    }
  }, [categoryId])

  useLayoutEffect(() => {
    const shell = shellRef.current
    const content = contentRef.current
    if (!shell || !content) {
      return
    }
    const shouldAnimate = readyToAnimateRef.current
    readyToAnimateRef.current = true
    heightAnimatingRef.current = shouldAnimate
    animateHeight(shell, content.scrollHeight, shouldAnimate)
    if (!shouldAnimate) {
      return
    }
    const timer = window.setTimeout(() => {
      heightAnimatingRef.current = false
    }, HEIGHT_MS)
    return () => {
      window.clearTimeout(timer)
      heightAnimatingRef.current = false
    }
  }, [addButtonPresence.mounted, items.length, categoryId])

  useEffect(() => {
    const shellNode = shellRef.current
    const contentNode = contentRef.current
    if (!shellNode || !contentNode) {
      return
    }
    const shellEl: HTMLDivElement = shellNode
    const contentEl: HTMLDivElement = contentNode

    let frame = 0
    let settleTimer = 0
    /**
     * Animates the shell height when the grid reflows (window resize, wrapping).
     * @returns Nothing.
     */
    function syncHeight(): void {
      const next = contentEl.scrollHeight
      if (Math.abs(shellEl.getBoundingClientRect().height - next) < 1) {
        return
      }
      if (!readyToAnimateRef.current) {
        shellEl.style.transition = 'none'
        shellEl.style.height = `${next}px`
        return
      }
      heightAnimatingRef.current = true
      animateHeight(shellEl, next, true)
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        heightAnimatingRef.current = false
      }, HEIGHT_MS)
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncHeight)
    })
    observer.observe(contentEl)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
      observer.disconnect()
    }
  }, [categoryId])

  useEffect(() => {
    if (!editing) {
      setDialogOpen(false)
      return
    }
    /**
     * Leaves edit mode when Escape is pressed.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !pendingRemove) {
        onEditingChange(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editing, onEditingChange, pendingRemove])

  /**
   * Persists a completed grid reorder.
   * @param event - DnD completion event.
   * @returns Nothing.
   */
  function handleDragEnd(event: DragEndEvent): void {
    setDraggingId(null)
    if (!event.over || event.active.id === event.over.id) {
      return
    }

    const oldIndex = items.findIndex((item) => item.id === event.active.id)
    const newIndex = items.findIndex((item) => item.id === event.over?.id)
    if (oldIndex >= 0 && newIndex >= 0) {
      onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.id))
    }
  }

  /**
   * Fades the tile out, then unlinks it from this category list.
   * @returns Nothing.
   */
  function confirmRemove(): void {
    if (!pendingRemove || removing) {
      return
    }
    const app = pendingRemove
    setPendingRemove(null)
    setRemoving(true)
    setLeavingIds((current) => new Set(current).add(app.id))
    setEnteringIds((current) => {
      if (!current.has(app.id)) {
        return current
      }
      const next = new Set(current)
      next.delete(app.id)
      return next
    })

    window.setTimeout(() => {
      void onRemove(app.id)
        .catch(() => undefined)
        .finally(() => {
          setLeavingIds((current) => {
            const next = new Set(current)
            next.delete(app.id)
            return next
          })
          setRemoving(false)
        })
    }, APP_TILE_FADE_MS)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => {
          if (!editing) {
            return
          }
          setDraggingId(String(event.active.id))
        }}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div ref={shellRef} className="overflow-hidden will-change-[height]">
            <div
              ref={contentRef}
              className={`app-grid grid gap-x-2 gap-y-3 rounded-4xl p-2 sm:gap-3 sm:p-4 ${
                draggingId || editing ? 'select-none' : ''
              }`}
            >
              {items.map((item, index) => {
                const tileMotion = leavingIds.has(item.id)
                  ? 'out'
                  : enteringIds.has(item.id)
                    ? 'in'
                    : null
                const betaLabel = item.beta ? t('functions.beta') : undefined
                return (
                  <SortableApp
                    key={item.id}
                    app={item}
                    index={index}
                    editing={editing}
                    isDraggingAny={Boolean(draggingId)}
                    tileMotion={tileMotion}
                    label={getAppDisplayName(item, t)}
                    betaLabel={betaLabel}
                    onEnterEdit={() => {
                      if (!readOnly) {
                        onEditingChange(true)
                      }
                    }}
                    onRequestRemove={setPendingRemove}
                    allowRemove={canRemove}
                    onOpenFeature={onOpenFeature}
                    onOpenSettings={onOpenSettings}
                    onOpenEndpointPicker={setEndpointPicker}
                    onOpenTe={() => {
                      if (canOpenTeOfficial) {
                        setTePickerOpen(true)
                        return
                      }
                      openUrl(NEXTORCH_TE_WEB_URL)
                    }}
                  />
                )
              })}
              {addButtonPresence.mounted ? (
                <button
                  type="button"
                  className={`flex flex-col items-center gap-2 rounded-2xl p-2 text-muted transition-colors hover:bg-brand/10 hover:text-ink dark:hover:bg-brand/15 ${
                    addButtonPresence.leaving
                      ? 'animate-app-tile-out pointer-events-none'
                      : 'animate-app-tile-in'
                  }`}
                  onClick={() => setDialogOpen(true)}
                >
                  <span className="app-icon grid size-12 place-items-center border border-dashed border-zinc-950/15 bg-white/40 sm:size-14 dark:border-white/15 dark:bg-white/5">
                    <PlusIcon className="size-5" />
                  </span>
                  <span className="line-clamp-2 w-full text-center text-[11px] font-semibold leading-tight sm:text-xs">
                    {t('common.add')}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </SortableContext>
        {createPortal(
          <DragOverlay adjustScale={false} dropAnimation={null} zIndex={300}>
            {draggingItem ? (
              <div className="pointer-events-none cursor-grabbing">
                <AppTile
                  app={draggingItem}
                  label={draggingLabel}
                  dragging
                  betaLabel={draggingItem.beta ? t('functions.beta') : undefined}
                />
              </div>
            ) : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <AddAppDialog
        open={dialogOpen}
        userId={userId}
        categoryId={categoryId}
        onClose={() => setDialogOpen(false)}
        onSubmit={onCreate}
        onLinkExisting={onLinkExisting}
      />

      <EndpointPickerDialog
        open={endpointPicker !== null}
        system={endpointPicker}
        onClose={() => setEndpointPicker(null)}
        onSelect={openUrl}
      />

      <TeAccessPickerDialog
        open={tePickerOpen}
        showOfficial={canOpenTeOfficial}
        onClose={() => setTePickerOpen(false)}
        onOpenUrl={openUrl}
      />

      {pendingRemove
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] grid place-items-center bg-zinc-950/50 p-4 backdrop-blur-sm"
              onClick={() => {
                if (!removing) {
                  setPendingRemove(null)
                }
              }}
            >
              <div
                className="glass-dialog w-full max-w-sm rounded-3xl p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="text-lg font-extrabold text-brand">{t('apps.removeTitle')}</h2>
                <p className="mt-2 text-sm text-muted">
                  {t('apps.removeConfirm', { name: pendingLabel })}
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-zinc-950/10 dark:bg-white/5 dark:hover:bg-white/10"
                    disabled={removing}
                    onClick={() => setPendingRemove(null)}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-60"
                    disabled={removing}
                    onClick={confirmRemove}
                  >
                    {removing ? t('status.saving') : t('actions.remove')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
