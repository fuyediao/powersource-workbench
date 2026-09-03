import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRightIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { SettingsSwitch } from '@/components/settings/settings-switch'

/**
 * Full-width overlay dialog shell matching `CheckUpdatesDialog` chrome, used by
 * every Clash settings sub-editor (Ports, Controller, DNS, etc.).
 * @param props - Open state, title, body, and optional footer / width.
 * @returns Dialog overlay, or null while unmounted.
 */
export function ClashDialogShell({
  open,
  onClose,
  title,
  headerExtra,
  children,
  footer,
  widthClassName = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: string
  headerExtra?: ReactNode
  children: ReactNode
  footer?: ReactNode
  widthClassName?: string
}) {
  const presence = useDialogPresence(open, 200)

  if (!presence.mounted) {
    return null
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[85vh] w-full ${widthClassName} flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-950/10 px-5 py-4 dark:border-white/10">
          <p className="text-base font-bold text-brand">{title}</p>
          {headerExtra}
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-950/10 px-5 py-4 dark:border-white/10">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Primary (brand-filled) dialog action button. */
export function ClashPrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded-full bg-brand px-4 py-2 text-sm font-bold text-brand-fg transition disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Secondary (outline) dialog action button. */
export function ClashSecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="rounded-full border border-zinc-950/10 px-4 py-2 text-sm font-semibold text-brand transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Label + arbitrary right-aligned control row, used inside dialog bodies and the main list. */
export function ClashRow({
  label,
  description,
  children,
  onClick,
}: {
  label: ReactNode
  description?: string
  children?: ReactNode
  onClick?: () => void
}) {
  const interactive = typeof onClick === 'function'
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border border-zinc-950/10 px-4 py-3 dark:border-white/10 ${
        interactive ? 'cursor-pointer transition hover:bg-zinc-950/5 dark:hover:bg-white/10' : ''
      }`}
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-brand">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

/** Label + switch row (used for boolean toggles inside dialogs). */
export function ClashSwitchRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: ReactNode
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <ClashRow label={label} description={description}>
      <SettingsSwitch checked={checked} disabled={disabled} onChange={onChange} />
    </ClashRow>
  )
}

/** Full-width chevron drill-in row (opens a sub-dialog). */
export function ClashDrillInRow({
  label,
  value,
  onClick,
}: {
  label: string
  value?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-950/10 px-4 py-3 text-left transition hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/10"
      onClick={onClick}
    >
      <span className="text-sm font-semibold text-brand">{label}</span>
      <span className="flex items-center gap-2 text-sm text-muted">
        {value ? <span className="truncate">{value}</span> : null}
        <ChevronRightIcon className="size-4 shrink-0" />
      </span>
    </button>
  )
}

/** Small bordered text / number input matching Settings field chrome. */
export function ClashTextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  className = 'w-32',
}: {
  value: string | number
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'number'
  disabled?: boolean
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      className={`rounded-xl border border-zinc-950/10 bg-white px-3 py-1.5 text-sm text-ink outline-none transition focus:border-brand/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 ${className}`}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

/**
 * Generic dropdown select matching Preferences' language picker chrome.
 * @param props - Value, options, and change handler.
 * @returns Dropdown button + animated option list.
 */
export function ClashDropdown<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className = 'w-40',
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const presence = useDialogPresence(open, 180)
  const ref = useRef<HTMLDivElement>(null)
  const activeLabel = options.find((option) => option.value === value)?.label ?? ''

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointerDown(event: MouseEvent): void {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-950/10 bg-white px-3 py-1.5 text-left text-sm font-semibold text-brand outline-none transition disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
        onClick={() => setOpen((next) => !next)}
      >
        <span className="truncate">{activeLabel}</span>
        <ChevronDownIcon className={`size-3.5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {presence.mounted ? (
        <ul
          className={`absolute z-30 mt-1 max-h-64 w-full min-w-max origin-top overflow-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
            presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
        >
          {options.map((option) => {
            const selected = option.value === value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  className={`flex w-full px-4 py-2 text-left text-sm font-semibold whitespace-nowrap transition ${
                    selected
                      ? 'bg-brand/15 text-brand'
                      : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                  }`}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/** Group heading matching Aura / Preferences section chrome. */
export function ClashGroupHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-semibold text-muted">{children}</h3>
}
