import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppIcon } from './AppIcon'
import { CloseIcon, SearchIcon } from '@/icons/AllIcons'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { searchLibrarySites, normalizeSiteUrl, type SiteSearchHitDto } from '@/utils/home/library-api'
import { animateHeight } from '@/utils/home/animate-height'

export interface NewAppFields {
  url: string
  name: string
}

type AddMode = 'search' | 'create'

interface AddAppDialogProps {
  open: boolean
  userId: string
  categoryId: string
  onClose: () => void
  onSubmit: (fields: NewAppFields) => Promise<void>
  onLinkExisting: (siteId: string) => Promise<void>
}

/**
 * Modal for adding an app: toggle between searching existing sites and creating a new one.
 * @param props - Open state, user/category ids, and submit/link handlers.
 * @returns Dialog or null.
 */
export function AddAppDialog({
  open,
  userId,
  categoryId,
  onClose,
  onSubmit,
  onLinkExisting,
}: AddAppDialogProps) {
  const { t } = useTranslation()
  const { mounted, leaving } = useDialogPresence(open)
  const [mode, setMode] = useState<AddMode>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SiteSearchHitDto[]>([])
  const [searching, setSearching] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const searchPanelRef = useRef<HTMLDivElement>(null)
  const createPanelRef = useRef<HTMLFormElement>(null)
  const readyToAnimateRef = useRef(false)

  useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setMode('search')
      setQuery('')
      setResults([])
      setUrl('')
      setName('')
      setError(null)
      setLinkingId(null)
      setSubmitting(false)
      readyToAnimateRef.current = false
      if (shellRef.current) {
        shellRef.current.style.height = ''
        shellRef.current.style.transition = 'none'
      }
    }
  }, [open])

  useEffect(() => {
    if (!open || mode !== 'search') {
      return
    }
    const normalized = query.trim()
    if (!normalized) {
      setResults([])
      setSearching(false)
      return
    }

    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchLibrarySites(userId, categoryId, normalized)
        .then((next) => {
          if (active) {
            setResults(next)
          }
        })
        .catch(() => {
          if (active) {
            setResults([])
          }
        })
        .finally(() => {
          if (active) {
            setSearching(false)
          }
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, mode, query, userId, categoryId])

  useEffect(() => {
    if (!open) {
      return
    }
    const timer = window.setTimeout(() => {
      if (mode === 'search') {
        searchInputRef.current?.focus()
      } else {
        nameInputRef.current?.focus()
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [open, mode])

  useLayoutEffect(() => {
    if (!mounted) {
      return
    }

    const shell = shellRef.current
    const pane = mode === 'search' ? searchPanelRef.current : createPanelRef.current
    if (!shell || !pane) {
      return
    }

    const shouldAnimate = readyToAnimateRef.current
    readyToAnimateRef.current = true
    animateHeight(shell, pane.scrollHeight, shouldAnimate)
  }, [mounted, mode, results, searching, query, error, name, url])

  if (!mounted) {
    return null
  }

  /**
   * Switches between search and create modes and clears mode-local errors.
   * @param next - Target mode.
   * @returns Nothing.
   */
  function switchMode(next: AddMode): void {
    if (submitting || linkingId || leaving) {
      return
    }
    setMode(next)
    setError(null)
  }

  /**
   * Links a search result into the active category and closes the dialog.
   * @param hit - Selected existing site.
   * @returns Nothing.
   */
  function handleLink(hit: SiteSearchHitDto): void {
    if (linkingId) {
      return
    }
    setLinkingId(hit.id)
    setError(null)
    void onLinkExisting(hit.id)
      .then(() => {
        onClose()
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : t('status.createFailed'))
      })
      .finally(() => {
        setLinkingId(null)
      })
  }

  /**
   * Submits the create-new-site form after normalizing and validating the URL.
   * @param event - Form submit event.
   * @returns Nothing.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const normalizedUrl = normalizeSiteUrl(url)
    if (!normalizedUrl) {
      setError(t('apps.invalidUrl'))
      return
    }
    if (!name.trim()) {
      setError(t('apps.invalidName'))
      return
    }

    setSubmitting(true)
    setError(null)
    void onSubmit({ url: normalizedUrl, name: name.trim() })
      .then(() => {
        setUrl('')
        setName('')
        onClose()
      })
      .catch((reason: unknown) => {
        const code = reason instanceof Error ? reason.message : ''
        if (code === 'INVALID_URL') {
          setError(t('apps.invalidUrl'))
          return
        }
        if (code === 'URL_EXISTS') {
          setError(t('apps.urlExists'))
          return
        }
        if (code === 'INVALID_NAME') {
          setError(t('apps.invalidName'))
          return
        }
        setError(reason instanceof Error ? reason.message : t('status.createFailed'))
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[200] grid place-items-center bg-zinc-950/50 p-4 backdrop-blur-sm ${
        leaving ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
      }`}
      onClick={() => {
        if (!submitting && !linkingId && !leaving) {
          onClose()
        }
      }}
    >
      <div
        className={`glass-dialog flex w-full max-w-md flex-col overflow-hidden rounded-3xl p-5 shadow-2xl max-h-[min(28rem,85dvh)] ${
          leaving ? 'dialog-panel-out' : 'dialog-panel-in'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-brand">{t('common.add')}</h2>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl text-brand transition hover:bg-brand/10 hover:text-brand"
            disabled={submitting || Boolean(linkingId)}
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </button>
        </header>

        <div
          className="relative mb-4 grid h-10 shrink-0 grid-cols-2 rounded-2xl bg-zinc-950/5 p-1 dark:bg-white/5"
        >
          <span
            className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-brand shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              mode === 'create' ? 'translate-x-[calc(100%+0.25rem)]' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            disabled={submitting || Boolean(linkingId)}
            className={`relative z-10 rounded-xl text-sm font-semibold transition-colors duration-300 ${
              mode === 'search' ? 'text-brand-fg' : 'text-brand/55 hover:text-brand'
            }`}
            onClick={() => switchMode('search')}
          >
            {t('apps.modeSearch')}
          </button>
          <button
            type="button"
            disabled={submitting || Boolean(linkingId)}
            className={`relative z-10 rounded-xl text-sm font-semibold transition-colors duration-300 ${
              mode === 'create' ? 'text-brand-fg' : 'text-brand/55 hover:text-brand'
            }`}
            onClick={() => switchMode('create')}
          >
            {t('apps.modeCreate')}
          </button>
        </div>

        {error ? <p className="mb-3 shrink-0 text-sm text-rose-500">{error}</p> : null}

        <div ref={shellRef} className="min-h-0 overflow-hidden will-change-[height]">
          <div
            className={`flex w-[200%] items-start transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              mode === 'create' ? '-translate-x-1/2' : 'translate-x-0'
            }`}
          >
            <div
              ref={searchPanelRef}
              className="flex w-1/2 flex-col"
            >
              <FocusRingFrame
                className="mb-3 shrink-0"
                shellClassName={`${FOCUS_RING_SHELL} flex items-center gap-2 px-3 py-2.5`}
              >
                <SearchIcon className="size-4 shrink-0 text-brand" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  tabIndex={mode === 'search' ? 0 : -1}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('apps.searchPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-brand outline-none placeholder:text-zinc-400"
                />
              </FocusRingFrame>

              {searching || results.length === 0 ? (
                <p className="px-1 py-1 text-center text-xs text-muted">
                  {searching
                    ? t('status.loading')
                    : query.trim()
                      ? t('apps.noResults')
                      : t('apps.searchHint')}
                </p>
              ) : (
                <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                  {results.map((hit) => {
                    const label = hit.name
                    return (
                      <li key={hit.id}>
                        <button
                          type="button"
                          tabIndex={mode === 'search' ? 0 : -1}
                          disabled={Boolean(linkingId)}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-zinc-950/5 disabled:opacity-60 dark:hover:bg-white/5"
                          onClick={() => handleLink(hit)}
                        >
                          <AppIcon
                            app={{
                              id: hit.id,
                              categoryId,
                              position: 0,
                              url: hit.url,
                              name: hit.name,
                            }}
                            label={label}
                            compact
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {label}
                            </span>
                            <span className="block truncate text-xs text-muted">{hit.url}</span>
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold tracking-wide text-brand uppercase">
                            {linkingId === hit.id
                              ? t('status.saving')
                              : t('common.add')}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <form
              ref={createPanelRef}
              className="w-1/2"
              onSubmit={handleSubmit}
            >
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-semibold text-muted">
                  {t('form.appName')}
                </span>
                <FocusRingFrame shellClassName={FOCUS_RING_SHELL}>
                  <input
                    ref={nameInputRef}
                    required={mode === 'create'}
                    type="text"
                    value={name}
                    tabIndex={mode === 'create' ? 0 : -1}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-semibold text-brand outline-none"
                  />
                </FocusRingFrame>
              </label>

              <label className="mb-4 block">
                <span className="mb-1 block text-xs font-semibold text-muted">
                  {t('form.appUrl')}
                </span>
                <FocusRingFrame shellClassName={FOCUS_RING_SHELL}>
                  <input
                    ref={urlInputRef}
                    required={mode === 'create'}
                    type="text"
                    value={url}
                    tabIndex={mode === 'create' ? 0 : -1}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-transparent px-3 py-2.5 text-sm font-semibold text-brand outline-none placeholder:text-zinc-400"
                  />
                </FocusRingFrame>
              </label>

              <button
                type="submit"
                tabIndex={mode === 'create' ? 0 : -1}
                disabled={submitting}
                className="w-full rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg transition hover:bg-brand disabled:opacity-60"
              >
                {submitting ? t('status.saving') : t('actions.saveApp')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
