import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type Aura from '@/lib/mdcore/aura'
import { useTranslation } from 'react-i18next'
import { PencilIcon, TrashIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  extractOutlineHeadings,
  outlineHeadingsEqual,
  type OutlineHeading,
} from '@/utils/aura/outline'
import {
  deleteLibraryFile,
  getDocumentSession,
  getLibraryCapabilities,
  loadFolderListing,
  renameLibraryFile,
  setLibraryFileColor,
  subscribeDocumentSession,
  type FolderEntry,
  type LibraryCapabilities,
} from '@/hooks/aura/document-store'
import {
  getSidebarTab,
  setSidebarTab,
  subscribeSidebarTab,
  type SidebarTab,
} from '@/hooks/aura/sidebar-tab-store'
import { dispatchAuraMenuAction } from '@/utils/aura/menu-actions'

interface EditorSidebarProps {
  aura: Aura | null
  documentTitle: string
  collapsed: boolean
  /** Open a file from the Files panel. */
  onOpenFile?: (filePath: string) => void
}

interface FileContextMenu {
  entry: FolderEntry
  x: number
  y: number
}

const FILE_COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

const sidebarTabClass = (active: boolean) =>
  [
    'flex h-full flex-1 items-center justify-center border-0 border-b-2 bg-transparent text-[13px] transition-[color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
    active
      ? 'border-(--active-file-border-color) font-medium text-(--text-color)'
      : 'border-transparent text-(--text-color)/60 hover:text-(--text-color)',
  ].join(' ')

const outlineItemClass = (active: boolean) =>
  [
    'box-border block w-full cursor-pointer truncate border-0 border-l-2 py-1 pr-2.5 text-left text-[13px] leading-snug transition-colors',
    active
      ? 'border-l-(--active-file-border-color) bg-(--active-file-bg-color) font-medium text-(--active-file-text-color)'
      : 'border-l-transparent bg-transparent text-(--text-color) hover:bg-(--item-hover-bg-color) hover:text-(--item-hover-text-color)',
  ].join(' ')

type AuraInternal = {
  wysiwyg?: { element: HTMLElement }
}

/**
 * Resolve the DOM node for an outline heading in the WYSIWYG surface.
 *
 * @param element - Editor root.
 * @param heading - Outline heading.
 * @returns Matching element, or null.
 */
