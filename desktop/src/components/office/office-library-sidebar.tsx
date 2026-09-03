/**
 * Office (Docs/Sheets/Slides) library sidebar: Supabase-backed `office_files`
 * rows for the active scope (personal or one group). Replaces the retired
 * local-SQLite sidebar UX from the Univer-based workspace.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SidebarModeControl } from '@/components/layout/sidebar-mode-control'
import type { OfficeFeatureId } from '@/constants/office-folder'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_EXPANDED_PX,
  type SidebarMode,
} from '@/hooks/use-sidebar-mode'
import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UniverDocsIcon,
  UniverSheetsIcon,
  UniverSlidesIcon,
  UploadIcon,
} from '@/icons/AllIcons'
import {
  resolveProductPricePeriod,
  type ProductPriceImportResult,
} from '@/services/product-catalog-price-import'
import type { OfficeFile } from '@/services/office-files-api'

const OFFICE_FILE_COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

interface OfficeLibrarySidebarProps {
  kind: OfficeFeatureId
  files: OfficeFile[]
  activeFileId: string | null
  expanded: boolean
  mode: SidebarMode
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  onSetMode: (mode: SidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: {
    currentTarget: EventTarget | null
    relatedTarget: EventTarget | null
  }) => void
  onCreate: () => void
  onRename: (id: string, name: string) => Promise<void>
  onColorChange: (id: string, color: string | null) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
  onMoveToGroup?: (id: string) => void
  onCopyToPersonal?: (id: string) => void
  onImportProductPrices?: (id: string) => Promise<ProductPriceImportResult>
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

interface LibraryContextMenu {
  file: OfficeFile
  x: number
  y: number
}

interface LibraryDialog {
  file: OfficeFile
  type: 'rename' | 'import-prices'
}

interface SortableLibraryFileProps {
  file: OfficeFile
  active: boolean
  updatedLabel: string
  deleteLabel: string
  onSelect: () => void
  onDelete: () => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}

/**
 * Renders one keyboard- and pointer-sortable Office library row.
 * @param props - File details and row actions.
 * @returns Sortable sidebar row.
 */
