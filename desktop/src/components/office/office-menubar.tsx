/**
 * Office (Docs/Sheets/Slides) top menubar: personal/group scope toggle and
 * group switcher. Mirrors {@link import('@/components/folio/folio-menubar').FolioMenubar};
 * per-file actions (rename/color/delete/move/copy) live in the library
 * sidebar's row context menu instead of here.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { OfficeScopeMode } from '@/hooks/use-office-scope'
import type { GroupRecord } from '@/services/groups-api'

const GROUP_MENU_PANEL =
  'fixed z-100 max-h-64 min-w-[11rem] origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900'

export interface OfficeMenubarProps {
  mode: OfficeScopeMode
  onModeChange: (mode: OfficeScopeMode) => void
  canSwitchGroups: boolean
  switchableGroups: GroupRecord[]
  selectedGroupId: string | null
  onGroupChange: (groupId: string) => void
  readOnly: boolean
}

/**
 * Glass Office menubar (~h-9) matching Folio/Mail/Aura chrome height.
 * @param props - Scope state and change handlers.
 * @returns Menubar element.
 */
export function OfficeMenubar({
  mode,
  onModeChange,
  canSwitchGroups,
  switchableGroups,
  selectedGroupId,
  onGroupChange,
  readOnly,
}: OfficeMenubarProps) {
  const { t } = useTranslation()
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 176,
  })
  const groupMenuPresence = useDialogPresence(groupMenuOpen, 180)
  const showGroupSwitcher = mode === 'group' && canSwitchGroups && switchableGroups.length > 0
  const groupSwitcherPresence = useDialogPresence(showGroupSwitcher, 200)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const scopeTrackRef = useRef<HTMLDivElement>(null)
  const personalBtnRef = useRef<HTMLButtonElement>(null)
  const groupBtnRef = useRef<HTMLButtonElement>(null)
  const [scopePill, setScopePill] = useState({ x: 0, width: 0, ready: false })
  const selectedGroupName =
    switchableGroups.find((group) => group.id === selectedGroupId)?.name ??
    t('office.menu.groupSwitcher')

  /**
   * Measures the active Personal/Group chip for the sliding pill.
   * @returns Nothing.
   */
  function syncScopePill(): void {
    const track = scopeTrackRef.current
    const active = mode === 'personal' ? personalBtnRef.current : groupBtnRef.current
    if (!track || !active) {
      return
    }
    setScopePill({ x: active.offsetLeft, width: active.offsetWidth, ready: true })
  }

  useLayoutEffect(() => {
    syncScopePill()
  }, [mode, t])

  useEffect(() => {
    const track = scopeTrackRef.current
    if (!track) {
      return
    }
    /** Keeps the scope pill aligned after layout / locale changes. */
    function handleResize(): void {
      syncScopePill()
    }
    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    observer.observe(track)
    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [mode])

  /**
   * Anchors the portaled menu under the trigger.
   * @returns Nothing.
   */
  function updateMenuPosition(): void {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setMenuPos({
      top: Math.round(rect.bottom + 6),
      left: Math.round(rect.left),
      width: Math.max(176, Math.round(rect.width)),
    })
  }

  useLayoutEffect(() => {
    if (!groupMenuOpen) {
      return
    }
    updateMenuPosition()
  }, [groupMenuOpen])

  useEffect(() => {
    if (!groupMenuOpen) {
      return
    }
    /** Closes when clicking outside the trigger and portaled menu. */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setGroupMenuOpen(false)
    }
    /** Closes on Escape. */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setGroupMenuOpen(false)
      }
    }
    /** Repositions on scroll/resize while open. */
    function handleReposition(): void {
      updateMenuPosition()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [groupMenuOpen])

  useEffect(() => {
    if (mode !== 'group') {
      setGroupMenuOpen(false)
    }
  }, [mode])

  if (nativeApplicationMenu) {
    return null
  }

  return (
    <div className="office-menubar flex h-9 shrink-0 items-center gap-2 border-b border-zinc-950/8 bg-panel/90 px-3 backdrop-blur-xl dark:border-white/8">
      <div
        ref={scopeTrackRef}
        role="group"
        aria-label={t('office.menu.scopeToggle')}
        className="relative flex items-center rounded-full bg-zinc-950/5 p-0.5 dark:bg-white/8"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-0 bottom-0.5 rounded-full bg-white shadow-sm transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-zinc-900"
          style={{
            width: scopePill.width,
            opacity: scopePill.ready ? 1 : 0,
            transform: `translateX(${scopePill.x}px)`,
          }}
        />
        <button
          ref={personalBtnRef}
          type="button"
          aria-pressed={mode === 'personal'}
          className={`relative z-10 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-300 ${
            mode === 'personal' ? 'text-brand' : 'text-muted'
          }`}
          onClick={() => onModeChange('personal')}
        >
          {t('office.menu.personal')}
        </button>
        <button
          ref={groupBtnRef}
          type="button"
          aria-pressed={mode === 'group'}
          className={`relative z-10 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-300 ${
            mode === 'group' ? 'text-brand' : 'text-muted'
          }`}
          onClick={() => onModeChange('group')}
        >
          {t('office.menu.group')}
        </button>
      </div>

      {groupSwitcherPresence.mounted ? (
        <div
          className={`transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            groupSwitcherPresence.leaving
              ? 'pointer-events-none -translate-x-1 opacity-0'
              : 'translate-x-0 opacity-100'
          }`}
        >
          <button
            ref={triggerRef}
            type="button"
            className="flex h-7 max-w-[11rem] items-center gap-1.5 rounded-lg border border-zinc-950/10 bg-canvas px-2 text-xs font-semibold text-ink outline-none transition hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/8"
            aria-label={t('office.menu.groupSwitcher')}
            aria-expanded={groupMenuOpen}
            aria-haspopup="listbox"
            onClick={() => setGroupMenuOpen((open) => !open)}
          >
            <span className="min-w-0 truncate">{selectedGroupName}</span>
            <ChevronDownIcon
              className={`size-3.5 text-muted transition ${groupMenuOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {groupMenuPresence.mounted
            ? createPortal(
                <ul
                  ref={menuRef}
                  className={`${GROUP_MENU_PANEL} ${
                    groupMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
                  }`}
                  style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
                  role="listbox"
                  aria-label={t('office.menu.groupSwitcher')}
                >
                  {switchableGroups.map((group) => {
                    const selected = group.id === selectedGroupId
                    return (
                      <li key={group.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition ${
                            selected
                              ? 'bg-brand/15 text-brand'
                              : 'text-ink hover:bg-brand/10 dark:text-zinc-100 dark:hover:bg-brand/15'
                          }`}
                          onClick={() => {
                            onGroupChange(group.id)
                            setGroupMenuOpen(false)
                          }}
                        >
                          <span className="grid size-3.5 shrink-0 place-items-center">
                            {selected ? <CheckIcon className="size-3.5" aria-hidden /> : null}
                          </span>
                          <span className="min-w-0 truncate">{group.name}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>,
                document.body,
              )
            : null}
        </div>
      ) : null}

      {readOnly ? (
        <span className="ml-auto text-xs font-semibold text-muted">
          {t('office.menu.readOnly')}
        </span>
      ) : null}
    </div>
  )
}
