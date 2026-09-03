/**
 * Resizable Codex-style Harness utility workspace with GPT-style tabs.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  CanvasIcon,
  CloseIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  PageIcon,
  PlusIcon,
  TerminalIcon,
} from '@/icons/AllIcons'
import { HarnessBrowserPanel } from '@/components/harness/harness-browser-panel'
import { HarnessCanvasPanel } from '@/components/harness/harness-canvas-panel'
import { HarnessFilesPanel } from '@/components/harness/harness-files-panel'
import {
  HarnessOfficePanel,
  type HarnessOfficePanelRequest,
} from '@/components/harness/harness-office-panel'
import { HarnessReviewPanel } from '@/components/harness/harness-review-panel'
import { HarnessTerminalPanel } from '@/components/harness/harness-terminal-panel'
import {
  HARNESS_UTILITY_MAX_WIDTH,
  HARNESS_UTILITY_MIN_WIDTH,
  clampHarnessUtilityWidth,
} from '@/utils/harness/utility-layout'

export type HarnessUtilityPage = 'review' | 'terminal' | 'browser' | 'files' | 'canvas' | 'office'

interface HarnessUtilitySidebarProps {
  /** Whether the complete utility workspace is visible. */
  visible: boolean
  /** Current workspace width in pixels. */
  width: number
  /**
   * Dynamic maximum from the Harness page layout (middle column reserved).
   * Falls back to the hard ceiling when omitted.
   */
  maxWidth?: number
  /** Active Harness working directory. */
  cwd: string | null
  /** Signed-in user id for the native browser integration. */
  userId: string | null
  /** Updates the live width while the resize handle moves. */
  onWidthChange: (width: number) => void
  /** Persists the final width after resizing ends. */
  onWidthCommit: (width: number) => void
  /** Opens this page when nonce increments (composer Canvas, etc.). */
  focusPage?: { page: HarnessUtilityPage; nonce: number } | null
  /** Increments when a new task should drop leftover Canvas tabs. */
  canvasEpoch?: number
  /** Increments when live Canvas files were replaced so the preview remounts. */
  canvasRevision?: number
  /** Latest cloud Office file requested by a Harness tool call. */
  officeRequest?: HarnessOfficePanelRequest | null
}

interface UtilityTab {
  id: string
  page: HarnessUtilityPage
}

interface ResizeSession {
  startX: number
  startWidth: number
  currentWidth: number
}

const UTILITY_PAGES: HarnessUtilityPage[] = ['review', 'terminal', 'browser', 'files', 'canvas', 'office']

const PAGE_ICONS: Record<
  HarnessUtilityPage,
  (props: { className?: string; 'aria-hidden'?: boolean }) => React.ReactElement
> = {
  review: FileTextIcon,
  terminal: TerminalIcon,
  browser: GlobeIcon,
  files: FolderIcon,
  canvas: CanvasIcon,
  office: PageIcon,
}

/**
 * Creates a unique tab id for one utility page.
 * @param page - Page kind to open.
 * @returns Tab identifier.
 */
function createTabId(page: HarnessUtilityPage): string {
  return `${page}-${crypto.randomUUID()}`
}

/** Renders the selected embedded utility page. */
function UtilityPage({
  page,
  tabId,
  visible,
  cwd,
  userId,
  canvasRevision,
  officeRequest,
}: {
  page: HarnessUtilityPage
  tabId: string
  visible: boolean
  cwd: string | null
  userId: string | null
  canvasRevision: number
  officeRequest: HarnessOfficePanelRequest | null
}) {
  if (page === 'review') return <HarnessReviewPanel cwd={cwd} />
  if (page === 'terminal') {
    return <HarnessTerminalPanel sessionId={tabId} cwd={cwd} active={visible} />
  }
  if (page === 'browser') {
    return <HarnessBrowserPanel active={visible} userId={userId} />
  }
  if (page === 'canvas') {
    return <HarnessCanvasPanel key={`canvas-${canvasRevision}`} cwd={cwd} active={visible} />
  }
  if (page === 'office') {
    return <HarnessOfficePanel userId={userId} request={officeRequest} />
  }
  return <HarnessFilesPanel cwd={cwd} />
}