function SortableLibraryFile(props: SortableLibraryFileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.file.id,
  })

  return (
    <li
      ref={setNodeRef}
      className={`relative ${isDragging ? 'z-20' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div
        className={`group flex items-center rounded-xl transition-[background-color,box-shadow,opacity,transform] duration-200 ${
          isDragging
            ? 'scale-[1.015] bg-panel opacity-90 shadow-lg ring-1 ring-brand/20'
            : props.active
              ? 'bg-zinc-950/7 text-ink hover:translate-x-0.5 dark:bg-white/10'
              : 'hover:translate-x-0.5 hover:bg-zinc-950/4 dark:hover:bg-white/7'
        }`}
        onContextMenu={props.onContextMenu}
      >
        {props.file.color ? (
          <span
            className="absolute inset-y-2 left-0 w-0.5 rounded-full"
            style={{ backgroundColor: props.file.color }}
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 cursor-grab touch-none px-3 py-2 text-left active:cursor-grabbing"
          aria-current={props.active ? 'page' : undefined}
          onClick={props.onSelect}
          {...attributes}
          {...listeners}
        >
          <span className="block truncate text-xs font-semibold" title={props.file.name}>
            {props.file.name}
          </span>
          <span className="mt-0.5 block truncate text-[10px] text-muted">
            {props.updatedLabel}
          </span>
        </button>
        <button
          type="button"
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 transition-[background-color,color,opacity,transform] duration-200 hover:bg-rose-500/10 hover:text-rose-500 active:scale-90 group-hover:opacity-100 focus:opacity-100"
          title={props.deleteLabel}
          aria-label={props.deleteLabel}
          onClick={props.onDelete}
        >
          <TrashIcon className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}

/**
 * Returns the icon used for one Office library kind.
 * @param kind - Docs, Sheets, or Slides.
 * @param className - Icon class name.
 * @returns Office kind icon.
 */
function officeKindIcon(kind: OfficeFeatureId, className: string): ReactNode {
  if (kind === 'docs') {
    return <UniverDocsIcon className={className} aria-hidden />
  }
  if (kind === 'sheets') {
    return <UniverSheetsIcon className={className} aria-hidden />
  }
  return <UniverSlidesIcon className={className} aria-hidden />
}

/**
 * Displays the active scope's Office files and highlights the file open in
 * the OnlyOffice host. Rail width follows Admin-style expand / collapse /
 * hover / hidden modes.
 * @param props - File list, capabilities, and library actions.
 * @returns Office library sidebar.
 */
export function OfficeLibrarySidebar(props: OfficeLibrarySidebarProps) {
  const { t, i18n } = useTranslation()
  const asideRef = useRef<HTMLElement>(null)
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const hoverOverlay = props.mode === 'hover'
  const collapsed = !props.expanded
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  )
  const [contextMenu, setContextMenu] = useState<LibraryContextMenu | null>(null)
  const [dialog, setDialog] = useState<LibraryDialog | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [importResult, setImportResult] = useState<ProductPriceImportResult | null>(null)
  const dialogPresence = useDialogPresence(dialogOpen, 200)
  const importPeriod =
    dialog?.type === 'import-prices' ? resolveProductPricePeriod(dialog.file.name) : null

  useEffect(() => {
    /** Closes the file context menu after an outside interaction. */
    function closeContextMenu(): void {
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
    if (!dialogPresence.mounted && !dialogOpen) {
      setDialog(null)
    }
  }, [dialogOpen, dialogPresence.mounted])

  useEffect(() => {
    /** Closes a non-busy file action dialog when Escape is pressed. */
    function closeDialogOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !dialogBusy) {
        setDialogOpen(false)
        setDialogError(null)
        setImportResult(null)
      }
    }
    window.addEventListener('keydown', closeDialogOnEscape)
    return () => window.removeEventListener('keydown', closeDialogOnEscape)
  }, [dialogBusy])

  /** Opens the file action menu at a viewport-safe position. */
  function openContextMenu(event: MouseEvent<HTMLElement>, file: OfficeFile): void {
    event.preventDefault()
    const menuWidth = 224
    const menuHeight = props.kind === 'sheets' ? 236 : 196
    setContextMenu({
      file,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    })
  }

  /** Opens the rename dialog for one Office file. */
  function openRenameDialog(file: OfficeFile): void {
    setContextMenu(null)
    setRenameValue(file.name)
    setDialogError(null)
    setImportResult(null)
    setDialog({ file, type: 'rename' })
    setDialogOpen(true)
  }

  /** Opens the guarded product price import dialog for one spreadsheet. */
  function openPriceImportDialog(file: OfficeFile): void {
    setContextMenu(null)
    setDialogError(null)
    setImportResult(null)
    setDialog({ file, type: 'import-prices' })
    setDialogOpen(true)
  }

  /** Closes the active file action dialog when it is safe to do so. */
  function closeDialog(): void {
    if (dialogBusy) {
      return
    }
    setDialogOpen(false)
    setDialogError(null)
    setImportResult(null)
  }

  /** Submits a rename for the dialog's target file. */
  async function submitRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!dialog || dialog.type !== 'rename' || dialogBusy) {
      return
    }
    setDialogBusy(true)
    setDialogError(null)
    try {
      await props.onRename(dialog.file.id, renameValue)
      setDialogOpen(false)
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : t('office.sidebar.renameFailed'))
    } finally {
      setDialogBusy(false)
    }
  }

  /** Imports the selected workbook after the explicit confirmation click. */
  async function confirmPriceImport(): Promise<void> {
    if (!dialog || dialog.type !== 'import-prices' || dialogBusy || !props.onImportProductPrices) {
      return
    }
    setDialogBusy(true)
    setDialogError(null)
    try {
      const result = await props.onImportProductPrices(dialog.file.id)
      setImportResult(result)
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : t('office.sidebar.importPricesFailed'),
      )
    } finally {
      setDialogBusy(false)
    }
  }

  /** Persists the list order after a completed drag gesture. */
  function handleDragEnd(event: DragEndEvent): void {
    if (!event.over || event.active.id === event.over.id) {
      return
    }
    const previousIndex = props.files.findIndex((file) => file.id === event.active.id)
    const nextIndex = props.files.findIndex((file) => file.id === event.over?.id)
    if (previousIndex < 0 || nextIndex < 0) {
      return
    }
    const orderedIds = arrayMove(props.files, previousIndex, nextIndex).map((file) => file.id)
    void props.onReorder(orderedIds)
  }

  return (
    <>
    <aside
      ref={asideRef}
      className={[
        'flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-950/10 bg-panel/95 text-ink backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-white/10',
        hoverOverlay ? 'absolute inset-y-0 left-0 z-20' : 'w-full',
        hoverOverlay && props.expanded ? 'shadow-xl shadow-black/20' : '',
      ].join(' ')}
      style={
        hoverOverlay
          ? { width: props.expanded ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX }
          : undefined
      }
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={(event) => {
        props.onPointerLeave()
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
          return
        }
        const root = asideRef.current
        const active = document.activeElement
        if (root && active instanceof HTMLElement && root.contains(active)) {
          active.blur()
        }
      }}
      onFocusCapture={props.onFocusIn}
      onBlurCapture={(event) =>
        props.onFocusOut({
          currentTarget: asideRef.current,
          relatedTarget: event.relatedTarget,
        })
      }
    >
      <div className="relative min-h-0 flex-1">
      <div
        inert={!collapsed}
        aria-hidden={!collapsed}
        className={`absolute inset-0 flex flex-col items-center py-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          collapsed
            ? 'translate-x-0 opacity-100 delay-100'
            : '-translate-x-2 opacity-0 pointer-events-none'
        }`}
        style={{ width: SIDEBAR_COLLAPSED_PX }}
      >
        <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
          {props.files.map((file) => {
            const active = file.id === props.activeFileId
            return (
              <button
                key={file.id}
                type="button"
                className={`flex size-8 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 active:scale-90 ${
                  active
                    ? 'bg-zinc-950/8 text-ink dark:bg-white/12'
                    : 'text-muted hover:bg-zinc-950/6 hover:text-ink dark:hover:bg-white/10'
                }`}
                title={file.name}
                aria-label={file.name}
                aria-current={active ? 'page' : undefined}
                onClick={() => props.onSelect(file.id)}
                onContextMenu={(event) => openContextMenu(event, file)}
              >
                <span className="relative">
                  {officeKindIcon(props.kind, 'size-4')}
                  {file.color ? (
                    <span
                      className="absolute -right-1 -bottom-1 size-2 rounded-full ring-1 ring-panel"
                      style={{ backgroundColor: file.color }}
                      aria-hidden
                    />
                  ) : null}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div
        inert={collapsed}
        aria-hidden={collapsed}
        className={`absolute inset-0 flex flex-col transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          collapsed
            ? '-translate-x-3 opacity-0 pointer-events-none'
            : 'translate-x-0 opacity-100 delay-75'
        }`}
        style={{ width: SIDEBAR_EXPANDED_PX }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          {officeKindIcon(props.kind, 'size-[18px] text-brand')}
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {t('office.sidebar.title')}
          </h2>
        </div>

        {props.canCreate ? (
          <div className="px-3 py-2.5">
            <button
              type="button"
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-brand text-xs font-semibold text-brand-fg shadow-sm shadow-brand/15 transition-[opacity,transform,box-shadow] duration-200 hover:opacity-90 hover:shadow-md hover:shadow-brand/20 active:scale-[0.97]"
              onClick={props.onCreate}
            >
              <PlusIcon className="size-3.5" aria-hidden />
              {t('office.sidebar.new')}
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {props.files.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs leading-5 text-muted">
              {t('office.sidebar.empty')}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={() => setContextMenu(null)}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={props.files.map((file) => file.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1">
                  {props.files.map((file) => (
                    <SortableLibraryFile
                      key={file.id}
                      file={file}
                      active={file.id === props.activeFileId}
                      updatedLabel={dateFormatter.format(new Date(file.updatedAt))}
                      deleteLabel={t('office.sidebar.deleteFile', { name: file.name })}
                      onSelect={() => props.onSelect(file.id)}
                      onDelete={() => props.onDelete(file.id)}
                      onContextMenu={(event) => openContextMenu(event, file)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>
      </div>

      {nativeApplicationMenu ? null : (
        <SidebarModeControl
          expanded={props.expanded}
          mode={props.mode}
          onSetMode={props.onSetMode}
        />
      )}
    </aside>
    {contextMenu
      ? createPortal(
          <div
            role="menu"
            aria-label={contextMenu.file.name}
            className="fixed z-[120] w-56 overflow-hidden rounded-xl bg-white/95 p-1.5 text-xs text-ink shadow-2xl ring-1 ring-zinc-950/8 backdrop-blur-xl animate-dropdown-in dark:bg-zinc-900/95 dark:ring-white/10"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            {props.canEdit ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium transition-colors hover:bg-zinc-950/5 dark:hover:bg-white/8"
                onClick={() => openRenameDialog(contextMenu.file)}
              >
                <PencilIcon className="size-3.5 text-muted" aria-hidden />
                {t('office.sidebar.rename')}
              </button>
            ) : null}
            {props.kind === 'sheets' && props.onImportProductPrices ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium transition-colors hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300"
                onClick={() => openPriceImportDialog(contextMenu.file)}
              >
                <UploadIcon className="size-3.5 text-amber-500" aria-hidden />
                {t('office.sidebar.importProductPrices')}
              </button>
            ) : null}
            {props.canMoveToGroup && props.onMoveToGroup ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium transition-colors hover:bg-zinc-950/5 dark:hover:bg-white/8"
                onClick={() => {
                  const fileId = contextMenu.file.id
                  setContextMenu(null)
                  props.onMoveToGroup?.(fileId)
                }}
              >
                {t('office.sidebar.moveToGroup')}
              </button>
            ) : null}
            {props.canCopyToPersonal && props.onCopyToPersonal ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium transition-colors hover:bg-zinc-950/5 dark:hover:bg-white/8"
                onClick={() => {
                  const fileId = contextMenu.file.id
                  setContextMenu(null)
                  props.onCopyToPersonal?.(fileId)
                }}
              >
                {t('office.sidebar.copyToPersonal')}
              </button>
            ) : null}
            {props.canEdit ? (
              <div className="my-1 border-y border-zinc-950/6 px-2.5 py-2 dark:border-white/8">
                <p className="mb-1.5 text-[10px] font-semibold text-muted">
                  {t('office.sidebar.fileColor')}
                </p>
                <div
                  className="flex items-center justify-between"
                  role="group"
                  aria-label={t('office.sidebar.fileColor')}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!contextMenu.file.color}
                    aria-label={t('office.sidebar.clearColor')}
                    title={t('office.sidebar.clearColor')}
                    className={`relative size-[18px] shrink-0 overflow-hidden rounded-full border border-zinc-950/20 transition-transform hover:scale-110 dark:border-white/25 ${
                      contextMenu.file.color ? '' : 'ring-2 ring-brand ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
                    }`}
                    onClick={() => {
                      const fileId = contextMenu.file.id
                      setContextMenu(null)
                      void props.onColorChange(fileId, null)
                    }}
                  >
                    <span className="absolute inset-0 bg-linear-to-br from-transparent from-45% via-rose-500 via-48% to-transparent to-52%" />
                  </button>
                  {OFFICE_FILE_COLOR_PALETTE.map((swatch) => {
                    const selected = contextMenu.file.color === swatch
                    return (
                      <button
                        key={swatch}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        aria-label={`${t('office.sidebar.fileColor')} ${swatch}`}
                        title={swatch}
                        className={`size-[18px] shrink-0 rounded-full transition-transform hover:scale-110 ${
                          selected
                            ? 'ring-2 ring-brand ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
                            : ''
                        }`}
                        style={{ backgroundColor: swatch }}
                        onClick={() => {
                          const fileId = contextMenu.file.id
                          setContextMenu(null)
                          void props.onColorChange(fileId, swatch)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            ) : null}
            {props.canDelete ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
                onClick={() => {
                  const fileId = contextMenu.file.id
                  setContextMenu(null)
                  props.onDelete(fileId)
                }}
              >
                <TrashIcon className="size-3.5" aria-hidden />
                {t('office.sidebar.delete')}
              </button>
            ) : null}
          </div>,
          document.body,
        )
      : null}
    {dialogPresence.mounted && dialog
      ? createPortal(
          <div
            className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-sm ${
              dialogPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
            }`}
            onClick={closeDialog}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="office-library-dialog-title"
              className="w-full max-w-md rounded-3xl bg-white p-5 text-ink shadow-2xl ring-1 ring-zinc-950/8 dark:bg-zinc-900 dark:ring-white/10"
              onClick={(event) => event.stopPropagation()}
            >
              {dialog.type === 'rename' ? (
                <form onSubmit={(event) => void submitRename(event)}>
                  <h3 id="office-library-dialog-title" className="text-base font-bold">
                    {t('office.sidebar.renameTitle')}
                  </h3>
                  <p className="mt-1 text-xs text-muted">{dialog.file.name}</p>
                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-muted">
                      {t('office.sidebar.renameLabel')}
                    </span>
                    <input
                      autoFocus
                      value={renameValue}
                      disabled={dialogBusy}
                      className="mt-1.5 w-full rounded-xl bg-zinc-950/5 px-3 py-2 text-sm outline-none ring-1 ring-transparent transition focus:ring-brand/40 disabled:opacity-60 dark:bg-white/8"
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                  </label>
                  {dialogError ? (
                    <p className="mt-2 text-xs font-medium text-rose-500">{dialogError}</p>
                  ) : null}
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={dialogBusy}
                      className="rounded-xl bg-zinc-950/5 px-4 py-2 text-sm font-semibold transition-colors hover:bg-zinc-950/8 disabled:opacity-50 dark:bg-white/8 dark:hover:bg-white/12"
                      onClick={closeDialog}
                    >
                      {t('office.sidebar.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={dialogBusy || renameValue.trim().length === 0}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                    >
                      {dialogBusy ? t('office.sidebar.renaming') : t('office.sidebar.renameAction')}
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <h3 id="office-library-dialog-title" className="text-base font-bold">
                    {t('office.sidebar.importPricesTitle')}
                  </h3>
                  {importResult ? (
                    <div className="mt-4 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      {t('office.sidebar.importPricesDone', {
                        count: importResult.imported,
                        year: importResult.year,
                        quarter: importResult.quarter,
                      })}
                    </div>
                  ) : (
                    <>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {t('office.sidebar.importPricesConfirm', {
                          name: dialog.file.name,
                          year: importPeriod?.year,
                          quarter: importPeriod?.quarter,
                        })}
                      </p>
                      <div className="mt-4 rounded-2xl bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                        {t('office.sidebar.importPricesWarning')}
                      </div>
                    </>
                  )}
                  {dialogError ? (
                    <p className="mt-3 text-xs font-medium text-rose-500">{dialogError}</p>
                  ) : null}
                  <div className="mt-5 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={dialogBusy}
                      className="rounded-xl bg-zinc-950/5 px-4 py-2 text-sm font-semibold transition-colors hover:bg-zinc-950/8 disabled:opacity-50 dark:bg-white/8 dark:hover:bg-white/12"
                      onClick={closeDialog}
                    >
                      {importResult ? t('office.sidebar.close') : t('office.sidebar.cancel')}
                    </button>
                    {!importResult ? (
                      <button
                        type="button"
                        disabled={dialogBusy}
                        className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
                        onClick={() => void confirmPriceImport()}
                      >
                        {dialogBusy
                          ? t('office.sidebar.importPricesInProgress')
                          : t('office.sidebar.importPricesAction')}
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>,
          document.body,
        )
      : null}
    </>
  )
}
