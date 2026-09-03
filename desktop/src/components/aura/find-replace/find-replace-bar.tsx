import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  CloseIcon,
  FindExpandIcon,
  FindNextIcon,
  FindPrevIcon,
  ReplaceAllIcon,
  ReplaceOneIcon,
} from '@/icons/AllIcons'
import {
  applyPreserveCase,
  buildFindRegExp,
  clearFindHighlights,
  closeFindReplace,
  findMatches,
  getFindRoot,
  getFindReplaceState,
  loadFindHistory,
  paintFindHighlights,
  pushFindHistory,
  replaceSelectionText,
  scrollMatchIntoView,
  selectMatch,
  setFindReplaceMode,
  subscribeFindReplace,
  type FindFlags,
  type FindMatch,
  type FindReplaceMode,
} from '@/hooks/aura/find-replace'
import { getActiveEditor } from '@/utils/aura/active-editor'

const iconBtnClass =
  'inline-flex size-7 shrink-0 items-center justify-center rounded text-(--text-color)/70 hover:bg-(--item-hover-bg-color) hover:text-(--item-hover-text-color) disabled:opacity-35'
const toggleClass =
  'inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-semibold tracking-tight text-(--text-color)/65 hover:bg-(--item-hover-bg-color)'
const toggleActiveClass =
  'inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-[11px] font-semibold tracking-tight bg-(--primary-color)/20 text-(--primary-color) ring-1 ring-(--primary-color)/50'

/**
 * Compact toolbar icon button.
 *
 * @param props - Button props.
 * @returns Button element.
 */
function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={iconBtnClass}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * Floating find / replace bar (Ctrl+F / Ctrl+H), themed with Aura tokens.
 *
 * @returns Find/replace panel, or null when closed.
 */
