import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { SidebarIcon, SourceIcon } from '@/icons/AllIcons'
import { WordCountStatus } from '@/components/aura/word-count-status'
import { dispatchAuraMenuAction } from '@/utils/aura/menu-actions'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { DocumentStats } from '@/utils/aura/document-stats'

type MenuItem =
  | { type: 'item'; action: string; label: string; shortcut?: string }
  | { type: 'separator' }

type MenuGroup = {
  id: string
  label: string
  items: MenuItem[]
}

interface AppMenubarProps {
  /** Live document metrics for the word-count control. */
  docStats: DocumentStats
  /** Whether source (Monaco) mode is active. */
  sourceMode: boolean
  /** Whether the sidebar is collapsed. */
  sidebarCollapsed: boolean
  /** Whether the sidebar may be toggled (preference). */
  outlineCollapsible: boolean
  /** Toggle the Files/Outline sidebar. */
  onToggleSidebar: () => void
  /** Toggle WYSIWYG vs source mode. */
  onToggleSource: () => void
}

const toolButtonClass = [
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded border border-transparent',
  'bg-transparent text-(--text-color)/70 hover:bg-(--item-hover-bg-color) hover:text-(--item-hover-text-color)',
].join(' ')

const toolButtonActiveClass = [
  'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded aura-border',
  'bg-(--active-file-bg-color) text-(--active-file-text-color) hover:bg-(--item-hover-bg-color)',
].join(' ')

/**
 * Build the in-page menubar groups.
 *
 * @param t - i18n translate function.
 * @returns Menu group list.
 */
function buildMenus(t: TFunction): MenuGroup[] {
  return [
    {
      id: 'file',
      label: t('aura.menu.file'),
      items: [
        { type: 'item', action: 'file:new', label: t('aura.menu.new'), shortcut: 'Ctrl+N' },
        { type: 'item', action: 'file:open', label: t('aura.menu.open'), shortcut: 'Ctrl+O' },
        { type: 'item', action: 'file:save', label: t('aura.menu.save'), shortcut: 'Ctrl+S' },
        { type: 'separator' },
        {
          type: 'item',
          action: 'export:markdown',
          label: `${t('aura.menu.export')} ${t('aura.menu.exportMarkdown')}`,
        },
        {
          type: 'item',
          action: 'export:html',
          label: `${t('aura.menu.export')} ${t('aura.menu.exportHtml')}`,
        },
      ],
    },
    {
      id: 'edit',
      label: t('aura.menu.edit'),
      items: [
        { type: 'item', action: 'edit:undo', label: t('aura.menu.undo'), shortcut: 'Ctrl+Z' },
        { type: 'item', action: 'edit:redo', label: t('aura.menu.redo'), shortcut: 'Ctrl+Y' },
        { type: 'separator' },
        { type: 'item', action: 'edit:cut', label: t('aura.menu.cut') },
        { type: 'item', action: 'edit:copy', label: t('aura.menu.copy') },
        { type: 'item', action: 'edit:paste', label: t('aura.menu.paste') },
        { type: 'item', action: 'edit:select-all', label: t('aura.menu.selectAll') },
        { type: 'separator' },
        { type: 'item', action: 'edit:find', label: t('aura.menu.find'), shortcut: 'Ctrl+F' },
        { type: 'item', action: 'edit:replace', label: t('aura.menu.replace'), shortcut: 'Ctrl+H' },
      ],
    },
    {
      id: 'format',
      label: t('aura.menu.format'),
      items: [
        { type: 'item', action: 'format:bold', label: t('aura.menu.bold'), shortcut: 'Ctrl+B' },
        { type: 'item', action: 'format:italic', label: t('aura.menu.italic'), shortcut: 'Ctrl+I' },
        { type: 'item', action: 'format:strike', label: t('aura.menu.strike') },
        { type: 'separator' },
        { type: 'item', action: 'format:h1', label: t('aura.menu.h1') },
        { type: 'item', action: 'format:h2', label: t('aura.menu.h2') },
        { type: 'item', action: 'format:h3', label: t('aura.menu.h3') },
      ],
    },
    {
      id: 'view',
      label: t('aura.menu.view'),
      items: [
        {
          type: 'item',
          action: 'view:toggle-sidebar',
          label: t('aura.menu.toggleSidebar'),
        },
        { type: 'item', action: 'view:sidebar-outline', label: t('aura.menu.outline') },
        { type: 'item', action: 'view:sidebar-files', label: t('aura.menu.filesPanel') },
        { type: 'separator' },
        {
          type: 'item',
          action: 'view:toggle-source',
          label: t('aura.menu.sourceMode'),
          shortcut: 'Ctrl+.',
        },
        {
          type: 'item',
          action: 'view:toggle-focus',
          label: t('aura.menu.focusMode'),
        },
      ],
    },
  ]
}

/**
 * One menubar group with enter/leave dropdown animation.
 *
 * @param props - Group data and open-state handlers.
 * @returns Menu trigger and animated panel.
 */
