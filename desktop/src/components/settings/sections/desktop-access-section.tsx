/**
 * System-admin Settings: per-group desktop Function + map-layer entry whitelist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon, UsersIcon } from '@/icons/AllIcons'
import {
  DESKTOP_FUNCTION_KEYS,
  DESKTOP_KANBAN_BOARD_KEYS,
  DESKTOP_MAP_LAYER_KEYS,
  DESKTOP_MODULE_LABEL_KEYS,
  type DesktopModuleKey,
} from '@/constants/desktop-modules'
import {
  fetchDesktopModuleAccessForGroup,
  setDesktopModuleAccessForGroup,
} from '@/services/group-desktop-module-access-api'
import { getGroupAdmins, type GroupAdminEntry } from '@/services/group-management-api'
import type { GroupRecord } from '@/services/groups-api'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'

/**
 * Settings section for Electron desktop entry ACL (independent of web modules).
 * @returns Desktop access editor UI.
 */
export function DesktopAccessSection() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const groupMenuPresence = useDialogPresence(groupMenuOpen, 180)
  const groupMenuRef = useRef<HTMLDivElement>(null)
  const [keys, setKeys] = useState<Set<DesktopModuleKey>>(new Set())
  const [draft, setDraft] = useState<Set<DesktopModuleKey>>(new Set())
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingKeys, setIsLoadingKeys] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const selectedGroupName = useMemo(() => {
    return groups.find((group) => group.id === selectedGroupId)?.name ?? ''
  }, [groups, selectedGroupId])

  const refreshGroups = useCallback(async () => {
    setIsLoadingList(true)
    try {
      const admins = await getGroupAdmins()
      const byId = new Map<string, GroupRecord>()
      for (const entry of admins as GroupAdminEntry[]) {
        byId.set(entry.group.id, entry.group)
      }
      const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
      setGroups(list)
      setSelectedGroupId((prev) => {
        if (prev && list.some((g) => g.id === prev)) {
          return prev
        }
        return list[0]?.id ?? null
      })
    } finally {
      setIsLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void refreshGroups()
  }, [refreshGroups])

  useEffect(() => {
    if (!selectedGroupId) {
      setKeys(new Set())
      setDraft(new Set())
      return
    }
    let cancelled = false
    void (async () => {
      setIsLoadingKeys(true)
      setSaveError(null)
      setSaveSuccess(false)
      const next = await fetchDesktopModuleAccessForGroup(selectedGroupId)
      if (cancelled) {
        return
      }
      setKeys(next)
      setDraft(new Set(next))
      setIsLoadingKeys(false)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedGroupId])

  useEffect(() => {
    if (!groupMenuOpen) {
      return
    }
    /**
     * Closes the group menu on outside pointer press.
     * @param event - Pointer event.
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!groupMenuRef.current?.contains(event.target as Node)) {
        setGroupMenuOpen(false)
      }
    }
    /**
     * Closes the group menu on Escape.
     * @param event - Keyboard event.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setGroupMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [groupMenuOpen])

  /**
   * Toggles one desktop entry key in the draft set.
   * @param key - Entry key.
   */
  function toggleKey(key: DesktopModuleKey): void {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    setSaveSuccess(false)
  }

  /**
   * Selects or clears every Function entry key.
   */
  function toggleAllFunctions(): void {
    setDraft((prev) => {
      const allOn = DESKTOP_FUNCTION_KEYS.every((key) => prev.has(key))
      const next = new Set(prev)
      for (const key of DESKTOP_FUNCTION_KEYS) {
        if (allOn) {
          next.delete(key)
        } else {
          next.add(key)
        }
      }
      return next
    })
    setSaveSuccess(false)
  }

  /**
   * Selects or clears every map layer key (also ensures `desktop_map` when enabling).
   */
  function toggleAllLayers(): void {
    setDraft((prev) => {
      const allOn = DESKTOP_MAP_LAYER_KEYS.every((key) => prev.has(key))
      const next = new Set(prev)
      for (const key of DESKTOP_MAP_LAYER_KEYS) {
        if (allOn) {
          next.delete(key)
        } else {
          next.add(key)
        }
      }
      if (!allOn) {
        next.add('desktop_map')
      }
      return next
    })
    setSaveSuccess(false)
  }

  /**
   * Selects or clears every Kanban board key (also ensures `desktop_kanban` when enabling).
   */
  function toggleAllKanbanBoards(): void {
    setDraft((prev) => {
      const allOn = DESKTOP_KANBAN_BOARD_KEYS.every((key) => prev.has(key))
      const next = new Set(prev)
      for (const key of DESKTOP_KANBAN_BOARD_KEYS) {
        if (allOn) {
          next.delete(key)
        } else {
          next.add(key)
        }
      }
      if (!allOn) {
        next.add('desktop_kanban')
      }
      return next
    })
    setSaveSuccess(false)
  }

  /**
   * Persists the draft whitelist for the selected group.
   */
  async function handleSave(): Promise<void> {
    if (!selectedGroupId) {
      return
    }
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    const ok = await setDesktopModuleAccessForGroup(selectedGroupId, Array.from(draft))
    if (ok) {
      setKeys(new Set(draft))
      setSaveSuccess(true)
      window.setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      setSaveError(
        t('settings.desktopAccess.saveError', {
          defaultValue: 'Failed to save desktop access',
        }),
      )
    }
    setIsSaving(false)
  }

  const mapEnabled = draft.has('desktop_map')
  const kanbanEnabled = draft.has('desktop_kanban')
  const dirty =
    draft.size !== keys.size || [...draft].some((key) => !keys.has(key))

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">
        {t('settings.desktopAccess.title', { defaultValue: 'Desktop Functions' })}
      </p>

      {isLoadingList ? (
        <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {t('settings.desktopAccess.noGroups', { defaultValue: 'No groups yet' })}
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted" id="desktop-access-group-label">
              {t('settings.desktopAccess.groupLabel', { defaultValue: 'Group' })}
            </p>
            <div className="relative" ref={groupMenuRef}>
              <FocusRingFrame
                active={groupMenuOpen}
                shellClassName={`${FOCUS_RING_SHELL} overflow-hidden`}
              >
                <button
                  type="button"
                  id="desktop-access-group"
                  aria-labelledby="desktop-access-group-label"
                  aria-haspopup="listbox"
                  aria-expanded={groupMenuOpen}
                  className="flex w-full items-center justify-between gap-3 py-3 pr-3 pl-4 text-left text-sm font-semibold text-brand outline-none transition hover:bg-zinc-950/5 dark:hover:bg-white/10"
                  onClick={() => setGroupMenuOpen((open) => !open)}
                >
                  <span className="truncate">{selectedGroupName || '—'}</span>
                  <ChevronDownIcon
                    className={`size-4 shrink-0 transition ${groupMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </FocusRingFrame>
              {groupMenuPresence.mounted ? (
                <ul
                  role="listbox"
                  aria-labelledby="desktop-access-group-label"
                  className={`absolute z-30 mt-2 max-h-64 w-full origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                    groupMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
                  }`}
                >
                  {groups.map((group) => {
                    const selected = group.id === selectedGroupId
                    return (
                      <li key={group.id} role="option" aria-selected={selected}>
                        <button
                          type="button"
                          className={`flex w-full px-4 py-2.5 text-left text-sm font-semibold transition ${
                            selected
                              ? 'bg-brand/15 text-brand'
                              : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                          }`}
                          onClick={() => {
                            setSelectedGroupId(group.id)
                            setGroupMenuOpen(false)
                          }}
                        >
                          {group.name}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          </div>

          {isLoadingKeys ? (
            <p className="py-4 text-sm text-muted">{t('common.loading')}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted">
                    {t('settings.desktopAccess.functionsTitle', {
                      defaultValue: 'Home Apps',
                    })}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-brand underline decoration-brand/40 underline-offset-2"
                    onClick={toggleAllFunctions}
                  >
                    {t('settings.desktopAccess.selectAll', { defaultValue: 'Select all' })}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {DESKTOP_FUNCTION_KEYS.map((key) => {
                    const selected = draft.has(key)
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => toggleKey(key)}
                        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${
                          selected
                            ? 'border-brand/60 bg-brand text-brand-fg'
                            : 'border-zinc-950/10 bg-zinc-950/5 text-muted hover:border-brand/40 dark:border-white/10 dark:bg-white/5'
                        }`}
                      >
                        {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                        <span className="truncate">
                          {t(DESKTOP_MODULE_LABEL_KEYS[key], { defaultValue: key })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted">
                    {t('settings.desktopAccess.layersTitle', {
                      defaultValue: 'Map layers',
                    })}
                  </p>
                  <button
                    type="button"
                    disabled={!mapEnabled}
                    className="text-xs font-semibold text-brand underline decoration-brand/40 underline-offset-2 disabled:opacity-40"
                    onClick={toggleAllLayers}
                  >
                    {t('settings.desktopAccess.selectAll', { defaultValue: 'Select all' })}
                  </button>
                </div>
                {!mapEnabled ? (
                  <p className="text-xs text-muted">
                    {t('settings.desktopAccess.layersNeedMap', {
                      defaultValue: 'Enable the Map Function before assigning layers.',
                    })}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {DESKTOP_MAP_LAYER_KEYS.map((key) => {
                    const selected = draft.has(key)
                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={!mapEnabled}
                        onClick={() => toggleKey(key)}
                        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-40 ${
                          selected
                            ? 'border-brand/60 bg-brand text-brand-fg'
                            : 'border-zinc-950/10 bg-zinc-950/5 text-muted hover:border-brand/40 dark:border-white/10 dark:bg-white/5'
                        }`}
                      >
                        {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                        <span className="truncate">
                          {t(DESKTOP_MODULE_LABEL_KEYS[key], { defaultValue: key })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted">
                    {t('settings.desktopAccess.kanbanBoardsTitle', {
                      defaultValue: 'Kanban boards',
                    })}
                  </p>
                  <button
                    type="button"
                    disabled={!kanbanEnabled}
                    className="text-xs font-semibold text-brand underline decoration-brand/40 underline-offset-2 disabled:opacity-40"
                    onClick={toggleAllKanbanBoards}
                  >
                    {t('settings.desktopAccess.selectAll', { defaultValue: 'Select all' })}
                  </button>
                </div>
                {!kanbanEnabled ? (
                  <p className="text-xs text-muted">
                    {t('settings.desktopAccess.kanbanBoardsNeedKanban', {
                      defaultValue: 'Enable the Kanban Function before assigning boards.',
                    })}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {DESKTOP_KANBAN_BOARD_KEYS.map((key) => {
                    const selected = draft.has(key)
                    return (
                      <button
                        type="button"
                        key={key}
                        disabled={!kanbanEnabled}
                        onClick={() => toggleKey(key)}
                        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-40 ${
                          selected
                            ? 'border-brand/60 bg-brand text-brand-fg'
                            : 'border-zinc-950/10 bg-zinc-950/5 text-muted hover:border-brand/40 dark:border-white/10 dark:bg-white/5'
                        }`}
                      >
                        {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                        <span className="truncate">
                          {t(DESKTOP_MODULE_LABEL_KEYS[key], { defaultValue: key })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {saveSuccess ? (
                <p className="text-sm font-semibold text-brand">
                  {t('settings.desktopAccess.saveSuccess', {
                    defaultValue: 'Desktop access saved',
                  })}
                </p>
              ) : null}
              {saveError ? <p className="text-sm font-semibold text-rose-500">{saveError}</p> : null}

              <button
                type="button"
                disabled={isSaving || !dirty}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void handleSave()}
              >
                <UsersIcon className="size-4" />
                {isSaving
                  ? t('settings.desktopAccess.saving', { defaultValue: 'Saving…' })
                  : t('settings.desktopAccess.save', { defaultValue: 'Save desktop access' })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
