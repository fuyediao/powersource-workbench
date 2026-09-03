import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronMenuIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { DocumentStats } from '@/utils/aura/document-stats'

interface WordCountStatusProps {
  stats: DocumentStats
  /** Use a shorter control for the macOS titlebar-height header. */
  compact?: boolean
}

/**
 * Status-bar word count control with a Typora-style details popup.
 *
 * @param props - Current document stats.
 * @returns Status-bar control element.
 */
export function WordCountStatus({ stats, compact = false }: WordCountStatusProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const presence = useDialogPresence(open, 180)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelId = useId().replace(/:/g, '')

  useEffect(() => {
    if (!open) {
      return
    }

    /**
     * Close the panel when clicking outside or pressing Escape.
     *
     * @param event - Pointer or keyboard event.
     */
    function onDismiss(event: MouseEvent | KeyboardEvent): void {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setOpen(false)
        }
        return
      }
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDismiss)
    document.addEventListener('keydown', onDismiss)
    return () => {
      document.removeEventListener('mousedown', onDismiss)
      document.removeEventListener('keydown', onDismiss)
    }
  }, [open])

  const rows = [
    {
      key: 'reading',
      label: t('aura.shell.wordCount.readingTime', {
        count: String(stats.readingMinutes),
      }),
    },
    {
      key: 'lines',
      label: t('aura.shell.wordCount.lines', { count: String(stats.lines) }),
    },
    {
      key: 'words',
      label: t('aura.shell.wordCount.words', { count: String(stats.words) }),
    },
    {
      key: 'chars',
      label: t('aura.shell.wordCount.characters', {
        count: String(stats.characters),
      }),
    },
  ]

  const openDown = compact
  const enterClass = openDown ? 'animate-dropdown-in' : 'animate-dropdown-in-up'
  const leaveClass = openDown ? 'animate-dropdown-out' : 'animate-dropdown-out-up'

  return (
    <div ref={rootRef} className="relative flex h-full items-center">
      {presence.mounted ? (
        <div
          id={`word-count-panel-${panelId}`}
          role="dialog"
          aria-label={t('aura.shell.wordCount.title')}
          className={[
            'absolute right-0 z-50 min-w-38',
            openDown
              ? 'top-[calc(100%+6px)] origin-top'
              : 'bottom-[calc(100%+6px)] origin-bottom',
            'rounded-md aura-border bg-bg py-1.5 shadow-md',
            'text-[13px] text-text',
            presence.leaving ? leaveClass : enterClass,
          ].join(' ')}
        >
          <div className="px-3 pb-1.5 pt-0.5 font-medium">
            {t('aura.shell.wordCount.title')}
          </div>
          <div className="mx-2 aura-border-t" />
          <ul className="m-0 list-none px-3 py-1.5">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex justify-end py-0.5 tabular-nums leading-6 text-(--text-color)/85"
              >
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        className={[
          'box-border m-0 inline-flex max-w-full appearance-none cursor-pointer items-center justify-center gap-1 rounded-[3px] aura-border bg-bg px-2 py-0 font-inherit text-[12px] leading-none tabular-nums text-(--text-color)/80 hover:bg-item-hover hover:text-(--item-hover-text-color) [&>span]:flex [&>span]:items-center [&>span]:leading-none',
          compact ? 'h-5' : 'h-7',
        ].join(' ')}
        aria-expanded={open}
        aria-controls={`word-count-panel-${panelId}`}
        title={t('aura.shell.wordCount.title')}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>
          {t('aura.shell.wordCount.wordsShort', { count: String(stats.words) })}
        </span>
        <ChevronMenuIcon />
      </button>
    </div>
  )
}
