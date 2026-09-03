/**
 * Embedded file browser for the Harness utility workspace.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon, FileTextIcon, FolderIcon, RefreshIcon } from '@/icons/AllIcons'
import type {
  HarnessWorkspaceEntry,
  HarnessWorkspaceFile,
} from '@/types/harness'

interface HarnessFilesPanelProps {
  /** Active Harness working directory. */
  cwd: string | null
}

/** Returns the parent of one normalized workspace-relative path. */
function parentPath(relativePath: string): string {
  const parts = relativePath.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

/** Formats a compact file size for the workspace list. */
function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** Renders directory navigation and text file previews inside the utility sidebar. */
export function HarnessFilesPanel({ cwd }: HarnessFilesPanelProps) {
  const { t } = useTranslation()
  const [directory, setDirectory] = useState('')
  const [entries, setEntries] = useState<HarnessWorkspaceEntry[]>([])
  const [preview, setPreview] = useState<HarnessWorkspaceFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** Loads one workspace directory. */
  const loadDirectory = useCallback(async (relativePath: string): Promise<void> => {
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      const bridge = window.geocrm?.harness
      if (!bridge?.listWorkspace) throw new Error(t('harness.utility.unavailable'))
      setEntries(await bridge.listWorkspace(cwd, relativePath))
      setDirectory(relativePath)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('harness.utility.loadError'))
    } finally {
      setLoading(false)
    }
  }, [cwd, t])

  useEffect(() => {
    void loadDirectory('')
  }, [loadDirectory])

  /** Opens one text or binary file preview. */
  async function openFile(relativePath: string): Promise<void> {
    setLoading(true)
    setError('')
    try {
      const bridge = window.geocrm?.harness
      if (!bridge?.readWorkspaceFile) throw new Error(t('harness.utility.unavailable'))
      setPreview(await bridge.readWorkspaceFile(cwd, relativePath))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('harness.utility.loadError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="harness-files-page">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-950/10 px-3 py-2 dark:border-white/10">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-35"
          disabled={!preview && !directory}
          aria-label={t('harness.utility.back')}
          onClick={() => {
            if (preview) setPreview(null)
            else void loadDirectory(parentPath(directory))
          }}
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted" title={preview?.relativePath || directory || '/'}>
          {preview?.relativePath || directory || '/'}
        </span>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand"
          aria-label={t('harness.utility.refresh')}
          onClick={() => void loadDirectory(directory)}
        >
          <RefreshIcon className="size-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <p className="text-xs font-medium text-muted">{t('harness.utility.loading')}</p>
        ) : error ? (
          <p className="text-xs font-semibold text-danger">{error}</p>
        ) : preview ? (
          preview.binary ? (
            <p className="text-xs font-medium text-muted">{t('harness.utility.binaryFile')}</p>
          ) : (
            <div>
              {preview.truncated ? (
                <p className="mb-2 text-[11px] font-semibold text-warning">{t('harness.utility.fileTruncated')}</p>
              ) : null}
              <pre className="overflow-auto rounded-xl bg-zinc-950/5 p-3 font-mono text-[11px] leading-5 whitespace-pre text-ink dark:bg-white/5">
                {preview.content}
              </pre>
            </div>
          )
        ) : entries.length === 0 ? (
          <p className="text-xs font-medium text-muted">{t('harness.utility.folderEmpty')}</p>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                key={entry.relativePath}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition hover:bg-brand/10"
                onClick={() => {
                  if (entry.kind === 'directory') void loadDirectory(entry.relativePath)
                  else void openFile(entry.relativePath)
                }}
              >
                {entry.kind === 'directory' ? (
                  <FolderIcon className="size-4 shrink-0 text-brand" aria-hidden />
                ) : (
                  <FileTextIcon className="size-4 shrink-0 text-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{entry.name}</span>
                {entry.kind === 'file' ? (
                  <span className="shrink-0 text-[10px] font-medium text-muted">{formatFileSize(entry.size)}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
