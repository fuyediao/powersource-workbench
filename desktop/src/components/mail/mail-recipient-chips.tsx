import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CloseIcon } from '@/icons/AllIcons'
import { parseMailAddressSegment, splitRecipientList } from '@/utils/mail/parse-mail-recipients'

interface MailRecipientChipsProps {
  value: string
  placeholder?: string
  suggestions?: string[]
  /**
   * Extra suggestion tokens (e.g. CRM hits). Merged with `suggestions` when filtering.
   */
  extraSuggestions?: string[]
  /**
   * Notifies the parent of the in-progress query (for async CRM lookup).
   * @param query - Current draft text.
   */
  onQueryChange?: (query: string) => void
  onChange: (next: string) => void
}

/**
 * Joins chip tokens back into a comma-separated recipient field.
 * @param tokens - Address tokens.
 * @returns Field string.
 */
function joinTokens(tokens: string[]): string {
  return tokens.filter((row) => row.trim().length > 0).join(', ')
}

/**
 * Tokenizing To / Cc / Bcc field (Mailspring-style chips).
 * @param props - Value and suggestions.
 * @returns Chip field.
 */
export function MailRecipientChips({
  value,
  placeholder,
  suggestions = [],
  extraSuggestions = [],
  onQueryChange,
  onChange,
}: MailRecipientChipsProps): ReactNode {
  const tokens = useMemo(() => splitRecipientList(value), [value])
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    onQueryChange?.(draft)
  }, [draft, onQueryChange])

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) {
      return []
    }
    const existing = new Set(tokens.map((row) => row.toLowerCase()))
    const pool = [...suggestions, ...extraSuggestions]
    const seen = new Set<string>()
    const out: string[] = []
    for (const email of pool) {
      const key = email.toLowerCase()
      if (seen.has(key) || existing.has(key)) {
        continue
      }
      if (!key.includes(q)) {
        continue
      }
      seen.add(key)
      out.push(email)
      if (out.length >= 8) {
        break
      }
    }
    return out
  }, [draft, suggestions, extraSuggestions, tokens])

  /**
   * Commits the in-progress draft as a chip when it parses as an address.
   * @param raw - Draft text.
   */
  function commit(raw: string): void {
    const text = raw.trim().replace(/,$/, '')
    if (!text) {
      setDraft('')
      return
    }
    const parsed = parseMailAddressSegment(text)
    const token = parsed ? (parsed.name ? `${parsed.name} <${parsed.email}>` : parsed.email) : text
    onChange(joinTokens([...tokens, token]))
    setDraft('')
    setOpen(false)
  }

  /**
   * Handles chip-field keybindings.
   * @param event - Keyboard event.
   */
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab') {
      if (draft.trim()) {
        event.preventDefault()
        commit(draft)
      }
      return
    }
    if (event.key === 'Backspace' && !draft && tokens.length > 0) {
      onChange(joinTokens(tokens.slice(0, -1)))
    }
  }

  return (
    <div className="relative">
      <div className="flex min-h-6 flex-wrap items-center gap-1">
        {tokens.map((token) => (
          <span
            key={token}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-mail-selected px-2 py-0.5 text-[12px] text-ink"
          >
            <span className="min-w-0 truncate">{token}</span>
            <button
              type="button"
              className="text-muted hover:text-ink"
              aria-label={token}
              onClick={() => onChange(joinTokens(tokens.filter((row) => row !== token)))}
            >
              <CloseIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          placeholder={tokens.length === 0 ? placeholder : undefined}
          className="min-w-24 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
          onChange={(event) => {
            setDraft(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              if (draft.trim()) {
                commit(draft)
              }
              setOpen(false)
            }, 160)
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && filtered.length > 0 ? (
        <div className="absolute top-full left-0 z-20 mt-1 min-w-full overflow-hidden rounded-lg border border-mail-divider bg-mail-menu-solid py-1 shadow-xl">
          {filtered.map((email) => (
            <button
              key={email}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-[13px] hover:bg-mail-row-hover"
              onMouseDown={(event) => {
                event.preventDefault()
                commit(email)
              }}
            >
              {email}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
