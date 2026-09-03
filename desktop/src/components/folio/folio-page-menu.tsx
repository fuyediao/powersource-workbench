/** Folio page overflow menu. */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontalIcon, StarIcon } from '@/icons/AllIcons'
import type { FolioEditorMode } from '@/services/folio-api'

export type FolioPageMenuAction =
  | 'rename'
  | 'new-tab'
  | 'info'
  | 'toc'
  | 'history'
  | 'duplicate'
  | 'import-markdown'
  | 'import-html'
  | 'export-markdown'
  | 'export-html'
  | 'trash'

export interface FolioPageMenuProps {
  canEdit: boolean
  canDelete: boolean
  favorite: boolean
  primaryMode: FolioEditorMode
  onAction: (action: FolioPageMenuAction) => void
  onFavoriteChange: (favorite: boolean) => void
  onPrimaryModeChange: (mode: FolioEditorMode) => void
}

/**
 * AFFiNE-style overflow menu for the current page.
 * @param props - Capabilities and action callbacks.
 * @returns Menu control.
 */
export function FolioPageMenu({
  canEdit,
  canDelete,
  favorite,
  primaryMode,
  onAction,
  onFavoriteChange,
  onPrimaryModeChange,
}: FolioPageMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const run = (action: FolioPageMenuAction) => {
    setOpen(false)
    onAction(action)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-folio-tree-hover hover:text-ink"
        aria-label={t('folio.menu.more')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontalIcon className="size-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-40 w-60 rounded-xl border border-ink/10 bg-folio-dialog p-1.5 text-xs shadow-xl backdrop-blur-xl">
          <button type="button" className="folio-menu-row" onClick={() => run('rename')} disabled={!canEdit}>{t('folio.menu.rename')}</button>
          <label className="folio-menu-row justify-between">
            {t('folio.menu.defaultMode')}
            <select
              className="rounded-md bg-folio-input px-1 py-0.5"
              value={primaryMode}
              disabled={!canEdit}
              onChange={(event) => onPrimaryModeChange(event.target.value as FolioEditorMode)}
            >
              <option value="page">{t('folio.mode.page')}</option>
              <option value="edgeless">{t('folio.mode.canvas')}</option>
            </select>
          </label>
          <button type="button" className="folio-menu-row gap-2" onClick={() => onFavoriteChange(!favorite)}>
            <StarIcon className="size-3.5" filled={favorite} aria-hidden />
            {favorite ? t('folio.menu.removeFavorite') : t('folio.menu.addFavorite')}
          </button>
          {(['new-tab', 'info', 'toc', 'history'] as const).map((action) => (
            <button key={action} type="button" className="folio-menu-row" onClick={() => run(action)}>{t(`folio.menu.${action}`)}</button>
          ))}
          <div className="my-1 border-t border-ink/8" />
          <button type="button" className="folio-menu-row" disabled={!canEdit} onClick={() => run('duplicate')}>{t('folio.menu.duplicate')}</button>
          <button type="button" className="folio-menu-row" disabled={!canEdit} onClick={() => run('import-markdown')}>{t('folio.menu.importMarkdown')}</button>
          <button type="button" className="folio-menu-row" disabled={!canEdit} onClick={() => run('import-html')}>{t('folio.menu.importHtml')}</button>
          <button type="button" className="folio-menu-row" onClick={() => run('export-markdown')}>{t('folio.menu.exportMarkdown')}</button>
          <button type="button" className="folio-menu-row" onClick={() => run('export-html')}>{t('folio.menu.exportHtml')}</button>
          <div className="my-1 border-t border-ink/8" />
          <button type="button" className="folio-menu-row text-red-500" disabled={!canDelete} onClick={() => run('trash')}>{t('folio.menu.trash')}</button>
        </div>
      ) : null}
    </div>
  )
}
