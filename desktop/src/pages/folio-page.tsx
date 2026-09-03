/**
 * Folio workspace: personal/group page tree + Yjs editor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { FolioEditor, type FolioEditorHandle, type FolioHeading } from '@/components/folio/folio-editor'
import { FolioEdgelessLoader } from '@/components/folio/folio-edgeless-loader'
import { FolioMenubar } from '@/components/folio/folio-menubar'
import { FolioPageMenu, type FolioPageMenuAction } from '@/components/folio/folio-page-menu'
import { FolioPageTree } from '@/components/folio/folio-page-tree'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useFolioScope } from '@/hooks/use-folio-scope'
import {
  copyFolioPageToPersonal,
  createGroupFolioPage,
  createPersonalFolioPage,
  createFolioPageVersion,
  duplicateFolioPage,
  fetchFolioPage,
  listGroupFolioPages,
  listFolioFavoriteIds,
  listFolioPageVersions,
  listFolioTrash,
  listPersonalFolioPages,
  moveFolioPageToGroup,
  purgeFolioPage,
  reorderFolioPage,
  restoreFolioPage,
  restoreFolioPageVersion,
  setFolioFavorite,
  trashFolioPage,
  updateFolioPage,
  type FolioEditorMode,
  type FolioPageRecord,
  type FolioPageVersionRecord,
} from '@/services/folio-api'
import {
  patchFolioMenuHandlers,
  setFolioMenuView,
  unregisterFolioMenuHost,
} from '@/utils/folio/folio-menu'

const DIALOG_MS = 220

export interface FolioPageProps {
  userId: string
  user: User
  initialPageId?: string | null
}

/**
 * Folio feature page shell.
 * @param props - Signed-in user.
 * @returns Folio UI.
 */
