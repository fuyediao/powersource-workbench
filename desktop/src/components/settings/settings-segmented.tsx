export interface SettingsSegmentOption<T extends string = string> {
  value: T
  label: string
}

interface SettingsSegmentedProps<T extends string> {
  /** Selected option value. */
  value: T
  /** Available options (typically 2–3). */
  options: ReadonlyArray<SettingsSegmentOption<T>>
  /** Called when the user picks an option. */
  onChange: (value: T) => void
  /** Optional `aria-labelledby` id. */
  labelledBy?: string
  /** Extra classes on the root grid. */
  className?: string
}

/**
 * Left–right segmented control matching Appearance / Page settings chips.
 *
 * @param props - Value, options, and change handler.
 * @returns Segmented button group.
 */
export function SettingsSegmented<T extends string>({
  value,
  options,
  onChange,
  labelledBy,
  className = '',
}: SettingsSegmentedProps<T>) {
  const columns = Math.min(Math.max(options.length, 1), 4)

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={`grid gap-2 ${className}`.trim()}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={`rounded-2xl px-3 py-3 text-center text-sm font-semibold transition ${
              selected
                ? 'bg-brand text-brand-fg shadow-lg shadow-brand/25'
                : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
            }`}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
