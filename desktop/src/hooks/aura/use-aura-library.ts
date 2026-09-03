/**
 * Bridges {@link import('@/hooks/use-aura-scope').useAuraScope} and the cloud
 * library ({@link import('@/hooks/aura/document-store')}) into the native
 * macOS Scope/Library menu ({@link import('@/utils/aura/aura-library-menu')}).
 * Mounted once from {@link import('@/pages/aura-page').AuraPage}. Aura has at
 * most one open document, so (like Folio) this owns a single global menu
 * snapshot rather than a per-kind snapshot (the Office pattern).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuraScope } from '@/hooks/use-aura-scope'
import {
  copyActiveFileToPersonal,
  getDocumentSession,
  moveActiveFileToGroup,
  removeActiveFile,
  setLibraryCapabilities,
  setLibraryScope,
  subscribeDocumentSession,
  type LibraryScope,
} from '@/hooks/aura/document-store'
import { dispatchAuraMenuAction } from '@/utils/aura/menu-actions'
import {
  peekPendingAuraDocument,
  subscribeAuraDocumentRequest,
} from '@/utils/aura/aura-document-request'
import {
  patchAuraLibraryMenuHandlers,
  setAuraLibraryMenuView,
  unregisterAuraLibraryMenuHost,
} from '@/utils/aura/aura-library-menu'

/**
 * Wires the Aura Scope/Library RBAC hook into the document store and the
 * native application menu for the signed-in user.
 * @param userId - Auth user id when signed in.
 * @returns Nothing; side effects only.
 */
export function useAuraLibrary(userId: string | null | undefined): void {
  const { t } = useTranslation()
  const scope = useAuraScope(userId)
  if (peekPendingAuraDocument() && scope.mode !== 'personal') {
    scope.setMode('personal')
  }
  const [filePath, setFilePath] = useState(() => getDocumentSession().filePath)

  useEffect(
    () =>
      subscribeDocumentSession(() => {
        setFilePath(getDocumentSession().filePath)
      }),
    [],
  )

  useEffect(() => {
    const nextScope: LibraryScope = !userId
      ? null
      : scope.mode === 'personal'
        ? { ownerUserId: userId }
        : scope.selectedGroupId
          ? { groupId: scope.selectedGroupId }
          : null
    setLibraryScope(nextScope)
    setLibraryCapabilities({
      canEdit: scope.capabilities.canEdit,
      canDelete: scope.capabilities.canDelete,
    })
  }, [
    userId,
    scope.mode,
    scope.selectedGroupId,
    scope.capabilities.canEdit,
    scope.capabilities.canDelete,
  ])

  useEffect(() => {
    if (peekPendingAuraDocument()) {
      scope.setMode('personal')
    }
    return subscribeAuraDocumentRequest(() => {
      scope.setMode('personal')
    })
  }, [scope.setMode])

  useEffect(() => {
    patchAuraLibraryMenuHandlers({
      setMode: scope.setMode,
      selectGroup: scope.setSelectedGroupId,
      moveToGroup: () => {
        const targetGroupId = scope.membershipGroup?.id ?? scope.switchableGroups[0]?.id
        if (targetGroupId) {
          void moveActiveFileToGroup(targetGroupId)
        }
      },
      copyToPersonal: () => {
        if (userId) {
          void copyActiveFileToPersonal(userId)
        }
      },
      deleteFile: () => {
        if (
          !window.confirm(
            t('aura.sidebar.confirmDelete', { name: getDocumentSession().title }),
          )
        ) {
          return
        }
        void (async () => {
          const removed = await removeActiveFile()
          if (removed) {
            // Reuses the exact File > New reset (clears the visible buffer,
            // not only the session state) so deleting the open file cannot
            // leave stale content on screen.
            dispatchAuraMenuAction('file:new')
          }
        })()
      },
    })
  }, [scope.membershipGroup, scope.switchableGroups, scope.setMode, scope.setSelectedGroupId, t, userId])

  useEffect(() => {
    setAuraLibraryMenuView({
      mode: scope.mode,
      groups: scope.switchableGroups.map((group) => ({ id: group.id, label: group.name })),
      selectedGroupId: scope.selectedGroupId,
      canSwitchGroups: scope.canSwitchGroups,
      canMoveToGroup: scope.capabilities.canMoveToGroup,
      canCopyToPersonal: scope.capabilities.canCopyToPersonal,
      canDelete: scope.capabilities.canDelete,
      hasSelection: filePath != null,
    })
  }, [
    scope.mode,
    scope.switchableGroups,
    scope.selectedGroupId,
    scope.canSwitchGroups,
    scope.capabilities.canMoveToGroup,
    scope.capabilities.canCopyToPersonal,
    scope.capabilities.canDelete,
    filePath,
  ])

  useEffect(() => {
    return () => {
      unregisterAuraLibraryMenuHost()
      setLibraryScope(null)
      setLibraryCapabilities({ canEdit: true, canDelete: true })
    }
  }, [])
}
