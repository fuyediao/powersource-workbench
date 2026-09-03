/**
 * Harness cloud history list with search, resume, rename, and delete actions.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { HistoryIcon, PencilIcon, SearchIcon, TrashIcon } from '@/icons/AllIcons'
import type { HarnessHistoryState } from '@/hooks/use-harness-history'
import type { HistoryRecord } from '@/types/chat'

const HISTORY_PAGE_SIZE = 20

interface HarnessHistoryPanelProps {
  state: HarnessHistoryState
  onOpen: (record: HistoryRecord) => void
}

/**
 * Formats one history timestamp in the user's locale.
 * @param value - ISO timestamp.
 * @returns Short local date and time.
 */
function formatHistoryTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Full history workspace.
 * @param props - History state and open handler.
 * @returns Searchable history list.
 */
export function HarnessHistoryPanel({ state, onOpen }: HarnessHistoryPanelProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return state.records
    return state.records.filter((record) =>
      [record.query, ...record.messages.map((message) => message.content)]
        .join('\n')
        .toLowerCase()
        .includes(term),
    )
  }, [query, state.records])
  const totalPages = Math.max(1, Math.ceil(visible.length / HISTORY_PAGE_SIZE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageRecords = useMemo(() => {
    const start = (safeCurrentPage - 1) * HISTORY_PAGE_SIZE
    return visible.slice(start, start + HISTORY_PAGE_SIZE)
  }, [safeCurrentPage, visible])

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages))
  }, [totalPages])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand">
            {t('harness.history.title')}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted">{t('harness.history.subtitle')}</p>
        </div>
        <label className="relative block">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            name="harnessHistorySearch"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCurrentPage(1)
            }}
            placeholder={t('harness.history.searchPlaceholder')}
            aria-label={t('harness.history.searchPlaceholder')}
            className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/50 dark:border-white/10 dark:bg-zinc-950/40"
          />
        </label>
        {state.error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {t('harness.history.loadFailed')}
          </p>
        ) : null}
        {state.isLoading ? (
          <p className="py-8 text-center text-sm text-muted">{t('status.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('harness.history.empty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pageRecords.map((record) => (
              <div
                key={record.id}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                  state.activeHistoryId === record.id
                    ? 'border-brand/35 bg-brand/10'
                    : 'border-zinc-950/10 bg-white/60 dark:border-white/10 dark:bg-zinc-950/40'
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onOpen(record)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                    <HistoryIcon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    {editingId === record.id ? (
                      <input
                        autoFocus
                        value={title}
                        className="w-full rounded-lg border border-brand/30 bg-white px-2 py-1 text-sm font-bold text-ink outline-none dark:bg-zinc-900"
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void state.rename(record.id, title)
                            setEditingId(null)
                          } else if (event.key === 'Escape') {
                            setEditingId(null)
                          }
                        }}
                      />
                    ) : (
                      <span className="block truncate text-sm font-bold text-ink">{record.query}</span>
                    )}
                    <span className="mt-0.5 block text-xs font-medium text-muted">
                      {formatHistoryTime(record.updatedAt)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-brand/10 hover:text-brand"
                  title={t('harness.history.rename')}
                  aria-label={t('harness.history.rename')}
                  onClick={() => {
                    setEditingId(record.id)
                    setTitle(record.query)
                  }}
                >
                  <PencilIcon className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500"
                  title={t('harness.history.delete')}
                  aria-label={t('harness.history.delete')}
                  onClick={() => void state.remove(record.id)}
                >
                  <TrashIcon className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
            <PaginationStrip
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onGoToPage={setCurrentPage}
              className="mt-2"
            />
          </div>
        )}
      </div>
    </div>
  )
}
