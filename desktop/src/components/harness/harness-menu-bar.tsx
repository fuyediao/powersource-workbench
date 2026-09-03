/**
 * Harness page menu bar with a true show-or-hide sidebar control.
 */

import { useTranslation } from 'react-i18next'
import { SidebarIcon } from '@/icons/AllIcons'

interface HarnessMenuBarProps {
  /** Whether the full sidebar is currently rendered. */
  sidebarVisible: boolean
  /** Localized label for the active Harness workspace. */
  activeViewLabel: string
  /** Shows or hides the full sidebar. */
  onToggleSidebar: () => void
  /** Whether the right utility sidebar is visible. */
  utilitySidebarVisible: boolean
  /** Shows or hides the right utility sidebar. */
  onToggleUtilitySidebar: () => void
}

/**
 * Renders the Harness page menu bar.
 * @param props - Sidebar state, active workspace label, and toggle handler.
 * @returns Menu bar with a persistent sidebar visibility control.
 */
export function HarnessMenuBar({
  sidebarVisible,
  activeViewLabel,
  onToggleSidebar,
  utilitySidebarVisible,
  onToggleUtilitySidebar,
}: HarnessMenuBarProps) {
  const { t } = useTranslation()
  const toggleLabel = sidebarVisible
    ? t('harness.menuBar.hideSidebar')
    : t('harness.menuBar.showSidebar')
  const utilityToggleLabel = utilitySidebarVisible
    ? t('harness.menuBar.hideUtilitySidebar')
    : t('harness.menuBar.showUtilitySidebar')

  return (
    <header
      className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-950/10 bg-white/35 px-3 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/20"
      role="menubar"
      aria-label={t('harness.menuBar.label')}
      data-testid="harness-menu-bar"
    >
      <button
        type="button"
        role="menuitem"
        data-testid="harness-sidebar-toggle"
        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand"
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={onToggleSidebar}
      >
        <SidebarIcon collapsed={!sidebarVisible} className="size-4" />
      </button>
      <span className="text-xs font-extrabold text-brand">Harness</span>
      <span className="h-4 w-px bg-zinc-950/10 dark:bg-white/10" aria-hidden />
      <span
        className="min-w-0 max-w-[360px] flex-1 truncate text-xs font-semibold text-muted"
        data-testid="harness-active-title"
        title={activeViewLabel}
      >
        {activeViewLabel}
      </span>
      <button
        type="button"
        role="menuitem"
        data-testid="harness-utility-sidebar-toggle"
        className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand"
        aria-label={utilityToggleLabel}
        title={utilityToggleLabel}
        onClick={onToggleUtilitySidebar}
      >
        <SidebarIcon
          collapsed={!utilitySidebarVisible}
          className="size-4 rotate-180"
        />
      </button>
    </header>
  )
}
