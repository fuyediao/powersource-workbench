/**
 * Folio left-rail page tree with expand/collapse motion.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FolioPageRecord } from '@/services/folio-api'
import { ChevronRightIcon, FileTextIcon, PlusIcon, SearchIcon, StarIcon, TrashIcon } from '@/icons/AllIcons'

interface FolioTreeNode {
  page: FolioPageRecord
  children: FolioTreeNode[]
}

export interface FolioPageTreeProps {
  pages: FolioPageRecord[]
  selectedId: string | null
  canCreate: boolean
  onSelect: (pageId: string) => void
  onCreate: (parentId: string | null) => void
  favoriteIds: Set<string>
  trashMode: boolean
  onTrashModeChange: (trash: boolean) => void
  onReorder: (draggedId: string, target: FolioPageRecord) => void
}

/**
 * Build a forest from flat page rows.
 * @param pages - Flat page list.
 * @returns Root nodes.
 */
function buildTree(pages: FolioPageRecord[]): FolioTreeNode[] {
  const byParent = new Map<string | null, FolioPageRecord[]>()
  for (const page of pages) {
    const key = page.parentId
    if (!byParent.has(key)) {
      byParent.set(key, [])
    }
    byParent.get(key)!.push(page)
  }
  const walk = (parentId: string | null): FolioTreeNode[] => {
    const kids = byParent.get(parentId) ?? []
    return kids.map((page) => ({
      page,
      children: walk(page.id),
    }))
  }
  return walk(null)
}

interface TreeRowProps {
  node: FolioTreeNode
  depth: number
  selectedId: string | null
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (pageId: string) => void
  canCreate: boolean
  onCreateChild: (parentId: string) => void
  favoriteIds: Set<string>
  onReorder: (draggedId: string, target: FolioPageRecord) => void
}

/**
 * One expandable tree row.
 * @param props - Node and interaction handlers.
 * @returns Row element.
 */
function TreeRow({
  node,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  canCreate,
  onCreateChild,
  favoriteIds,
  onReorder,
}: TreeRowProps) {
  const { t } = useTranslation()
  const isOpen = expanded.has(node.page.id)
  const hasChildren = node.children.length > 0
  const active = selectedId === node.page.id

  return (
    <div>
      <div
        draggable={canCreate}
        onDragStart={(event) => event.dataTransfer.setData('text/x-folio-page', node.page.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const draggedId = event.dataTransfer.getData('text/x-folio-page')
          if (draggedId && draggedId !== node.page.id) onReorder(draggedId, node.page)
        }}
        className={[
          'group flex items-center gap-0.5 rounded-lg pr-1 transition',
          active ? 'bg-folio-tree-active text-brand' : 'text-ink hover:bg-folio-tree-hover',
        ].join(' ')}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-ink/5"
          aria-label={isOpen ? t('folio.tree.collapse') : t('folio.tree.expand')}
          onClick={() => onToggle(node.page.id)}
        >
          <ChevronRightIcon
            className={[
              'size-3.5 transition-transform duration-200',
              isOpen || !hasChildren ? '' : '',
              isOpen ? 'rotate-90' : '',
              hasChildren ? 'opacity-100' : 'opacity-30',
            ].join(' ')}
            aria-hidden
          />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium"
          onClick={() => onSelect(node.page.id)}
        >
          <FileTextIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
          {favoriteIds.has(node.page.id) ? <StarIcon className="size-3 shrink-0 text-brand" filled aria-hidden /> : null}
          <span className="truncate">{node.page.title || t('folio.untitled')}</span>
        </button>
        {canCreate ? (
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted opacity-0 transition group-hover:opacity-100 hover:bg-ink/5 hover:text-ink"
            aria-label={t('folio.tree.addChild')}
            onClick={() => onCreateChild(node.page.id)}
          >
            <PlusIcon className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <div
        className={[
          'grid transition-[grid-template-rows] duration-200 ease-out',
          isOpen && hasChildren ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
      >
        <div className="overflow-hidden">
          {node.children.map((child) => (
            <TreeRow
              key={child.page.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              canCreate={canCreate}
              onCreateChild={onCreateChild}
              favoriteIds={favoriteIds}
              onReorder={onReorder}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Folio page tree rail.
 * @param props - Pages and handlers.
 * @returns Tree UI.
 */
export function FolioPageTree({
  pages,
  selectedId,
  canCreate,
  onSelect,
  onCreate,
  favoriteIds,
  trashMode,
  onTrashModeChange,
  onReorder,
}: FolioPageTreeProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const visiblePages = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return pages
    return pages.filter((page) => page.title.toLowerCase().includes(normalized))
  }, [pages, query])
  const visibleTree = useMemo(() => buildTree(visiblePages), [visiblePages])

  /**
   * Toggle expand/collapse for a page id.
   * @param id - Page id.
   */
  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {t('folio.tree.title')}
        </span>
        {canCreate ? (
          <button
            type="button"
            className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-folio-tree-hover hover:text-ink"
            aria-label={t('folio.newPage')}
            onClick={() => onCreate(null)}
          >
            <PlusIcon className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-lg bg-folio-input px-2 text-muted">
          <SearchIcon className="size-3.5" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none"
            placeholder={t('folio.tree.search')}
          />
        </label>
        <button
          type="button"
          className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-folio-tree-hover"
          onClick={() => onTrashModeChange(!trashMode)}
        >
          <TrashIcon className="size-3.5" aria-hidden />
          {trashMode ? t('folio.tree.backToPages') : t('folio.trash.title')}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {!trashMode && favoriteIds.size > 0 && !query ? (
          <div className="mb-2 border-b border-ink/8 pb-2">
            <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted">{t('folio.favorites.title')}</p>
            {pages.filter((page) => favoriteIds.has(page.id)).map((page) => (
              <button key={page.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs font-semibold hover:bg-folio-tree-hover" onClick={() => onSelect(page.id)}>
                <StarIcon className="size-3 text-brand" filled aria-hidden />
                <span className="truncate">{page.title || t('folio.untitled')}</span>
              </button>
            ))}
          </div>
        ) : null}
        {visibleTree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs font-medium text-muted">
            {t('folio.tree.empty')}
          </p>
        ) : (
          visibleTree.map((node) => (
            <TreeRow
              key={node.page.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              canCreate={canCreate}
              onCreateChild={(parentId) => onCreate(parentId)}
              favoriteIds={favoriteIds}
              onReorder={onReorder}
            />
          ))
        )}
      </div>
    </div>
  )
}
