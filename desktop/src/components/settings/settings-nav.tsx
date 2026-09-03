import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SidebarModeControl } from '@/components/layout/sidebar-mode-control'
import {
  groupVisibleSettingsSections,
  type SettingsSection,
} from '@/components/settings/settings-types'
import {
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_EXPANDED_PX,
  type SidebarMode,
} from '@/hooks/use-sidebar-mode'
import type { Theme } from '@/hooks/use-theme'
import {
  AdminAppsIcon,
  BrainIcon,
  CodeIcon,
  CrownIcon,
  OpenSourceIcon,
  ImageIcon,
  LucideMegaphoneIcon,
  MoonIcon,
  PageIcon,
  SettingsIcon,
  SortIcon,
  ShieldIcon,
  SunIcon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  AuraMarkdownIcon,
} from '@/icons/AllIcons'

interface IndicatorBox {
  y: number
  height: number
  ready: boolean
}

interface SettingsNavProps {
  section: SettingsSection
  onSelectSection: (section: SettingsSection) => void
  visibleSections: SettingsSection[]
  theme: Theme
  expanded: boolean
  mode: SidebarMode
  onSetMode: (mode: SidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: {
    currentTarget: EventTarget | null
    relatedTarget: EventTarget | null
  }) => void
}

type NavIcon = (props: { className?: string }) => ReactNode

/**
 * Builds nav row metadata for the given visible section ids.
 * @param visibleSections - Sections to show in the rail.
 * @param theme - Current appearance theme (sun/moon for theme row).
 * @param t - Translator.
 * @returns Ordered nav items.
 */
function buildNavItems(
  visibleSections: SettingsSection[],
  theme: Theme,
  t: (key: string) => string,
): Array<{ id: SettingsSection; label: string; Icon: NavIcon }> {
  const catalog: Record<SettingsSection, { label: string; Icon: NavIcon }> = {
    profile: { label: t('settings.sections.profile'), Icon: UserIcon },
    preferences: { label: t('settings.sections.preferences'), Icon: SettingsIcon },
    oaErp: { label: t('settings.sections.oaErp'), Icon: AdminAppsIcon },
    ai: { label: t('settings.sections.ai'), Icon: BrainIcon },
    mcp: { label: t('settings.sections.mcp'), Icon: CodeIcon },
    privacy: { label: t('settings.sections.privacy'), Icon: ShieldIcon },
    theme: {
      label: t('settings.sections.theme'),
      Icon: theme === 'dark' ? SunIcon : MoonIcon,
    },
    page: { label: t('settings.sections.page'), Icon: PageIcon },
    widgets: { label: t('settings.sections.widgets'), Icon: SortIcon },
    background: { label: t('settings.sections.background'), Icon: ImageIcon },
    aura: { label: t('settings.sections.aura'), Icon: AuraMarkdownIcon },
    feedback: { label: t('settings.sections.feedback'), Icon: LucideMegaphoneIcon },
    openSource: { label: t('settings.sections.openSource'), Icon: OpenSourceIcon },
    groupManagement: {
      label: t('settings.sections.groupManagement'),
      Icon: UsersIcon,
    },
    userManagement: {
      label: t('settings.sections.userManagement'),
      Icon: UserCogIcon,
    },
    globalLeaders: {
      label: t('settings.sections.globalLeaders'),
      Icon: CrownIcon,
    },
    groupAdmin: { label: t('settings.sections.groupAdmin'), Icon: UsersIcon },
    groupInfo: { label: t('settings.sections.groupInfo'), Icon: UsersIcon },
  }

  return visibleSections.map((id) => ({ id, ...catalog[id] }))
}

/**
 * Glass settings sidebar with sliding pill indicator and Admin rail chrome.
 * On macOS the footer control is hidden; mode is chosen from the native
 * application menu instead.
 * @param props - Active section, visibility list, theme, and sidebar mode.
 * @returns Settings navigation aside.
 */
