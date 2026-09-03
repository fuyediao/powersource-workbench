/**
 * Office (Docs/Sheets/Slides) workspace: Supabase-backed library (personal
 * XOR group, Folio-style) edited exclusively through the OnlyOffice Document
 * Server. Replaces the retired local-SQLite Univer workspace.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { StatusLoading } from '@/components/common/status-loading'
import { OfficeLibrarySidebar } from '@/components/office/office-library-sidebar'
import { OfficeMenubar } from '@/components/office/office-menubar'
import { OnlyOfficeHost } from '@/components/office/onlyoffice-host'
import { useFileDropUpload } from '@/hooks/use-file-drop-upload'
import { useOfficeScope } from '@/hooks/use-office-scope'
import { useSidebarMode } from '@/hooks/use-sidebar-mode'
import type { OfficeFeatureId } from '@/constants/office-folder'
import { createBlankOfficeBytes } from '@/office/blank-office-file'
import { officeSaveFileName, parseOfficeFile } from '@/office/office-exchange'
import {
  createOfficeFile,
  copyOfficeFileToPersonal,
  deleteOfficeFile,
  downloadOfficeFileBytes,
  listOfficeFiles,
  moveOfficeFileToGroup,
  renameOfficeFile,
  reorderOfficeFiles,
  setOfficeFileColor,
  type OfficeFile,
} from '@/services/office-files-api'
import {
  importProductPriceRows,
  parseProductPriceSnapshot,
  resolveProductPricePeriod,
  type ProductPriceImportResult,
} from '@/services/product-catalog-price-import'
import {
  consumePendingOfficeDocument,
  isOfficeFileDragForKind,
  isOfficeFileForKind,
  officeBytesForLibraryUpload,
  subscribeOfficeDocumentError,
  subscribeOfficeDocumentRequest,
} from '@/utils/office/office-document-request'
import {
  patchOfficeMenuHandlers,
  setOfficeMenuView,
  unregisterOfficeMenuHost,
} from '@/utils/office/office-menu'
import { officeLangFromAppLanguage } from '@/utils/office/office-locale'
import { univerLocaleFromAppLanguage } from '@/utils/univer/univer-locale'

const SIDEBAR_STORAGE_KEY = 'workbench-office-sidebar-mode-v1'
const LEGACY_SIDEBAR_COLLAPSED_KEY = 'workbench-office-sidebar-collapsed-v1'
const OFFICE_DROP_MAX_BYTES = 50 * 1024 * 1024

/** Accepted extensions shown in the unsupported-type toast, per Office kind. */
const OFFICE_DROP_KINDS: Record<OfficeFeatureId, string> = {
  docs: '.doc, .docx',
  sheets: '.xls, .xlsx',
  slides: '.ppt, .pptx',
}

/**
 * Migrates the old boolean collapsed flag into the four-state mode key once.
 * @returns Nothing.
 */
function migrateLegacySidebarCollapsed(): void {
  try {
    if (localStorage.getItem(SIDEBAR_STORAGE_KEY)) {
      return
    }
    const legacy = localStorage.getItem(LEGACY_SIDEBAR_COLLAPSED_KEY)
    if (legacy === 'true') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed')
    } else if (legacy === 'false') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, 'expanded')
    }
    localStorage.removeItem(LEGACY_SIDEBAR_COLLAPSED_KEY)
  } catch {
    // ignore quota / private mode
  }
}

migrateLegacySidebarCollapsed()

export interface OfficeWorkspacePageProps {
  kind: OfficeFeatureId
  userId: string
  user: User
}

/**
 * Feature tab host for the Docs, Sheets, or Slides Office library.
 * @param props - Editor kind and signed-in user.
 * @returns Office workspace UI (menubar, library sidebar, OnlyOffice host).
 */
