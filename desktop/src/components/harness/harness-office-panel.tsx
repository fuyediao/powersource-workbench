/**
 * Compact Office library and OnlyOffice editor for the Harness utility sidebar.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OnlyOfficeHost } from '@/components/office/onlyoffice-host'
import { StatusLoading } from '@/components/common/status-loading'
import type { OfficeFeatureId } from '@/constants/office-folder'
import { OFFICE_FEATURE_IDS } from '@/constants/office-folder'
import {
  RefreshIcon,
  UniverDocsIcon,
  UniverSheetsIcon,
  UniverSlidesIcon,
} from '@/icons/AllIcons'
import { useOfficeScope } from '@/hooks/use-office-scope'
import {
  getOfficeFile,
  listOfficeFiles,
  officeFileExtension,
  type OfficeFile,
} from '@/services/office-files-api'
import { officeLangFromAppLanguage } from '@/utils/office/office-locale'

/** Request that opens one cloud Office file in the embedded editor. */
export interface HarnessOfficePanelRequest {
  fileId: string
  kind: OfficeFeatureId
  nonce: number
}

interface HarnessOfficePanelProps {
  /** Signed-in user that owns the personal library. */
  userId: string | null
  /** Latest file requested by `open_office_file`. */
  request?: HarnessOfficePanelRequest | null
}

/** Office kind icons used by the compact tab switcher. */
const KIND_ICONS = {
  docs: UniverDocsIcon,
  sheets: UniverSheetsIcon,
  slides: UniverSlidesIcon,
} satisfies Record<OfficeFeatureId, typeof UniverDocsIcon>

/**
 * Renders a compact personal/group library and the existing OnlyOffice host.
 * @param props - Signed-in user and optional tool-driven file request.
 * @returns Embedded Office utility page.
 */
export function HarnessOfficePanel({ userId, request = null }: HarnessOfficePanelProps) {
  const { t, i18n } = useTranslation()
  const [kind, setKind] = useState<OfficeFeatureId>('docs')
  const scope = useOfficeScope(userId, kind)
  const [files, setFiles] = useState<OfficeFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lang = officeLangFromAppLanguage(i18n.language)

  /** Reloads the active personal or group library. */
  const reload = useCallback(async (): Promise<void> => {
    if (!userId) {
      setFiles([])
      setActiveFileId(null)
      return
    }
    if (scope.mode === 'group' && !scope.selectedGroupId) {
      setFiles([])
      setActiveFileId(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await listOfficeFiles(
        kind,
        scope.mode === 'personal'
          ? { ownerUserId: userId }
          : { groupId: scope.selectedGroupId! },
      )
      setFiles(rows)
      setActiveFileId((current) => current && rows.some((row) => row.id === current)
        ? current
        : rows[0]?.id ?? null)
    } catch (loadError) {
      console.error('[harness-office-panel] reload:', loadError)
      setError(t('office.errors.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [kind, scope.mode, scope.selectedGroupId, t, userId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!request || !userId) return
    if (request.kind !== kind) {
      setKind(request.kind)
      return
    }
    void (async (): Promise<void> => {
      try {
        const file = await getOfficeFile(request.fileId)
        if (!file || file.kind !== request.kind) {
          setError(t('office.errors.loadFailed'))
          return
        }
        if (file.ownerUserId === userId) {
          scope.setMode('personal')
        } else if (file.groupId) {
          scope.setSelectedGroupId(file.groupId)
          scope.setMode('group')
        }
        setFiles((current) => current.some((row) => row.id === file.id) ? current : [file, ...current])
        setActiveFileId(file.id)
        setError(null)
      } catch (openError) {
        console.error('[harness-office-panel] open request:', openError)
        setError(t('office.errors.openFailed'))
      }
    })()
  }, [kind, request, scope.setMode, scope.setSelectedGroupId, t, userId])

  if (!userId) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-sm font-medium text-muted">
        {t('harness.utility.officeSignIn')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas text-ink">
      <div className="shrink-0 space-y-2 border-b border-zinc-950/10 p-2 dark:border-white/10">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-950/5 p-1 dark:bg-white/5">
          {OFFICE_FEATURE_IDS.map((officeKind) => {
            const Icon = KIND_ICONS[officeKind]
            const selected = officeKind === kind
            return (
              <button
                key={officeKind}
                type="button"
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                  selected
                    ? 'bg-white text-brand shadow-sm dark:bg-zinc-800'
                    : 'text-muted hover:bg-white/70 hover:text-ink dark:hover:bg-white/10'
                }`}
                onClick={() => {
                  setKind(officeKind)
                  setActiveFileId(null)
                }}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{t(`functions.apps.${officeKind}`)}</span>
              </button>
            )
          })}
        </div>

        <div className="flex min-w-0 gap-1.5">
          <button
            type="button"
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
              scope.mode === 'personal' ? 'bg-brand text-brand-fg' : 'bg-zinc-950/5 text-muted hover:text-ink dark:bg-white/5'
            }`}
            onClick={() => scope.setMode('personal')}
          >
            {t('office.menu.personal')}
          </button>
          <select
            aria-label={t('office.menu.groupSwitcher')}
            className={`min-w-0 flex-1 rounded-lg border border-zinc-950/10 bg-white px-2 py-1.5 text-xs font-semibold outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900 ${
              scope.mode === 'group' ? 'text-ink' : 'text-muted'
            }`}
            value={scope.mode === 'group' ? scope.selectedGroupId ?? '' : ''}
            disabled={scope.switchableGroups.length === 0}
            onChange={(event) => {
              const groupId = event.target.value
              if (!groupId) return
              scope.setSelectedGroupId(groupId)
              scope.setMode('group')
            }}
          >
            <option value="">{t('office.menu.group')}</option>
            {scope.switchableGroups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 gap-1.5">
          <select
            aria-label={t('office.sidebar.title')}
            className="min-w-0 flex-1 rounded-lg border border-zinc-950/10 bg-white px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-900"
            value={activeFileId ?? ''}
            disabled={loading || files.length === 0}
            onChange={(event) => setActiveFileId(event.target.value || null)}
          >
            {files.length === 0 ? (
              <option value="">{loading ? t('status.loading') : t('office.sidebar.empty')}</option>
            ) : null}
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}.{officeFileExtension(file.kind)}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={t('harness.utility.officeRefresh')}
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-zinc-950/5 text-muted transition hover:bg-brand/10 hover:text-brand dark:bg-white/5"
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          </button>
        </div>
      </div>

      {error ? (
        <p className="shrink-0 px-3 py-2 text-xs font-semibold text-rose-500">{error}</p>
      ) : null}
      {scope.isLoading || loading ? (
        <StatusLoading />
      ) : (
        <OnlyOfficeHost fileId={activeFileId} lang={lang} />
      )}
    </div>
  )
}
