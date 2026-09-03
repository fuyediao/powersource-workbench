/**
 * Map sidebar menubar: Map source menu + optional Group switcher (admins only).
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { MapSidebarSource } from '@/hooks/use-map-scope'
import type { GroupRecord } from '@/services/groups-api'

const MENU_PANEL =
  'fixed z-100 max-h-64 min-w-[11rem] origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900'

export interface MapSidebarMenubarProps {
  source: MapSidebarSource
  availableSources: MapSidebarSource[]
  onSourceChange: (source: MapSidebarSource) => void
  canSwitchGroups: boolean
  switchableGroups: GroupRecord[]
  selectedGroupId: string | null
  onGroupChange: (groupId: string | null) => void
}

/**
 * i18n label key for a map sidebar source.
 * @param source - Active source.
 * @returns Translation key under `map.menubar.sources.*`.
 */
function sourceLabelKey(source: MapSidebarSource): string {
  switch (source) {
    case 'customer_map':
      return 'map.menubar.sources.customerMap'
    case 'crm_map':
      return 'map.menubar.sources.crmMap'
    case 'competitor_map':
      return 'map.menubar.sources.competitorMap'
    case 'map':
    default:
      return 'map.menubar.sources.map'
  }
}

/**
 * Compact menubar above Favorites / Locations (Map ▾ · Group ▾).
 * @param props - Source and group switcher state.
 * @returns Menubar row.
 */
export function MapSidebarMenubar({
  source,
  availableSources,
  onSourceChange,
  canSwitchGroups,
  switchableGroups,
  selectedGroupId,
  onGroupChange,
}: MapSidebarMenubarProps): ReactNode {
  const { t } = useTranslation()
  const [mapMenuOpen, setMapMenuOpen] = useState(false)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [mapMenuPos, setMapMenuPos] = useState({ top: 0, left: 0, width: 176 })
  const [groupMenuPos, setGroupMenuPos] = useState({ top: 0, left: 0, width: 176 })
  const mapMenuPresence = useDialogPresence(mapMenuOpen, 180)
  const groupMenuPresence = useDialogPresence(groupMenuOpen, 180)
  const mapTriggerRef = useRef<HTMLButtonElement>(null)
  const mapMenuRef = useRef<HTMLUListElement>(null)
  const groupTriggerRef = useRef<HTMLButtonElement>(null)
  const groupMenuRef = useRef<HTMLUListElement>(null)

  const showGroupMenu =
    canSwitchGroups && switchableGroups.length > 0 && source !== 'map'
  const selectedGroupName =
    selectedGroupId == null
      ? t('map.menubar.allGroups')
      : (switchableGroups.find((group) => group.id === selectedGroupId)?.name ??
        t('map.menubar.group'))
  const nativeApplicationMenu = Boolean(window.geocrm?.window?.usesNativeApplicationMenu)

  /**
   * Positions a floating menu under its trigger.
   * @param trigger - Trigger button.
   * @param setPos - Position setter.
   */
  function placeMenu(
    trigger: HTMLButtonElement | null,
    setPos: (next: { top: number; left: number; width: number }) => void,
  ): void {
    if (!trigger) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 176),
    })
  }

  useLayoutEffect(() => {
    if (mapMenuOpen) {
      placeMenu(mapTriggerRef.current, setMapMenuPos)
    }
  }, [mapMenuOpen])

  useLayoutEffect(() => {
    if (groupMenuOpen) {
      placeMenu(groupTriggerRef.current, setGroupMenuPos)
    }
  }, [groupMenuOpen])

  useEffect(() => {
    if (source === 'map') {
      setGroupMenuOpen(false)
    }
  }, [source])

  useEffect(() => {
    if (!mapMenuOpen && !groupMenuOpen) {
      return
    }
    /**
     * Closes menus on outside pointer / Escape.
     * @param event - Browser event.
     */
    function onPointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (
        mapTriggerRef.current?.contains(target) ||
        mapMenuRef.current?.contains(target) ||
        groupTriggerRef.current?.contains(target) ||
        groupMenuRef.current?.contains(target)
      ) {
        return
      }
      setMapMenuOpen(false)
      setGroupMenuOpen(false)
    }
    /**
     * Closes menus on Escape.
     * @param event - Keyboard event.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMapMenuOpen(false)
        setGroupMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [groupMenuOpen, mapMenuOpen])

  if (nativeApplicationMenu) {
    return null
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-zinc-950/10 bg-zinc-950/5 px-2 dark:border-white/10 dark:bg-zinc-950/40">
      <button
        ref={mapTriggerRef}
        type="button"
        className="flex h-7 max-w-[11rem] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink outline-none transition hover:bg-zinc-950/10 dark:hover:bg-white/10"
        aria-haspopup="listbox"
        aria-expanded={mapMenuOpen}
        aria-label={t('map.menubar.mapMenu')}
        onClick={() => {
          setGroupMenuOpen(false)
          setMapMenuOpen((open) => !open)
        }}
      >
        <span className="truncate">{t(sourceLabelKey(source))}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
      </button>

      {showGroupMenu ? (
        <button
          ref={groupTriggerRef}
          type="button"
          className="ml-auto flex h-7 max-w-[11rem] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink outline-none transition hover:bg-zinc-950/10 dark:hover:bg-white/10"
          aria-haspopup="listbox"
          aria-expanded={groupMenuOpen}
          aria-label={t('map.menubar.groupMenu')}
          onClick={() => {
            setMapMenuOpen(false)
            setGroupMenuOpen((open) => !open)
          }}
        >
          <span className="truncate text-muted">{t('map.menubar.group')}</span>
          <span className="truncate">{selectedGroupName}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted" aria-hidden />
        </button>
      ) : null}

      {mapMenuPresence.mounted
        ? createPortal(
            <ul
              ref={mapMenuRef}
              role="listbox"
              aria-label={t('map.menubar.mapMenu')}
              className={[
                MENU_PANEL,
                mapMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in',
              ].join(' ')}
              style={{ top: mapMenuPos.top, left: mapMenuPos.left, width: mapMenuPos.width }}
            >
              {availableSources.map((item) => {
                const selected = item === source
                return (
                  <li key={item} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                      onClick={() => {
                        onSourceChange(item)
                        setMapMenuOpen(false)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{t(sourceLabelKey(item))}</span>
                      {selected ? <CheckIcon className="size-3.5 shrink-0 text-brand" aria-hidden /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}

      {showGroupMenu && groupMenuPresence.mounted
        ? createPortal(
            <ul
              ref={groupMenuRef}
              role="listbox"
              aria-label={t('map.menubar.groupMenu')}
              className={[
                MENU_PANEL,
                groupMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in',
              ].join(' ')}
              style={{ top: groupMenuPos.top, left: groupMenuPos.left, width: groupMenuPos.width }}
            >
              <li role="option" aria-selected={selectedGroupId === null}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                  onClick={() => {
                    onGroupChange(null)
                    setGroupMenuOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{t('map.menubar.allGroups')}</span>
                  {selectedGroupId === null ? (
                    <CheckIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
                  ) : null}
                </button>
              </li>
              {switchableGroups.map((group) => {
                const selected = group.id === selectedGroupId
                return (
                  <li key={group.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                      onClick={() => {
                        onGroupChange(group.id)
                        setGroupMenuOpen(false)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      {selected ? (
                        <CheckIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