export function OfficeWorkspacePage({ kind, userId }: OfficeWorkspacePageProps) {
  const { t, i18n } = useTranslation()
  const scope = useOfficeScope(userId, kind)
  const sidebar = useSidebarMode({
    storageKey: SIDEBAR_STORAGE_KEY,
    defaultMode: 'expanded',
  })
  const [files, setFiles] = useState<OfficeFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lang = officeLangFromAppLanguage(i18n.language)
  const hasGroupSelection = scope.mode === 'personal' || Boolean(scope.selectedGroupId)

  /**
   * Reloads the active scope's library rows and drops a stale selection.
   * @returns Loaded file rows.
   */
  const reloadFiles = useCallback(async (): Promise<OfficeFile[]> => {
    if (scope.mode === 'group' && !scope.selectedGroupId) {
      setFiles([])
      setActiveFileId(null)
      return []
    }
    setLoadingFiles(true)
    setError(null)
    try {
      const rows = await listOfficeFiles(
        kind,
        scope.mode === 'personal' ? { ownerUserId: userId } : { groupId: scope.selectedGroupId! },
      )
      setFiles(rows)
      setActiveFileId((current) => (current && rows.some((row) => row.id === current) ? current : null))
      return rows
    } catch (err) {
      console.error('[office-workspace-page] reloadFiles:', err)
      setError(t('office.errors.loadFailed'))
      return []
    } finally {
      setLoadingFiles(false)
    }
  }, [kind, scope.mode, scope.selectedGroupId, t, userId])

  useEffect(() => {
    void reloadFiles()
  }, [reloadFiles])

  useEffect(() => {
    const pending = consumePendingOfficeDocument(kind)
    if (!pending) {
      return
    }
    void (async () => {
      scope.setMode('personal')
      await reloadFiles()
      setActiveFileId(pending.fileId)
    })()
    // Runs once for the document queued before this tab mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  useEffect(() => {
    return subscribeOfficeDocumentRequest(kind, (ready) => {
      void (async () => {
        scope.setMode('personal')
        await reloadFiles()
        setActiveFileId(ready.fileId)
      })()
    })
  }, [kind, reloadFiles, scope])

  useEffect(() => {
    return subscribeOfficeDocumentError(kind, () => {
      setError(t('office.errors.openFailed'))
    })
  }, [kind, t])

  const handleCreate = useCallback(async () => {
    if (!scope.capabilities.canCreate) {
      return
    }
    if (scope.mode === 'group' && !scope.selectedGroupId) {
      return
    }
    try {
      const bytes = await createBlankOfficeBytes(kind)
      // Always English, like Folio / Calendar's default title: the name is a
      // throwaway placeholder the user renames immediately, and keeping it
      // ASCII avoids feeding non-Latin text into any generated file name.
      const name = officeSaveFileName('Untitled', kind)
      const targetScope =
        scope.mode === 'personal' ? { ownerUserId: userId } : { groupId: scope.selectedGroupId! }
      const created = await createOfficeFile(kind, name, targetScope, bytes)
      await reloadFiles()
      setActiveFileId(created.id)
    } catch (err) {
      console.error('[office-workspace-page] create:', err)
      setError(t('office.errors.createFailed'))
    }
  }, [kind, reloadFiles, scope.capabilities.canCreate, scope.mode, scope.selectedGroupId, t, userId])

  /**
   * Uploads dropped Office files into the current personal or group library
   * and opens the last successful row.
   * @param dropped - Files accepted for this Office kind.
   * @returns Nothing.
   */
  const handleDropFiles = useCallback(
    async (dropped: File[]): Promise<void> => {
      if (!scope.capabilities.canCreate) {
        setError(t('office.errors.uploadDenied'))
        return
      }
      if (scope.mode === 'group' && !scope.selectedGroupId) {
        setError(t('office.empty.noGroup'))
        return
      }
      const targetScope =
        scope.mode === 'personal' ? { ownerUserId: userId } : { groupId: scope.selectedGroupId! }
      let lastId: string | null = null
      try {
        for (const file of dropped) {
          if (file.size > OFFICE_DROP_MAX_BYTES) {
            setError(t('office.errors.uploadTooLarge'))
            continue
          }
          const buffer = await file.arrayBuffer()
          const bytes = await officeBytesForLibraryUpload(kind, file.name, new Uint8Array(buffer))
          const name = officeSaveFileName(file.name, kind)
          const created = await createOfficeFile(kind, name, targetScope, bytes)
          lastId = created.id
        }
        if (!lastId) {
          return
        }
        await reloadFiles()
        setActiveFileId(lastId)
        setError(null)
      } catch (err) {
        console.error('[office-workspace-page] drop:', err)
        setError(t('office.errors.uploadFailed'))
      }
    },
    [kind, reloadFiles, scope.capabilities.canCreate, scope.mode, scope.selectedGroupId, t, userId],
  )

  const canDropUpload =
    scope.capabilities.canCreate && (scope.mode === 'personal' || Boolean(scope.selectedGroupId))

  const { isDragging, isUploading, dropBind } = useFileDropUpload({
    enabled: canDropUpload,
    isAcceptedDrag: (dataTransfer) => isOfficeFileDragForKind(kind, dataTransfer),
    isAcceptedFile: (file) => isOfficeFileForKind(kind, file.name),
    onRejectedFiles: () => {
      setError(t('office.errors.unsupportedType', { kinds: OFFICE_DROP_KINDS[kind] }))
    },
    onFiles: handleDropFiles,
  })

  const handleRename = useCallback(
    async (id: string, requestedName: string): Promise<void> => {
      const trimmed = requestedName.trim()
      if (!trimmed) {
        throw new Error(t('office.sidebar.renameFailed'))
      }
      const normalized = officeSaveFileName(trimmed, kind)
      const duplicate = files.some(
        (file) =>
          file.id !== id &&
          file.name.toLocaleLowerCase('en-US') === normalized.toLocaleLowerCase('en-US'),
      )
      if (duplicate) {
        throw new Error(t('office.sidebar.renameDuplicate', { name: normalized }))
      }
      const updated = await renameOfficeFile(id, normalized)
      if (!updated) {
        throw new Error(t('office.sidebar.renameFailed'))
      }
      setFiles((current) => current.map((file) => (file.id === id ? updated : file)))
    },
    [files, kind, t],
  )

  const handleColorChange = useCallback(
    async (id: string, color: string | null): Promise<void> => {
      try {
        const updated = await setOfficeFileColor(id, color)
        if (updated) {
          setFiles((current) => current.map((file) => (file.id === id ? updated : file)))
        }
      } catch (err) {
        console.error('[office-workspace-page] color:', err)
        setError(t('office.errors.colorFailed'))
      }
    },
    [t],
  )

  const handleReorder = useCallback(
    async (orderedIds: string[]): Promise<void> => {
      const byId = new Map(files.map((file) => [file.id, file]))
      const reordered = orderedIds.flatMap((id) => {
        const file = byId.get(id)
        return file ? [file] : []
      })
      if (reordered.length !== files.length) {
        return
      }
      setFiles(reordered)
      try {
        await reorderOfficeFiles(orderedIds)
      } catch (err) {
        console.error('[office-workspace-page] reorder:', err)
        await reloadFiles()
        setError(t('office.errors.reorderFailed'))
      }
    },
    [files, reloadFiles, t],
  )

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      const target = files.find((file) => file.id === id)
      if (!target || !window.confirm(t('office.sidebar.confirmDelete', { name: target.name }))) {
        return
      }
      try {
        await deleteOfficeFile(target)
        await reloadFiles()
      } catch (err) {
        console.error('[office-workspace-page] delete:', err)
        setError(t('office.errors.deleteFailed'))
      }
    },
    [files, reloadFiles, t],
  )

  const handleMoveToGroup = useCallback(
    async (id: string): Promise<void> => {
      const targetGroupId = scope.membershipGroup?.id ?? scope.switchableGroups[0]?.id
      if (!targetGroupId) {
        return
      }
      try {
        await moveOfficeFileToGroup(id, targetGroupId)
        await reloadFiles()
      } catch (err) {
        console.error('[office-workspace-page] moveToGroup:', err)
        setError(t('office.errors.moveFailed'))
      }
    },
    [reloadFiles, scope.membershipGroup, scope.switchableGroups, t],
  )

  const handleCopyToPersonal = useCallback(
    async (id: string): Promise<void> => {
      const source = files.find((file) => file.id === id)
      if (!source) {
        return
      }
      try {
        const copy = await copyOfficeFileToPersonal(source, userId)
        scope.setMode('personal')
        const rows = await listOfficeFiles(kind, { ownerUserId: userId })
        setFiles(rows)
        setActiveFileId(copy.id)
      } catch (err) {
        console.error('[office-workspace-page] copyToPersonal:', err)
        setError(t('office.errors.copyFailed'))
      }
    },
    [files, kind, scope, t, userId],
  )

  const handleImportProductPrices = useCallback(
    async (id: string): Promise<ProductPriceImportResult> => {
      if (kind !== 'sheets') {
        throw new Error(t('office.sidebar.importPricesFailed'))
      }
      const file = files.find((row) => row.id === id)
      if (!file) {
        throw new Error(t('office.errors.loadFailed'))
      }
      const bytes = await downloadOfficeFileBytes(file)
      const locale = univerLocaleFromAppLanguage(i18n.language)
      const { snapshot } = await parseOfficeFile(
        'sheets',
        file.name,
        bytes.buffer as ArrayBuffer,
        locale,
      )
      const period = resolveProductPricePeriod(file.name, snapshot)
      const rows = parseProductPriceSnapshot(snapshot)
      return importProductPriceRows(period, rows)
    },
    [files, i18n.language, kind, t],
  )

  useEffect(() => {
    return () => unregisterOfficeMenuHost(kind)
  }, [kind])

  useEffect(() => {
    patchOfficeMenuHandlers(kind, {
      setMode: scope.setMode,
      selectGroup: scope.setSelectedGroupId,
      setSidebarMode: sidebar.setMode,
      newFile: () => {
        void handleCreate()
      },
      moveToGroup: () => {
        if (!activeFileId) {
          return
        }
        void handleMoveToGroup(activeFileId)
      },
      copyToPersonal: () => {
        if (!activeFileId) {
          return
        }
        void handleCopyToPersonal(activeFileId)
      },
      deleteFile: () => {
        if (!activeFileId) {
          return
        }
        void handleDelete(activeFileId)
      },
    })
  }, [
    activeFileId,
    handleCopyToPersonal,
    handleCreate,
    handleDelete,
    handleMoveToGroup,
    kind,
    scope.setMode,
    scope.setSelectedGroupId,
    sidebar.setMode,
  ])

  useEffect(() => {
    setOfficeMenuView(kind, {
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
      hasSelection: activeFileId != null,
      sidebarMode: sidebar.mode,
    })
  }, [
    activeFileId,
    kind,
    scope.canSwitchGroups,
    scope.capabilities.canCopyToPersonal,
    scope.capabilities.canCreate,
    scope.capabilities.canDelete,
    scope.capabilities.canMoveToGroup,
    scope.mode,
    scope.selectedGroupId,
    scope.switchableGroups,
    sidebar.mode,
  ])

  return (
    <div
      className="office-workspace-page relative flex h-full min-h-0 flex-col overflow-hidden bg-canvas text-ink"
      {...dropBind}
    >
      <OfficeMenubar
        mode={scope.mode}
        onModeChange={scope.setMode}
        canSwitchGroups={scope.canSwitchGroups}
        switchableGroups={scope.switchableGroups}
        selectedGroupId={scope.selectedGroupId}
        onGroupChange={scope.setSelectedGroupId}
        readOnly={scope.capabilities.readOnly}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative z-10 shrink-0" style={{ width: sidebar.reservedPx }}>
          {sidebar.mode === 'hidden' ? null : (
            <OfficeLibrarySidebar
              kind={kind}
              files={files}
              activeFileId={activeFileId}
              expanded={sidebar.expanded}
              mode={sidebar.mode}
              canCreate={scope.capabilities.canCreate}
              canEdit={scope.capabilities.canEdit}
              canDelete={scope.capabilities.canDelete}
              canMoveToGroup={scope.capabilities.canMoveToGroup}
              canCopyToPersonal={scope.capabilities.canCopyToPersonal}
              onSetMode={sidebar.setMode}
              onPointerEnter={sidebar.onPointerEnter}
              onPointerLeave={sidebar.onPointerLeave}
              onFocusIn={sidebar.onFocusIn}
              onFocusOut={sidebar.onFocusOut}
              onCreate={() => void handleCreate()}
              onRename={handleRename}
              onColorChange={handleColorChange}
              onReorder={handleReorder}
              onMoveToGroup={
                scope.capabilities.canMoveToGroup ? (id) => void handleMoveToGroup(id) : undefined
              }
              onCopyToPersonal={
                scope.capabilities.canCopyToPersonal
                  ? (id) => void handleCopyToPersonal(id)
                  : undefined
              }
              onImportProductPrices={kind === 'sheets' ? handleImportProductPrices : undefined}
              onSelect={setActiveFileId}
              onDelete={(id) => void handleDelete(id)}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {error ? (
            <p className="px-5 py-2 text-sm font-medium text-rose-500">{error}</p>
          ) : null}
          {scope.isLoading || loadingFiles ? (
            <StatusLoading />
          ) : !hasGroupSelection ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm font-medium text-muted">
              {t('office.empty.noGroup')}
            </div>
          ) : (
            <OnlyOfficeHost fileId={activeFileId} lang={lang} />
          )}
        </div>
      </div>
      <FileDropOverlay
        active={isDragging}
        uploading={isUploading}
        label={
          isUploading ? t('office.host.dropUploading') : t('office.host.dropRelease')
        }
      />
    </div>
  )
}
