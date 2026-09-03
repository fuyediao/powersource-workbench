interface SettingsSwitchProps {
  /** Whether the switch is on. */
  checked: boolean
  /** Called when the user toggles. */
  onChange: (next: boolean) => void
  /** Optional disabled state. */
  disabled?: boolean
  /** Accessible name when no visible label is associated. */
  'aria-label'?: string
}

/**
 * Sliding capsule switch matching Settings → Background auto-rotate.
 *
 * @param props - Checked state and change handler.
 * @returns Capsule switch control.
 */
export function SettingsSwitch({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: SettingsSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? 'bg-brand' : 'bg-zinc-950/15 dark:bg-white/15'
      } disabled:cursor-not-allowed disabled:opacity-50`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