function findHeadingElement(
  element: HTMLElement,
  heading: OutlineHeading,
): HTMLElement | null {
  return element.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`)
}

/**
 * Pick the outline heading currently in view.
 *
 * @param element - Scrollable editor root.
 * @param headings - Outline list.
 * @returns Active heading id, or null.
 */
function resolveActiveHeadingId(
  element: HTMLElement,
  headings: OutlineHeading[],
): string | null {
  if (headings.length === 0) {
    return null
  }
  const containerTop = element.getBoundingClientRect().top
  const readLine = containerTop + 48
  let activeId: string | null = headings[0].id

  for (const heading of headings) {
    const node = findHeadingElement(element, heading)
    if (!node) {
      continue
    }
    if (node.getBoundingClientRect().top <= readLine) {
      activeId = heading.id
    } else {
      break
    }
  }
  return activeId
}

/**
 * Scroll to a heading in the WYSIWYG surface.
 *
 * @param aura - Public Aura instance.
 * @param heading - Outline heading to focus.
 */
function scrollToHeading(aura: Aura | null, heading: OutlineHeading): void {
  const internal = (aura as Aura & { aura?: AuraInternal } | null)
    ?.aura
  const element = internal?.wysiwyg?.element
  if (!element) {
    return
  }
  findHeadingElement(element, heading)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

/**
 * Left sidebar with Files and Outline tabs (Files left, Outline right;
 * width animates on collapse). Right-click a library file for rename,
 * color, and delete — the same actions as the Office library pane.
 *
 * @param props - Sidebar props.
 * @returns Sidebar element.
 */
export function EditorSidebar({
  aura,
  documentTitle,
  collapsed,
  onOpenFile,
}: EditorSidebarProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SidebarTab>(getSidebarTab)
  const [headings, setHeadings] = useState<OutlineHeading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [session, setSession] = useState(() => getDocumentSession())
  const [capabilities, setCapabilities] = useState<LibraryCapabilities>(
    getLibraryCapabilities,
  )
  const [contextMenu, setContextMenu] = useState<FileContextMenu | null>(null)
  const [renameEntry, setRenameEntry] = useState<FolderEntry | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const renamePresence = useDialogPresence(renameOpen, 200)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => subscribeSidebarTab(() => setActiveTab(getSidebarTab())), [])
  useEffect(
    () =>
      subscribeDocumentSession(() => {
        setSession(getDocumentSession())
        setCapabilities(getLibraryCapabilities())
      }),
    [],
  )

  useEffect(() => {
    /**
     * Closes the file context menu after an outside interaction. Ignore
     * pointerdown that originates inside the portaled menu so color swatches
     * can run their own handlers (window bubble can otherwise unmount first).
     */
    function closeContextMenu(event: Event): void {
      if (event.target instanceof Element && event.target.closest('[data-aura-file-menu="true"]')) {
        return
      }
      setContextMenu(null)
    }
    /** Closes the file context menu when Escape is pressed. */
    function closeContextMenuOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }
    window.addEventListener('pointerdown', closeContextMenu)
    window.addEventListener('blur', closeContextMenu)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('keydown', closeContextMenuOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeContextMenu)
      window.removeEventListener('blur', closeContextMenu)
      window.removeEventListener('resize', closeContextMenu)
      window.removeEventListener('keydown', closeContextMenuOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!renamePresence.mounted && !renameOpen) {
      setRenameEntry(null)
    }
  }, [renameOpen, renamePresence.mounted])

  useEffect(() => {
    /** Closes a non-busy rename dialog when Escape is pressed. */
    function closeRenameOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !renameBusy) {
        setRenameOpen(false)
        setRenameError(null)
      }
    }
    window.addEventListener('keydown', closeRenameOnEscape)
    return () => window.removeEventListener('keydown', closeRenameOnEscape)
  }, [renameBusy])

  useEffect(() => {
    const internal = (aura as Aura & { aura?: AuraInternal } | null)
      ?.aura
    if (!internal || !aura) {
      setHeadings([])
      setActiveId(null)
      return
    }

    const scan = () => {
      const element = internal.wysiwyg?.element
      // StrictMode may briefly keep a destroyed Aura instance in React state.
      if (!element?.isConnected) {
        setHeadings((prev) => (prev.length === 0 ? prev : []))
        return
      }
      const next = extractOutlineHeadings(element)
      setHeadings((prev) => (outlineHeadingsEqual(prev, next) ? prev : next))
    }

    scan()

    const element = internal.wysiwyg?.element
    if (!element?.isConnected) {
      return
    }

    let frame = 0
    let debounceTimer = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      window.clearTimeout(debounceTimer)
      // Coalesce bursty DOM rewrites so React is not mid-commit.
      debounceTimer = window.setTimeout(() => {
        frame = requestAnimationFrame(scan)
      }, 50)
    })
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(debounceTimer)
      observer.disconnect()
    }
  }, [aura])

  useEffect(() => {
    const internal = (aura as Aura & { aura?: AuraInternal } | null)
      ?.aura
    const element = internal?.wysiwyg?.element
    if (!element || headings.length === 0) {
      setActiveId(null)
      return
    }

    const syncActive = () => {
      setActiveId(resolveActiveHeadingId(element, headings))
    }

    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncActive)
    }

    syncActive()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', onScroll)
    }
  }, [aura, headings])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  /**
   * Opens the file action menu at a viewport-safe position.
   * @param event - Context-menu pointer event.
   * @param entry - Library row.
   */
  function openContextMenu(event: MouseEvent<HTMLElement>, entry: FolderEntry): void {
    if (entry.kind !== 'file') {
      return
    }
    if (!capabilities.canEdit && !capabilities.canDelete) {
      return
    }
    event.preventDefault()
    const menuWidth = 224
    const menuHeight = 196
    setContextMenu({
      entry,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    })
  }

  /**
   * Opens the rename dialog for one library file.
   * @param entry - Library row.
   */
  function openRenameDialog(entry: FolderEntry): void {
    setContextMenu(null)
    setRenameValue(entry.name)
    setRenameError(null)
    setRenameEntry(entry)
    setRenameOpen(true)
  }

  /**
   * Closes the rename dialog when it is safe to do so.
   */
  function closeRenameDialog(): void {
    if (renameBusy) {
      return
    }
    setRenameOpen(false)
    setRenameError(null)
  }

  /**
   * Persists a new display name for the dialog's target file.
   * @param event - Form submit event.
   */
  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!renameEntry || renameBusy) {
      return
    }
    setRenameBusy(true)
    setRenameError(null)
    try {
      await renameLibraryFile(renameEntry.path, renameValue)
      setRenameOpen(false)
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : t('aura.sidebar.renameFailed'),
      )
    } finally {
      setRenameBusy(false)
    }
  }

  /**
   * Confirms and deletes a library file. Resets the editor when the open
   * document is removed.
   * @param entry - Library row.
   */
  function confirmDeleteFile(entry: FolderEntry): void {
    setContextMenu(null)
    if (
      !window.confirm(t('aura.sidebar.confirmDelete', { name: entry.name }))
    ) {
      return
    }
    void (async () => {
      const wasActive = await deleteLibraryFile(entry.path)
      if (wasActive) {
        dispatchAuraMenuAction('file:new')
      }
    })()
  }

  return (
    <aside
      className={[
        'h-full shrink-0 overflow-hidden transition-[width,margin,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        collapsed
          ? 'pointer-events-none mr-0 w-0 opacity-0'
          : 'mr-3 w-60 opacity-100 sm:mr-4',
      ].join(' ')}
      aria-hidden={collapsed}
    >
      <div className="aura-chrome-panel box-border flex h-full w-60 flex-col overflow-hidden rounded-2xl">
        <div className="box-border flex h-full w-full flex-col bg-sidebar">
          <div className="relative flex h-8 w-full shrink-0 aura-border-b bg-sidebar">
            <button
              type="button"
              className={sidebarTabClass(activeTab === 'files')}
              aria-selected={activeTab === 'files'}
              onClick={() => setSidebarTab('files')}
            >
              {t('aura.shell.files')}
            </button>
            <button
              type="button"
              className={sidebarTabClass(activeTab === 'outline')}
              aria-selected={activeTab === 'outline'}
              onClick={() => setSidebarTab('outline')}
            >
              {t('aura.shell.outline')}
            </button>
          </div>
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <div
              className={[
                'aura-scroll absolute inset-0 overflow-x-hidden overflow-y-auto py-1 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                activeTab === 'outline'
                  ? 'z-1 opacity-100'
                  : 'pointer-events-none z-0 opacity-0',
              ].join(' ')}
              aria-hidden={activeTab !== 'outline'}
            >
              {headings.length > 0 ? (
                // Use divs so document-theme list rules cannot affect shell layout.
                <div role="list" className="m-0 p-0">
                  {headings.map((heading, index) => {
                    const isActive = heading.id === activeId
                    return (
                      <div key={`${heading.id}__${index}`} role="listitem">
                        <button
                          type="button"
                          ref={isActive ? activeItemRef : undefined}
                          className={outlineItemClass(isActive)}
                          style={{
                            // Small gutter + nest indent (avoid bare `ul` so themes cannot override).
                            paddingLeft: `${8 + (heading.level - 1) * 14}px`,
                          }}
                          title={heading.text}
                          aria-current={isActive ? 'location' : undefined}
                          onClick={() => {
                            setActiveId(heading.id)
                            scrollToHeading(aura, heading)
                          }}
                        >
                          {heading.text}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
            <div
              className={[
                'aura-scroll absolute inset-0 overflow-x-hidden overflow-y-auto transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                activeTab === 'files'
                  ? 'z-1 opacity-100'
                  : 'pointer-events-none z-0 opacity-0',
              ].join(' ')}
              aria-hidden={activeTab !== 'files'}
            >
              {session.folderEntries.length > 0 ? (
                session.folderEntries.map((entry) => {
                  const isActive =
                    entry.kind === 'file' &&
                    session.filePath !== null &&
                    entry.path === session.filePath
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      className={[
                        'box-border flex w-full cursor-pointer items-center gap-2 border-0 px-3 py-2 text-left text-[13px] outline-none',
                        isActive
                          ? 'bg-(--active-file-bg-color) text-(--active-file-text-color)'
                          : 'bg-transparent text-text hover:bg-(--item-hover-bg-color)',
                      ].join(' ')}
                      title={entry.name}
                      onClick={() => {
                        if (entry.kind === 'directory') {
                          void loadFolderListing(entry.path)
                          return
                        }
                        onOpenFile?.(entry.path)
                      }}
                      onContextMenu={(event) => openContextMenu(event, entry)}
                    >
                      <span className="flex h-4 w-1.5 shrink-0 items-stretch" aria-hidden>
                        {entry.color ? (
                          <span
                            className="w-full rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {entry.kind === 'directory'
                          ? `${entry.name}/`
                          : entry.name}
                      </span>
                    </button>
                  )
                })
              ) : (
                <button
                  type="button"
                  className="box-border flex w-full cursor-default items-center gap-2 border-0 bg-active-file px-3 py-2 text-left text-[13px] text-(--active-file-text-color)"
                >
                  <span className="truncate">{documentTitle}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {contextMenu
        ? createPortal(
            <div
              role="menu"
              data-aura-file-menu="true"
              aria-label={contextMenu.entry.name}
              className="fixed z-[120] w-56 overflow-hidden rounded-xl bg-white/95 p-1.5 text-xs text-ink shadow-2xl ring-1 ring-zinc-950/8 backdrop-blur-xl animate-dropdown-in dark:bg-zinc-900/95 dark:ring-white/10"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {capabilities.canEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium transition-colors hover:bg-zinc-950/5 dark:hover:bg-white/8"
                  onClick={() => openRenameDialog(contextMenu.entry)}
                >
                  <PencilIcon className="size-3.5 text-muted" aria-hidden />
                  {t('aura.sidebar.rename')}
                </button>
              ) : null}
              {capabilities.canEdit ? (
                <div className="my-1 border-y border-zinc-950/6 px-2.5 py-2 dark:border-white/8">
                  <p className="mb-1.5 text-[10px] font-semibold text-muted">
                    {t('aura.sidebar.fileColor')}
                  </p>
                  <div
                    className="flex items-center justify-between"
                    role="group"
                    aria-label={t('aura.sidebar.fileColor')}
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={!contextMenu.entry.color}
                      aria-label={t('aura.sidebar.clearColor')}
                      title={t('aura.sidebar.clearColor')}
                      className={`relative size-[18px] shrink-0 overflow-hidden rounded-full border border-zinc-950/20 transition-transform hover:scale-110 dark:border-white/25 ${
                        contextMenu.entry.color
                          ? ''
                          : 'ring-2 ring-brand ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
                      }`}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        const fileId = contextMenu.entry.path
                        setContextMenu(null)
                        void setLibraryFileColor(fileId, null)
                      }}
                    >
                      <span className="absolute inset-0 bg-linear-to-br from-transparent from-45% via-rose-500 via-48% to-transparent to-52%" />
                    </button>
                    {FILE_COLOR_PALETTE.map((swatch) => {
                      const selected = contextMenu.entry.color === swatch
                      return (
                        <button
                          key={swatch}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          aria-label={`${t('aura.sidebar.fileColor')} ${swatch}`}
                          title={swatch}
                          className={`size-[18px] shrink-0 rounded-full transition-transform hover:scale-110 ${
                            selected
                              ? 'ring-2 ring-brand ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
                              : ''
                          }`}
                          style={{ backgroundColor: swatch }}
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            const fileId = contextMenu.entry.path
                            setContextMenu(null)
                            void setLibraryFileColor(fileId, swatch)
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {capabilities.canDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
                  onClick={() => confirmDeleteFile(contextMenu.entry)}
                >
                  <TrashIcon className="size-3.5" aria-hidden />
                  {t('aura.sidebar.delete')}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      {renamePresence.mounted && renameEntry
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm ${
                renamePresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              onClick={closeRenameDialog}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="aura-library-rename-title"
                className="w-full max-w-md rounded-3xl bg-white p-5 text-ink shadow-2xl ring-1 ring-zinc-950/8 dark:bg-zinc-900 dark:ring-white/10"
                onClick={(event) => event.stopPropagation()}
              >
                <form onSubmit={(event) => void submitRename(event)}>
                  <h3 id="aura-library-rename-title" className="text-base font-bold">
                    {t('aura.sidebar.renameTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-muted">{renameEntry.name}</p>
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-muted">
                      {t('aura.sidebar.renameLabel')}
                    </span>
                    <input
                      autoFocus
                      value={renameValue}
                      disabled={renameBusy}
                      className="mt-1.5 w-full rounded-xl bg-zinc-950/5 px-3 py-2 text-sm outline-none ring-1 ring-transparent transition focus:ring-brand/40 disabled:opacity-60 dark:bg-white/8"
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                  </label>
                  {renameError ? (
                    <p className="mt-2 text-xs font-medium text-rose-500">{renameError}</p>
                  ) : null}
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={renameBusy}
                      className="rounded-xl bg-zinc-950/5 px-4 py-2 text-sm font-semibold transition-colors hover:bg-zinc-950/8 disabled:opacity-50 dark:bg-white/8 dark:hover:bg-white/12"
                      onClick={closeRenameDialog}
                    >
                      {t('aura.sidebar.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={renameBusy || renameValue.trim().length === 0}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                      {renameBusy
                        ? t('aura.sidebar.renaming')
                        : t('aura.sidebar.renameAction')}
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body,
          )
        : null}
    </aside>
  )
}
