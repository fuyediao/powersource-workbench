import type { ReactNode } from 'react'

interface ToolsSearchHitButtonProps {
  active: boolean
  title: string
  subtitle: string
  kindLabel: string
  selectLabel: string
  selectedLabel: string
  thumb: ReactNode
  onSelect: () => void
}

/**
 * Shared search-result row for currency and markets tools lists.
 * @param props - Labels, thumb, and selection handlers.
 * @returns Result row button.
 */
export function ToolsSearchHitButton({
  active,
  title,
  subtitle,
  kindLabel,
  selectLabel,
  selectedLabel,
  thumb,
  onSelect,
}: ToolsSearchHitButtonProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
        active
          ? 'bg-brand/15 ring-1 ring-brand/30'
          : 'hover:bg-brand/10 dark:hover:bg-brand/15'
      }`}
      onClick={onSelect}
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">
            {kindLabel}
          </span>
        </span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      <span className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        {active ? selectedLabel : selectLabel}
      </span>
    </button>
  )
}
