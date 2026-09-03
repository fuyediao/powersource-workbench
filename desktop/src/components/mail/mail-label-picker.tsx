import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon } from '@/icons/AllIcons'
import type { MailLabel, MailMessage } from '@/types/mail'

interface MailLabelPickerProps {
  labels: MailLabel[]
  messages: MailMessage[]
  canCreate: boolean
  onToggle: (labelId: string, add: boolean) => void
  onCreate: (name: string) => Promise<void>
  onClose: () => void
}

/**
 * Apply / remove Gmail labels for the current selection.
 * @param props - Labels and handlers.
 * @returns Popover.
 */
export function MailLabelPicker({
  labels,
  messages,
  canCreate,
  onToggle,
  onCreate,
  onClose,
}: MailLabelPickerProps): ReactNode {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      return labels
    }
    return labels.filter((row) => row.name.toLowerCase().includes(q))
  }, [labels, query])

  return (
    <div className="w-64 overflow-hidden rounded-xl border border-mail-divider bg-mail-menu py-1 text-[13px] shadow-xl backdrop-blur-xl">
      <div className="px-2 py-1.5">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('mail.labelsSearch')}
          className="w-full rounded-md border border-mail-divider bg-mail-input px-2 py-1 text-[12px] outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-muted">{t('mail.labelsEmpty')}</p>
        ) : (
          filtered.map((label) => {
            const applied = messages.length > 0 && messages.every((row) => row.labels.includes(label.id) || row.labels.includes(label.name))
            return (
              <button
                key={label.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-mail-row-hover"
                onClick={() => onToggle(label.id, !applied)}
              >
                <span
                  className={`grid size-4 place-items-center rounded border ${
                    applied ? 'border-brand bg-mail-selected text-brand' : 'border-mail-divider'
                  }`}
                  aria-hidden
                >
                  {applied ? <CheckIcon className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{label.name}</span>
              </button>
            )
          })
        )}
      </div>
      {canCreate ? (
        <>
          <div className="my-1 border-t border-mail-divider" />
          <form
            className="flex gap-1 px-2 py-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              const name = query.trim()
              if (!name || creating) {
                return
              }
              setCreating(true)
              void onCreate(name).finally(() => {
                setCreating(false)
                setQuery('')
                onClose()
              })
            }}
          >
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('mail.newLabel')}
              className="min-w-0 flex-1 rounded-md border border-mail-divider bg-mail-input px-2 py-1 text-[12px] outline-none"
            />
            <button
              type="submit"
              disabled={!query.trim() || creating}
              className="rounded-md bg-brand px-2 py-1 text-[12px] font-semibold text-brand-fg disabled:opacity-40"
            >
              {t('mail.create')}
            </button>
          </form>
        </>
      ) : null}
    </div>
  )
}