export function SettingsNav({
  section,
  onSelectSection,
  visibleSections,
  theme,
  expanded,
  mode,
  onSetMode,
  onPointerEnter,
  onPointerLeave,
  onFocusIn,
  onFocusOut,
}: SettingsNavProps) {
  const { t } = useTranslation()
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const navRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  const buttonRefs = useRef(new Map<SettingsSection, HTMLButtonElement>())
  const [indicator, setIndicator] = useState<IndicatorBox>({
    y: 0,
    height: 0,
    ready: false,
  })
  const groups = groupVisibleSettingsSections(visibleSections)
  const hoverOverlay = mode === 'hover'

  /**
   * Measures the active sidebar button for the sliding indicator.
   * @returns Nothing.
   */
  function syncIndicator(): void {
    const nav = navRef.current
    const button = buttonRefs.current.get(section)
    if (!nav || !button) {
      return
    }
    setIndicator({
      y: button.offsetTop,
      height: button.offsetHeight,
      ready: true,
    })
  }

  useLayoutEffect(() => {
    syncIndicator()
  }, [section, visibleSections, expanded])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) {
      return
    }
    /**
     * Keeps the sidebar indicator aligned after layout / breakpoint changes.
     * @returns Nothing.
     */
    function handleResize(): void {
      syncIndicator()
    }
    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(() => {
      syncIndicator()
    })
    observer.observe(nav)
    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [section, visibleSections, expanded])

  return (
    <aside
      ref={asideRef}
      className={[
        'glass-panel relative flex h-full min-h-0 flex-col overflow-hidden border-y-0 border-l-0 transition-[width,box-shadow] duration-300 ease-out',
        hoverOverlay ? 'absolute inset-y-0 left-0 z-20' : 'w-full',
        hoverOverlay && expanded ? 'shadow-xl shadow-black/20' : '',
      ].join(' ')}
      style={
        hoverOverlay
          ? { width: expanded ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX }
          : undefined
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={(event) => {
        onPointerLeave()
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
          return
        }
        const root = asideRef.current
        const active = document.activeElement
        if (root && active instanceof HTMLElement && root.contains(active)) {
          active.blur()
        }
      }}
      onFocusCapture={onFocusIn}
      onBlurCapture={(event) =>
        onFocusOut({
          currentTarget: asideRef.current,
          relatedTarget: event.relatedTarget,
        })
      }
    >
      <nav
        className={[
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          expanded ? 'px-1.5 pr-2.5' : 'px-1.5',
        ].join(' ')}
        aria-label={t('settings.title')}
      >
        <div ref={navRef} className="relative">
          <span
            className="pointer-events-none absolute top-0 inset-x-0 rounded-2xl bg-brand shadow-lg shadow-brand/25 transition-[transform,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              height: indicator.height,
              opacity: indicator.ready ? 1 : 0,
              transform: `translateY(${indicator.y}px)`,
            }}
          />
          {groups.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`}>
              {groupIndex > 0 ? (
                <div className="mx-1 my-1 h-px shrink-0 bg-ink/10" role="separator" />
              ) : null}
              {buildNavItems(group, theme, t).map(({ id, label, Icon }) => {
                const active = section === id
                return (
                  <button
                    type="button"
                    key={id}
                    title={expanded ? undefined : label}
                    ref={(node) => {
                      if (node) {
                        buttonRefs.current.set(id, node)
                      } else {
                        buttonRefs.current.delete(id)
                      }
                    }}
                    className={`relative z-10 flex h-11 w-full items-center rounded-2xl px-2.5 text-left text-sm font-semibold transition-colors duration-300 ${
                      active ? 'text-brand-fg' : 'text-brand hover:bg-brand/10'
                    }`}
                    onClick={() => onSelectSection(id)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span
                      className={`min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,max-width,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        expanded
                          ? 'ml-2 max-w-44 truncate opacity-100'
                          : 'pointer-events-none ml-0 max-w-0 opacity-0'
                      }`}
                      aria-hidden={!expanded}
                    >
                      {label}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </nav>
      {nativeApplicationMenu ? null : (
        <SidebarModeControl expanded={expanded} mode={mode} onSetMode={onSetMode} />
      )}
    </aside>
  )
}