export function FolioPage({ userId, user, initialPageId = null }: FolioPageProps) {
  const { t } = useTranslation()
  const scope = useFolioScope(userId)
  const [pages, setPages] = useState<FolioPageRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialPageId)
  const [activePage, setActivePage] = useState<FolioPageRecord | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [loadingPages, setLoadingPages] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveGroupId, setMoveGroupId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set())
  const [trashMode, setTrashMode] = useState(false)
  const [sidePanel, setSidePanel] = useState<'info' | 'toc' | 'history' | null>(null)
  const [versions, setVersions] = useState<FolioPageVersionRecord[]>([])
  const [headings, setHeadings] = useState<FolioHeading[]>([])
  const [editorMode, setEditorMode] = useState<FolioEditorMode>('page')
  const [editorRevision, setEditorRevision] = useState(0)
  const editorRef = useRef<FolioEditorHandle | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const importFormatRef = useRef<'markdown' | 'html'>('markdown')
  const versionTimerRef = useRef<number | null>(null)
  const movePresence = useDialogPresence(moveOpen, DIALOG_MS)
  const editorPresence = useDialogPresence(activePage != null, 180)

  const userLabel =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.display_name as string | undefined) ||
    user.email ||
    userId

  const reloadPages = useCallback(async () => {
    setLoadingPages(true)
    setError(null)
    try {
      if (trashMode) {
        const rows = scope.mode === 'personal'
          ? await listFolioTrash({ ownerUserId: userId })
          : scope.selectedGroupId
            ? await listFolioTrash({ groupId: scope.selectedGroupId })
            : []
        setPages(rows)
      } else if (scope.mode === 'personal') {
        const rows = await listPersonalFolioPages(userId)
        setPages(rows)
      } else if (scope.selectedGroupId) {
        const rows = await listGroupFolioPages(scope.selectedGroupId)
        setPages(rows)
      } else {
        setPages([])
      }
    } catch (err) {
      console.error(err)
      setError(t('folio.errors.loadFailed'))
    } finally {
      setLoadingPages(false)
    }
  }, [scope.mode, scope.selectedGroupId, userId, t, trashMode])

  useEffect(() => {
    void listFolioFavoriteIds(userId).then((ids) => setFavoriteIds(new Set(ids)))
  }, [userId])

  useEffect(() => {
    void reloadPages()
    setSelectedId(initialPageId)
    setActivePage(null)
  }, [reloadPages, initialPageId])

  useEffect(() => {
    if (!selectedId) {
      setActivePage(null)
      return
    }
    void fetchFolioPage(selectedId).then((page) => {
      setActivePage(page)
      setTitleDraft(page?.title ?? '')
      setEditorMode(page?.primaryMode ?? 'page')
    })
  }, [selectedId])

  const moveTargets = useMemo(() => {
    if (scope.canSwitchGroups) {
      return scope.switchableGroups
    }
    return scope.membershipGroup ? [scope.membershipGroup] : []
  }, [scope.canSwitchGroups, scope.switchableGroups, scope.membershipGroup])

  /**
   * Create a new page under an optional parent.
   * @param parentId - Parent page id or null for root.
   */
  const handleCreate = async (parentId: string | null) => {
    if (!scope.capabilities.canCreate) {
      return
    }
    const title = t('folio.untitled')
    const created =
      scope.mode === 'personal'
        ? await createPersonalFolioPage(userId, title, parentId)
        : scope.selectedGroupId
          ? await createGroupFolioPage(scope.selectedGroupId, title, parentId)
          : null
    if (!created) {
      setError(t('folio.errors.createFailed'))
      return
    }
    await reloadPages()
    setSelectedId(created.id)
  }

  /**
   * Persist title edits.
   */
  const commitTitle = async () => {
    if (!activePage || !scope.capabilities.canEdit) {
      return
    }
    const next = titleDraft.trim() || t('folio.untitled')
    if (next === activePage.title) {
      return
    }
    const ok = await updateFolioPage(activePage.id, { title: next })
    if (!ok) {
      setError(t('folio.errors.saveFailed'))
      return
    }
    setActivePage({ ...activePage, title: next })
    setPages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, title: next } : p)))
  }

  /**
   * Delete the selected page.
   */
  const handleDelete = async () => {
    if (!selectedId || !scope.capabilities.canDelete) {
      return
    }
    const ok = await trashFolioPage(selectedId)
    if (!ok) {
      setError(t('folio.errors.deleteFailed'))
      return
    }
    setSelectedId(null)
    setActivePage(null)
    await reloadPages()
  }

  /** Restore the selected trash row. */
  const handleRestore = async () => {
    if (!selectedId || !scope.capabilities.canEdit) return
    if (await restoreFolioPage(selectedId)) {
      setSelectedId(null)
      setActivePage(null)
      await reloadPages()
    }
  }

  /** Permanently remove the selected trash row. */
  const handlePurge = async () => {
    if (!selectedId || !scope.capabilities.canDelete) return
    if (!window.confirm(t('folio.trash.confirmPermanentDelete'))) return
    if (await purgeFolioPage(selectedId)) {
      setSelectedId(null)
      setActivePage(null)
      await reloadPages()
    }
  }

  /** Persist a page mode and remount BlockStdScope. */
  const changeMode = async (mode: FolioEditorMode) => {
    if (!activePage) return
    setEditorMode(mode)
    setEditorRevision((value) => value + 1)
    if (scope.capabilities.canEdit) {
      await updateFolioPage(activePage.id, { primaryMode: mode })
      setActivePage({ ...activePage, primaryMode: mode })
    }
  }

  /** Save a manual or automatic full version snapshot. */
  const saveVersion = async () => {
    if (!activePage || !scope.capabilities.canEdit) return
    const state = editorRef.current?.encodeState()
    if (!state) return
    if (await createFolioPageVersion(activePage.id, activePage.title, state)) {
      setVersions(await listFolioPageVersions(activePage.id))
    }
  }

  /** Debounce full version snapshots after successful editor persistence. */
  const scheduleVersion = () => {
    if (versionTimerRef.current != null) window.clearTimeout(versionTimerRef.current)
    versionTimerRef.current = window.setTimeout(() => void saveVersion(), 5000)
  }

  /** Download plain text without invoking Electron filesystem APIs. */
  const downloadText = (extension: 'md' | 'html', content: string) => {
    if (!activePage) return
    const blob = new Blob([content], { type: extension === 'md' ? 'text/markdown' : 'text/html' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${activePage.title || 'folio'}.${extension}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  /** Execute one overflow-menu action. */
  const handleMenuAction = async (action: FolioPageMenuAction) => {
    if (!activePage) return
    if (action === 'rename') titleRef.current?.focus()
    else if (action === 'new-tab') window.dispatchEvent(new CustomEvent('workbench:open-folio-page', { detail: { pageId: activePage.id, title: activePage.title } }))
    else if (action === 'info' || action === 'toc' || action === 'history') {
      setSidePanel(action)
      if (action === 'toc') setHeadings(editorRef.current?.headings() ?? [])
      if (action === 'history') setVersions(await listFolioPageVersions(activePage.id))
    } else if (action === 'duplicate') {
      const copy = await duplicateFolioPage(activePage, t('folio.duplicateTitle', { title: activePage.title }))
      if (copy) {
        await reloadPages()
        setSelectedId(copy.id)
      }
    } else if (action.startsWith('import-')) {
      importFormatRef.current = action === 'import-html' ? 'html' : 'markdown'
      fileInputRef.current?.click()
    } else if (action === 'export-markdown') {
      downloadText('md', editorRef.current?.exportText('markdown') ?? '')
    } else if (action === 'export-html') {
      downloadText('html', editorRef.current?.exportText('html') ?? '')
    } else if (action === 'trash') await handleDelete()
  }

  /**
   * Copy the open page into personal Folio.
   */
  const handleCopy = async () => {
    if (!activePage || !scope.capabilities.canCopyToPersonal) {
      return
    }
    const full = (await fetchFolioPage(activePage.id)) ?? activePage
    const copy = await copyFolioPageToPersonal(full, userId)
    if (!copy) {
      setError(t('folio.errors.copyFailed'))
      return
    }
    scope.setMode('personal')
    const rows = await listPersonalFolioPages(userId)
    setPages(rows)
    setSelectedId(copy.id)
  }

  /**
   * Confirm move-to-group dialog.
   */
  const confirmMove = async () => {
    if (!selectedId || !moveGroupId) {
      return
    }
    const ok = await moveFolioPageToGroup(selectedId, moveGroupId)
    setMoveOpen(false)
    if (!ok) {
      setError(t('folio.errors.moveFailed'))
      return
    }
    scope.setMode('group')
    scope.setSelectedGroupId(moveGroupId)
    setSelectedId(null)
    setActivePage(null)
  }

  /** Reparent/reorder a dragged page at the target row. */
  const handleReorder = async (draggedId: string, target: FolioPageRecord) => {
    if (!scope.capabilities.canEdit) return
    if (await reorderFolioPage(draggedId, target.parentId, target.sortOrder)) await reloadPages()
  }

  useEffect(() => {
    return () => unregisterFolioMenuHost()
  }, [])

  useEffect(() => {
    patchFolioMenuHandlers({
      setMode: scope.setMode,
      selectGroup: scope.setSelectedGroupId,
      newPage: () => {
        void handleCreate(null)
      },
      moveToGroup: () => {
        setMoveGroupId(moveTargets[0]?.id ?? '')
        setMoveOpen(true)
      },
      copyToPersonal: () => {
        void handleCopy()
      },
      deletePage: () => {
        void handleDelete()
      },
    })
  }, [
    handleCopy,
    handleCreate,
    handleDelete,
    moveTargets,
    scope.setMode,
    scope.setSelectedGroupId,
  ])

  useEffect(() => {
    setFolioMenuView({
      mode: scope.mode,
      groups: scope.switchableGroups.map((group) => ({
        id: group.id,
        label: group.name,
      })),
      selectedGroupId: scope.selectedGroupId,
      canSwitchGroups: scope.canSwitchGroups,
      canCreate: scope.capabilities.canCreate,
      canMoveToGroup: scope.capabilities.canMoveToGroup,
      canCopyToPersonal: scope.capabilities.canCopyToPersonal,
      canDelete: scope.capabilities.canDelete,
      hasSelection: selectedId != null,
    })
  }, [
    scope.canSwitchGroups,
    scope.capabilities.canCopyToPersonal,
    scope.capabilities.canCreate,
    scope.capabilities.canDelete,
    scope.capabilities.canMoveToGroup,
    scope.mode,
    scope.selectedGroupId,
    scope.switchableGroups,
    selectedId,
  ])

  return (
    <div className="folio-page flex h-full min-h-0 max-h-full flex-col overflow-hidden bg-folio-chrome text-ink shadow-folio-chrome">
      <FolioMenubar
        mode={scope.mode}
        onModeChange={scope.setMode}
        canSwitchGroups={scope.canSwitchGroups}
        switchableGroups={scope.switchableGroups}
        selectedGroupId={scope.selectedGroupId}
        onGroupChange={scope.setSelectedGroupId}
        capabilities={scope.capabilities}
        hasSelection={selectedId != null}
        onNewPage={() => void handleCreate(null)}
        onMoveToGroup={() => {
          setMoveGroupId(moveTargets[0]?.id ?? '')
          setMoveOpen(true)
        }}
        onCopyToPersonal={() => void handleCopy()}
        onDelete={() => void handleDelete()}
      />

      <div className="flex min-h-0 flex-1 bg-folio-workspace">
        <aside className="flex w-64 shrink-0 flex-col border-r border-ink/8 bg-folio-sidebar backdrop-blur-xl">
          <div
            key={`${scope.mode}:${scope.selectedGroupId ?? ''}:${trashMode ? 'trash' : 'pages'}`}
            className="flex min-h-0 flex-1 flex-col animate-[folio-scope-in_220ms_ease-out]"
          >
          {scope.isLoading || loadingPages ? (
            <p className="px-4 py-6 text-xs font-medium text-muted">{t('status.loading')}</p>
          ) : scope.mode === 'group' && !scope.selectedGroupId ? (
            <p className="px-4 py-6 text-center text-xs font-medium text-muted">
              {t('folio.empty.noGroup')}
            </p>
          ) : (
            <FolioPageTree
              pages={pages}
              selectedId={selectedId}
              canCreate={scope.capabilities.canCreate}
              onSelect={setSelectedId}
              onCreate={(parentId) => void handleCreate(parentId)}
              favoriteIds={favoriteIds}
              trashMode={trashMode}
              onTrashModeChange={(value) => {
                setTrashMode(value)
                setSelectedId(null)
                setActivePage(null)
              }}
              onReorder={(draggedId, target) => void handleReorder(draggedId, target)}
            />
          )}
          </div>
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col bg-folio-editor">
          {error ? (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600">
              {error}
            </div>
          ) : null}

          {editorPresence.mounted && activePage ? (
            <div
              className={[
                'flex min-h-0 flex-1 flex-col transition duration-200',
                editorPresence.leaving ? 'translate-y-1 opacity-0' : 'opacity-100',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 border-b border-ink/8 px-8 py-4">
                <input
                  ref={titleRef}
                  className="w-full bg-transparent text-2xl font-extrabold tracking-tight text-ink outline-none placeholder:text-muted"
                  value={titleDraft}
                  readOnly={!scope.capabilities.canEdit}
                  placeholder={t('folio.untitled')}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onBlur={() => void commitTitle()}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) {
                      return
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitTitle()
                    }
                  }}
                />
                {!trashMode ? (
                  <>
                    <div className="flex shrink-0 rounded-lg bg-ink/5 p-0.5 text-xs font-bold">
                      <button type="button" className={`rounded-md px-2 py-1 ${editorMode === 'page' ? 'bg-folio-dialog text-brand shadow-sm' : 'text-muted'}`} onClick={() => void changeMode('page')}>{t('folio.mode.page')}</button>
                      <button type="button" className={`rounded-md px-2 py-1 ${editorMode === 'edgeless' ? 'bg-folio-dialog text-brand shadow-sm' : 'text-muted'}`} onClick={() => void changeMode('edgeless')}>{t('folio.mode.canvas')}</button>
                    </div>
                    <FolioPageMenu
                      canEdit={scope.capabilities.canEdit}
                      canDelete={scope.capabilities.canDelete}
                      favorite={favoriteIds.has(activePage.id)}
                      primaryMode={activePage.primaryMode}
                      onAction={(action) => void handleMenuAction(action)}
                      onFavoriteChange={(favorite) => {
                        void setFolioFavorite(userId, activePage.id, favorite).then((ok) => {
                          if (!ok) return
                          setFavoriteIds((previous) => {
                            const next = new Set(previous)
                            if (favorite) next.add(activePage.id)
                            else next.delete(activePage.id)
                            return next
                          })
                        })
                      }}
                      onPrimaryModeChange={(mode) => void changeMode(mode)}
                    />
                  </>
                ) : null}
                {scope.capabilities.readOnly ? (
                  <p className="mt-1 text-xs font-medium text-muted">{t('folio.readOnly')}</p>
                ) : null}
              </div>
              {trashMode ? (
                <div className="flex flex-1 items-center justify-center gap-3">
                  <button type="button" className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg" onClick={() => void handleRestore()}>{t('folio.trash.restore')}</button>
                  <button type="button" className="rounded-xl bg-red-500/10 px-4 py-2 text-sm font-bold text-red-500" onClick={() => void handlePurge()}>{t('folio.trash.deletePermanently')}</button>
                </div>
              ) : editorMode === 'edgeless' ? (
                <FolioEdgelessLoader
                  key={`${activePage.id}:edgeless:${editorRevision}`}
                  pageId={activePage.id}
                  initialYjsState={activePage.yjsStateBase64}
                  readOnly={!scope.capabilities.canEdit}
                  userLabel={userLabel}
                  onPersisted={scheduleVersion}
                />
              ) : (
                <FolioEditor
                  ref={editorRef}
                  key={`${activePage.id}:page:${editorRevision}`}
                  pageId={activePage.id}
                  initialYjsState={activePage.yjsStateBase64}
                  readOnly={!scope.capabilities.canEdit}
                  placeholder={t('folio.editor.placeholder')}
                  userLabel={userLabel}
                  onPersisted={scheduleVersion}
                />
              )}
            </div>
          ) : (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <h2 className="text-lg font-extrabold text-brand">{t('folio.empty.title')}</h2>
                <p className="mt-2 max-w-sm text-sm font-medium text-muted">
                  {t('folio.empty.body')}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".md,.markdown,.html,.htm,text/markdown,text/html"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          void file.text().then((content) => editorRef.current?.importText(importFormatRef.current, content))
          event.target.value = ''
        }}
      />

      {sidePanel && activePage ? (
        <aside className="fixed bottom-6 right-6 top-20 z-30 w-80 overflow-y-auto rounded-2xl border border-ink/10 bg-folio-dialog p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold">{t(`folio.panel.${sidePanel}`)}</h3>
            <button type="button" className="text-muted" onClick={() => setSidePanel(null)}>×</button>
          </div>
          {sidePanel === 'info' ? (
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="font-bold text-muted">{t('folio.info.title')}</dt><dd>{activePage.title}</dd></div>
              <div><dt className="font-bold text-muted">{t('folio.info.scope')}</dt><dd>{activePage.groupId ? t('folio.scope.group') : t('folio.scope.personal')}</dd></div>
              <div><dt className="font-bold text-muted">{t('folio.info.created')}</dt><dd>{new Date(activePage.createdAt).toLocaleString()}</dd></div>
              <div><dt className="font-bold text-muted">{t('folio.info.updated')}</dt><dd>{new Date(activePage.updatedAt).toLocaleString()}</dd></div>
              <div><dt className="font-bold text-muted">{t('folio.info.mode')}</dt><dd>{t(`folio.mode.${activePage.primaryMode === 'edgeless' ? 'canvas' : 'page'}`)}</dd></div>
              <div><dt className="font-bold text-muted">{t('folio.info.attachments')}</dt><dd>0</dd></div>
            </dl>
          ) : sidePanel === 'toc' ? (
            <div className="mt-4 space-y-1">
              {headings.length ? headings.map((heading) => (
                <button key={heading.id} type="button" className="block w-full truncate rounded-lg py-1 text-left text-xs hover:bg-folio-tree-hover" style={{ paddingLeft: `${(heading.level - 1) * 10 + 8}px` }} onClick={() => editorRef.current?.scrollToBlock(heading.id)}>{heading.text}</button>
              )) : <p className="text-xs text-muted">{t('folio.toc.empty')}</p>}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {scope.capabilities.canEdit ? <button type="button" className="w-full rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-fg" onClick={() => void saveVersion()}>{t('folio.history.save')}</button> : null}
              {versions.map((version) => (
                <div key={version.id} className="rounded-xl border border-ink/8 p-3 text-xs">
                  <p className="font-bold">{version.title || t('folio.untitled')}</p>
                  <p className="mt-1 text-muted">{new Date(version.createdAt).toLocaleString()}</p>
                  {scope.capabilities.canEdit ? <button type="button" className="mt-2 font-bold text-brand" onClick={() => void restoreFolioPageVersion(version).then(async (ok) => { if (!ok) return; const restored = await fetchFolioPage(version.pageId); setActivePage(restored); setTitleDraft(restored?.title ?? ''); setEditorRevision((value) => value + 1) })}>{t('folio.history.restore')}</button> : null}
                </div>
              ))}
            </div>
          )}
        </aside>
      ) : null}

      {movePresence.mounted ? (
        <div
          className={[
            'fixed inset-0 z-50 flex items-center justify-center bg-folio-overlay p-4 transition duration-200',
            movePresence.leaving ? 'opacity-0' : 'opacity-100',
          ].join(' ')}
          role="presentation"
          onClick={() => setMoveOpen(false)}
        >
          <div
            className={[
              'w-full max-w-sm rounded-2xl border border-ink/10 bg-folio-dialog p-5 shadow-xl backdrop-blur-xl transition duration-200',
              movePresence.leaving ? 'translate-y-2 scale-95 opacity-0' : 'translate-y-0 scale-100 opacity-100',
            ].join(' ')}
            role="dialog"
            aria-modal="true"
            aria-label={t('folio.actions.moveToGroup')}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-extrabold text-ink">{t('folio.actions.moveToGroup')}</h3>
            <p className="mt-1 text-xs font-medium text-muted">{t('folio.move.hint')}</p>
            <select
              className="mt-4 h-9 w-full rounded-xl border border-ink/10 bg-folio-input px-3 text-sm font-semibold outline-none"
              value={moveGroupId}
              onChange={(event) => setMoveGroupId(event.target.value)}
            >
              {moveTargets.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-1.5 text-sm font-semibold text-muted hover:bg-folio-tree-hover"
                onClick={() => setMoveOpen(false)}
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                className="rounded-xl bg-brand px-3 py-1.5 text-sm font-bold text-brand-fg"
                disabled={!moveGroupId}
                onClick={() => void confirmMove()}
              >
                {t('folio.actions.moveConfirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