function MenubarMenuGroup({
  group,
  open,
  anyOpen,
  onOpen,
  onClose,
}: {
  group: MenuGroup
  open: boolean
  anyOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const presence = useDialogPresence(open, 180)

  return (
    <div className="relative">
      <button
        type="button"
        className={[
          'h-full rounded px-2.5 text-(--text-color)/85 transition-colors duration-200 hover:bg-(--item-hover-bg-color)',
          open ? 'bg-(--item-hover-bg-color)' : '',
        ].join(' ')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            onClose()
          } else {
            onOpen()
          }
        }}
        onMouseEnter={() => {
          if (anyOpen) {
            onOpen()
          }
        }}
      >
        {group.label}
      </button>
      {presence.mounted ? (
        <div
          role="menu"
          className={[
            // Panel chrome ignores hits so overlapping sidebar tabs stay clickable;
            // only menu items receive pointer events.
            'pointer-events-none absolute left-0 top-full z-50 mt-0.5 min-w-52 origin-top rounded-md border border-(--border-color) bg-(--panel-background-color) py-1 shadow-lg',
            presence.leaving || !open
              ? 'animate-dropdown-out'
              : 'animate-dropdown-in',
          ].join(' ')}
        >
          {group.items.map((item, index) => {
            if (item.type === 'separator') {
              return (
                <div
                  key={`sep-${group.id}-${index}`}
                  className="my-1 border-t border-(--border-color)"
                  role="separator"
                />
              )
            }
            return (
              <button
                key={item.action}
                type="button"
                role="menuitem"
                className="pointer-events-auto flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left transition-colors hover:bg-(--item-hover-bg-color)"
                onClick={() => {
                  onClose()
                  dispatchAuraMenuAction(item.action)
                }}
              >
                <span>{item.label}</span>
                {item.shortcut ? (
                  <span className="text-[11px] text-(--text-color)/45">
                    {item.shortcut}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * In-page editor menubar with view tool buttons and word count on the right.
 * Hidden on macOS where those commands live on the native application menu.
 *
 * @param props - Live editor chrome state and actions.
 * @returns Menubar element, or null when the native application menu is used.
 */
export function AppMenubar({
  docStats,
  sourceMode,
  sidebarCollapsed,
  outlineCollapsible,
  onToggleSidebar,
  onToggleSource,
}: AppMenubarProps) {
  const { t, i18n } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [menus, setMenus] = useState(() => buildMenus(t))
  const nativeApplicationMenu = Boolean(window.geocrm?.window?.usesNativeApplicationMenu)

  useEffect(() => {
    setMenus(buildMenus(t))
  }, [t, i18n.language])

  useEffect(() => {
    /**
     * Close the open menu when clicking outside.
     *
     * @param event - Pointer event.
     */
    function onPointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    /**
     * Keyboard shortcuts for common menu actions.
     *
     * @param event - Keyboard event.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpenId(null)
      }
      const mod = event.metaKey || event.ctrlKey
      if (!mod) {
        return
      }
      const key = event.key.toLowerCase()
      const map: Record<string, string> = {
        n: 'file:new',
        o: 'file:open',
        s: 'file:save',
        f: 'edit:find',
        h: 'edit:replace',
        b: 'format:bold',
        i: 'format:italic',
        z: 'edit:undo',
        y: 'edit:redo',
      }
      const action = map[key]
      if (!action) {
        return
      }
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable) &&
        (action.startsWith('edit:find') ||
          action.startsWith('edit:replace') ||
          action.startsWith('format:') ||
          action === 'edit:undo' ||
          action === 'edit:redo')
      ) {
        if (!action.startsWith('file:')) {
          return
        }
      }
      if (
        action.startsWith('file:') ||
        action.startsWith('format:') ||
        action.startsWith('edit:find') ||
        action.startsWith('edit:replace') ||
        action === 'edit:undo' ||
        action === 'edit:redo'
      ) {
        event.preventDefault()
        dispatchAuraMenuAction(action)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    /**
     * Toggle source mode with Control+. (capture so Monaco does not steal it).
     *
     * @param event - Keyboard event.
     */
    function onToggleSourceKey(event: KeyboardEvent): void {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return
      }
      if (event.key !== '.' && event.code !== 'Period') {
        return
      }
      event.preventDefault()
      dispatchAuraMenuAction('view:toggle-source')
    }
    window.addEventListener('keydown', onToggleSourceKey, true)
    return () => window.removeEventListener('keydown', onToggleSourceKey, true)
  }, [])

  if (nativeApplicationMenu) {
    return null
  }

  return (
    <div
      ref={rootRef}
      className="aura-app-menubar aura-chrome-panel relative z-30 flex h-9 shrink-0 items-stretch gap-0.5 rounded-2xl px-1.5 text-[13px] text-(--text-color)"
      role="menubar"
    >
      {menus.map((group) => (
        <MenubarMenuGroup
          key={group.id}
          group={group}
          open={openId === group.id}
          anyOpen={openId !== null}
          onOpen={() => setOpenId(group.id)}
          onClose={() => setOpenId(null)}
        />
      ))}
      <div className="ml-auto flex items-center gap-0.5 self-center pr-0.5">
        {!sourceMode && outlineCollapsible ? (
          <button
            type="button"
            className={sidebarCollapsed ? toolButtonActiveClass : toolButtonClass}
            aria-label={
              sidebarCollapsed
                ? t('aura.shell.expandSidebar')
                : t('aura.shell.collapseSidebar')
            }
            aria-pressed={!sidebarCollapsed}
            title={t('aura.shell.toggleSidebar')}
            onClick={onToggleSidebar}
          >
            <SidebarIcon collapsed={sidebarCollapsed} />
          </button>
        ) : null}
        <button
          type="button"
          className={sourceMode ? toolButtonActiveClass : toolButtonClass}
          aria-label={t('aura.shell.toggleSource')}
          aria-pressed={sourceMode}
          title={t('aura.shell.toggleSource')}
          onClick={onToggleSource}
        >
          <SourceIcon />
        </button>
        <WordCountStatus stats={docStats} compact />
      </div>
    </div>
  )
}