export function FindReplaceBar() {
  const { t } = useTranslation()
  const findInputId = useId()
  const replaceInputId = useId()
  const findInputRef = useRef<HTMLInputElement>(null)
  const historyIndexRef = useRef(-1)

  const [open, setOpen] = useState(() => getFindReplaceState().open)
  const [mode, setMode] = useState<FindReplaceMode>(
    () => getFindReplaceState().mode,
  )
  const [focusNonce, setFocusNonce] = useState(
    () => getFindReplaceState().focusNonce,
  )
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [preserveCase, setPreserveCase] = useState(false)
  const [matches, setMatches] = useState<FindMatch[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [invalidPattern, setInvalidPattern] = useState(false)

  useEffect(() => {
    return subscribeFindReplace(() => {
      const next = getFindReplaceState()
      setOpen(next.open)
      setMode(next.mode)
      setFocusNonce(next.focusNonce)
      if (next.open && next.seedQuery) {
        setQuery(next.seedQuery)
      }
    })
  }, [])

  const refreshMatches = useCallback(
    (nextQuery: string, nextFlags: FindFlags, preferIndex = 0) => {
      const root = getFindRoot()
      if (!root || !nextQuery) {
        clearFindHighlights()
        setMatches([])
        setCurrentIndex(-1)
        setInvalidPattern(false)
        return
      }
      if (!buildFindRegExp(nextQuery, nextFlags)) {
        setInvalidPattern(true)
        clearFindHighlights()
        setMatches([])
        setCurrentIndex(-1)
        return
      }
      setInvalidPattern(false)
      const found = findMatches(root, nextQuery, nextFlags)
      setMatches(found)
      if (found.length === 0) {
        clearFindHighlights()
        setCurrentIndex(-1)
        return
      }
      const index = Math.min(Math.max(preferIndex, 0), found.length - 1)
      setCurrentIndex(index)
      paintFindHighlights(found, index)
      // Scroll only ??selecting the match would steal focus from the find input.
      scrollMatchIntoView(found[index])
    },
    [],
  )

  useEffect(() => {
    if (!open) {
      clearFindHighlights()
      return
    }
    refreshMatches(query, { matchCase, wholeWord, useRegex }, 0)
  }, [open, query, matchCase, wholeWord, useRegex, refreshMatches])

  useEffect(() => {
    if (!open) {
      return
    }
    const input = findInputRef.current
    if (!input) {
      return
    }
    input.focus()
    input.select()
  }, [open, focusNonce])

  useEffect(() => {
    return () => {
      clearFindHighlights()
    }
  }, [])

  /**
   * Move to next / previous match.
   *
   * @param delta - +1 next, -1 previous.
   */
  function go(delta: 1 | -1): void {
    if (matches.length === 0) {
      refreshMatches(query, { matchCase, wholeWord, useRegex }, 0)
      return
    }
    const next =
      (currentIndex + delta + matches.length * 10) % matches.length
    setCurrentIndex(next)
    paintFindHighlights(matches, next)
    scrollMatchIntoView(matches[next])
    pushFindHistory(query)
  }

  /** Replace the current match, then advance. */
  function replaceOne(): void {
    if (currentIndex < 0 || currentIndex >= matches.length) {
      return
    }
    const match = matches[currentIndex]
    selectMatch(match)
    const text = preserveCase
      ? applyPreserveCase(match.text, replacement)
      : replacement
    if (!replaceSelectionText(text)) {
      return
    }
    pushFindHistory(query)
    window.requestAnimationFrame(() => {
      refreshMatches(query, { matchCase, wholeWord, useRegex }, currentIndex)
      findInputRef.current?.focus({ preventScroll: true })
    })
  }

  /** Replace every match from the bottom up. */
  function replaceAll(): void {
    const root = getFindRoot()
    if (!root || !query) {
      return
    }
    const found = findMatches(root, query, { matchCase, wholeWord, useRegex })
    if (found.length === 0) {
      return
    }
    for (let i = found.length - 1; i >= 0; i -= 1) {
      const match = found[i]
      selectMatch(match)
      const text = preserveCase
        ? applyPreserveCase(match.text, replacement)
        : replacement
      replaceSelectionText(text)
    }
    pushFindHistory(query)
    window.requestAnimationFrame(() => {
      refreshMatches(query, { matchCase, wholeWord, useRegex }, 0)
      findInputRef.current?.focus({ preventScroll: true })
    })
  }

  /**
   * Handle keybindings inside the find field.
   *
   * @param event - Keyboard event.
   */
  function onFindKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeFindReplace()
      getActiveEditor()?.focus()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      go(event.shiftKey ? -1 : 1)
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const history = loadFindHistory()
      if (history.length === 0) {
        return
      }
      event.preventDefault()
      if (historyIndexRef.current < 0) {
        historyIndexRef.current =
          event.key === 'ArrowUp' ? 0 : history.length - 1
      } else if (event.key === 'ArrowUp') {
        historyIndexRef.current = Math.min(
          historyIndexRef.current + 1,
          history.length - 1,
        )
      } else {
        historyIndexRef.current = Math.max(historyIndexRef.current - 1, 0)
      }
      setQuery(history[historyIndexRef.current] ?? '')
    }
  }

  if (!open) {
    return null
  }

  const status = invalidPattern
    ? t('aura.shell.find.invalidRegex')
    : !query
      ? ''
      : matches.length === 0
        ? t('aura.shell.find.noResults')
        : t('aura.shell.find.resultCount', {
            current: String(currentIndex + 1),
            total: String(matches.length),
          })

  const replaceOpen = mode === 'replace'

  return (
    <div
      className="absolute top-2 right-2 z-40 w-[min(100%-1rem,28rem)] rounded aura-border bg-bg shadow-md"
      role="search"
      aria-label={t('aura.shell.find.title')}
    >
      <div className="flex items-start gap-1 p-2">
        <button
          type="button"
          className={`${iconBtnClass} mt-0.5`}
          aria-label={
            replaceOpen
              ? t('aura.shell.find.hideReplace')
              : t('aura.shell.find.showReplace')
          }
          title={
            replaceOpen
              ? t('aura.shell.find.hideReplace')
              : t('aura.shell.find.showReplace')
          }
          aria-expanded={replaceOpen}
          onClick={() => setFindReplaceMode(replaceOpen ? 'find' : 'replace')}
        >
          <FindExpandIcon expanded={replaceOpen} />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <div className="flex h-8 min-w-0 flex-1 items-center gap-0.5 rounded aura-border bg-bg px-1.5 focus-within:ring-1 focus-within:ring-primary">
              <label className="sr-only" htmlFor={findInputId}>
                {t('aura.shell.find.find')}
              </label>
              <input
                id={findInputId}
                ref={findInputRef}
                type="text"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-(--text-color)/40"
                placeholder={t('aura.shell.find.findPlaceholder')}
                value={query}
                spellCheck={false}
                onChange={(event) => {
                  historyIndexRef.current = -1
                  setQuery(event.target.value)
                }}
                onKeyDown={onFindKeyDown}
              />
              <button
                type="button"
                className={matchCase ? toggleActiveClass : toggleClass}
                aria-pressed={matchCase}
                title={t('aura.shell.find.matchCase')}
                onClick={() => setMatchCase((value) => !value)}
              >
                Aa
              </button>
              <button
                type="button"
                className={wholeWord ? toggleActiveClass : toggleClass}
                aria-pressed={wholeWord}
                title={t('aura.shell.find.wholeWord')}
                onClick={() => setWholeWord((value) => !value)}
              >
                ab
              </button>
              <button
                type="button"
                className={useRegex ? toggleActiveClass : toggleClass}
                aria-pressed={useRegex}
                title={t('aura.shell.find.regex')}
                onClick={() => setUseRegex((value) => !value)}
              >
                .*
              </button>
            </div>
            <span className="min-w-18 px-1 text-center text-[12px] tabular-nums text-(--text-color)/55">
              {status}
            </span>
            <IconButton
              label={t('aura.shell.find.previous')}
              disabled={matches.length === 0}
              onClick={() => go(-1)}
            >
              <FindPrevIcon />
            </IconButton>
            <IconButton
              label={t('aura.shell.find.next')}
              disabled={matches.length === 0}
              onClick={() => go(1)}
            >
              <FindNextIcon />
            </IconButton>
            <IconButton
              label={t('aura.shell.find.close')}
              onClick={() => {
                closeFindReplace()
                getActiveEditor()?.focus()
              }}
            >
              <CloseIcon />
            </IconButton>
          </div>

          {replaceOpen ? (
            <div className="flex items-center gap-1">
              <div className="flex h-8 min-w-0 flex-1 items-center gap-0.5 rounded aura-border bg-bg px-1.5 focus-within:ring-1 focus-within:ring-primary">
                <label className="sr-only" htmlFor={replaceInputId}>
                  {t('aura.shell.find.replace')}
                </label>
                <input
                  id={replaceInputId}
                  type="text"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-(--text-color)/40"
                  placeholder={t('aura.shell.find.replacePlaceholder')}
                  value={replacement}
                  spellCheck={false}
                  onChange={(event) => setReplacement(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      closeFindReplace()
                      getActiveEditor()?.focus()
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      replaceOne()
                    }
                  }}
                />
                <button
                  type="button"
                  className={preserveCase ? toggleActiveClass : toggleClass}
                  aria-pressed={preserveCase}
                  title={t('aura.shell.find.preserveCase')}
                  onClick={() => setPreserveCase((value) => !value)}
                >
                  AB
                </button>
              </div>
              <IconButton
                label={t('aura.shell.find.replace')}
                disabled={matches.length === 0}
                onClick={replaceOne}
              >
                <ReplaceOneIcon />
              </IconButton>
              <IconButton
                label={t('aura.shell.find.replaceAll')}
                disabled={matches.length === 0}
                onClick={replaceAll}
              >
                <ReplaceAllIcon />
              </IconButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