/** Renders one utility workspace page launcher on the empty home. */
function UtilityButton({
  page,
  label,
  icon,
  onOpen,
}: {
  page: HarnessUtilityPage
  label: string
  icon: React.ReactNode
  onOpen: (page: HarnessUtilityPage) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex w-full items-center gap-3 rounded-xl bg-zinc-950/5 px-4 py-3 text-left text-sm font-bold text-ink transition hover:bg-brand/10 hover:text-brand dark:bg-white/5 dark:hover:bg-white/10"
      onClick={() => onOpen(page)}
    >
      <span className="grid size-6 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

/**
 * Renders a resizable, non-overlapping utility workspace with concurrent tabs.
 * The resize strip sits in layout flow so native browser views and iframes cannot cover it.
 * @param props - Visibility, persisted width, workspace identity, resize handlers, optional page focus, Canvas reset epoch, and Canvas remount revision.
 * @returns Right sidebar that participates in the Harness flex layout.
 */
export function HarnessUtilitySidebar({
  visible,
  width,
  maxWidth = HARNESS_UTILITY_MAX_WIDTH,
  cwd,
  userId,
  onWidthChange,
  onWidthCommit,
  focusPage = null,
  canvasEpoch = 0,
  canvasRevision = 0,
  officeRequest = null,
}: HarnessUtilitySidebarProps) {
  const { t } = useTranslation()
  const [tabs, setTabs] = useState<UtilityTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const resizeRef = useRef<ResizeSession | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const layoutMaxWidth = clampHarnessUtilityWidth(maxWidth, HARNESS_UTILITY_MAX_WIDTH)
  const clampedWidth = clampHarnessUtilityWidth(width, layoutMaxWidth)

  /**
   * Opens a utility page as a tab, focusing an existing tab of the same kind.
   * @param page - Page kind to show.
   * @returns Nothing.
   */
  const openPage = useCallback((page: HarnessUtilityPage): void => {
    setMenuOpen(false)
    const current = tabsRef.current
    const existing = current.find((tab) => tab.page === page)
    if (existing) {
      setActiveId(existing.id)
      return
    }
    const next: UtilityTab = { id: createTabId(page), page }
    setTabs([...current, next])
    setActiveId(next.id)
  }, [])

  /**
   * Closes one tab and activates a neighbor when the closed tab was focused.
   * @param id - Tab to remove.
   * @returns Nothing.
   */
  function closeTab(id: string): void {
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index < 0) return
    const next = tabs.filter((tab) => tab.id !== id)
    setTabs(next)
    if (next.length === 0) setMenuOpen(false)
    if (activeId === id) {
      const neighbor = next[index] ?? next[index - 1] ?? null
      setActiveId(neighbor?.id ?? null)
    }
  }

  useEffect(() => {
    if (!focusPage) return
    openPage(focusPage.page)
  }, [focusPage, openPage])

  useEffect(() => {
    const current = tabsRef.current
    const next = current.filter((tab) => tab.page !== 'canvas')
    if (next.length === current.length) return
    setTabs(next)
    setMenuOpen(false)
    setActiveId((active) => {
      if (next.length === 0) return null
      if (active && next.some((tab) => tab.id === active)) return active
      return next[next.length - 1]?.id ?? null
    })
  }, [canvasEpoch])

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  /** Starts resizing from the sidebar's left edge. */
  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeRef.current = {
      startX: event.clientX,
      startWidth: clampedWidth,
      currentWidth: clampedWidth,
    }
    setResizing(true)
  }

  /** Updates the live width while the captured pointer moves. */
  function handleResizeMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const session = resizeRef.current
    if (!session) return
    const next = clampHarnessUtilityWidth(
      session.startWidth + session.startX - event.clientX,
      layoutMaxWidth,
    )
    session.currentWidth = next
    onWidthChange(next)
  }

  /** Ends resizing and stores the final width in device preferences. */
  function handleResizeEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    const session = resizeRef.current
    if (!session) return
    resizeRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setResizing(false)
    onWidthCommit(session.currentWidth)
  }

  return (
    <aside
      data-testid="harness-utility-sidebar"
      aria-hidden={!visible}
      aria-label={t('harness.quickActions.label')}
      className={`relative hidden min-h-0 shrink-0 self-stretch overflow-hidden border-zinc-950/10 bg-white/20 backdrop-blur-md text-ink dark:border-white/10 dark:bg-zinc-950/10 lg:flex ${
        visible ? 'border-l' : 'pointer-events-none border-l-0'
      } ${resizing ? '' : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'} ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ width: visible ? clampedWidth : 0 }}
    >
      {visible ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('harness.utility.resize')}
          aria-valuemin={HARNESS_UTILITY_MIN_WIDTH}
          aria-valuemax={layoutMaxWidth}
          aria-valuenow={clampedWidth}
          className="relative z-40 h-full w-2.5 shrink-0 cursor-col-resize touch-none select-none hover:bg-brand/20"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
        />
      ) : null}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {tabs.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6">
            <div className="flex w-full max-w-xs flex-col gap-2.5">
              {UTILITY_PAGES.map((page) => {
                const Icon = PAGE_ICONS[page]
                return (
                  <UtilityButton
                    key={page}
                    page={page}
                    label={t(`harness.quickActions.${page}`)}
                    icon={<Icon className="size-4" aria-hidden />}
                    onOpen={openPage}
                  />
                )
              })}
            </div>
          </div>
        ) : null}
        {tabs.length > 0 ? (
          <>
            <header className="flex h-10 shrink-0 items-center gap-1 border-b border-zinc-950/10 px-2 dark:border-white/10">
          <div
            role="tablist"
            aria-label={t('harness.quickActions.label')}
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
          >
            {tabs.map((tab) => {
              const Icon = PAGE_ICONS[tab.page]
              const label = t(`harness.quickActions.${tab.page}`)
              const selected = tab.id === activeId
              return (
                <div
                  key={tab.id}
                  role="tab"
                  id={`harness-utility-tab-${tab.id}`}
                  aria-selected={selected}
                  aria-controls={`harness-utility-panel-${tab.id}`}
                  data-testid="harness-utility-tab"
                  data-page={tab.page}
                  tabIndex={selected ? 0 : -1}
                  className={`group flex h-8 max-w-[9.5rem] shrink-0 cursor-pointer items-center gap-1 rounded-lg px-1.5 text-ink transition ${
                    selected
                      ? 'bg-zinc-950/5 dark:bg-white/10'
                      : 'text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10'
                  }`}
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveId(tab.id)
                    }
                  }}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{label}</span>
                  <button
                    type="button"
                    className={`grid size-5 shrink-0 place-items-center rounded-md text-muted transition hover:bg-zinc-950/10 hover:text-ink dark:hover:bg-white/15 ${
                      selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    aria-label={t('harness.utility.closeTab', { name: label })}
                    onClick={(event) => {
                      event.stopPropagation()
                      closeTab(tab.id)
                    }}
                  >
                    <CloseIcon className="size-3" aria-hidden />
                  </button>
                </div>
              )
            })}
          </div>
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              data-testid="harness-utility-add-tab"
              className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand"
              aria-label={t('harness.utility.addTab')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <PlusIcon className="size-4" aria-hidden />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                data-testid="harness-utility-add-menu"
                aria-label={t('harness.utility.addTab')}
                className="absolute top-full right-0 z-50 mt-1 min-w-44 overflow-hidden rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl animate-dropdown-in dark:border-white/10 dark:bg-zinc-900"
              >
                {UTILITY_PAGES.map((page) => {
                  const Icon = PAGE_ICONS[page]
                  const label = t(`harness.quickActions.${page}`)
                  const alreadyOpen = tabs.some((tab) => tab.page === page)
                  return (
                    <button
                      key={page}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                      onClick={() => openPage(page)}
                    >
                      <Icon className="size-4 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {alreadyOpen ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </header>
            {tabs.map((tab) => {
              const selected = tab.id === activeId
              return (
                <div
                  key={tab.id}
                  role="tabpanel"
                  id={`harness-utility-panel-${tab.id}`}
                  aria-labelledby={`harness-utility-tab-${tab.id}`}
                  hidden={!selected}
                  className={selected ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
                >
                  <UtilityPage
                    page={tab.page}
                    tabId={tab.id}
                    visible={visible && selected}
                    cwd={cwd}
                    userId={userId}
                    canvasRevision={canvasRevision}
                    officeRequest={officeRequest}
                  />
                </div>
              )
            })}
          </>
        ) : null}
      </div>
    </aside>
  )
}
