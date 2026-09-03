/**
 * Calendar event invitee picker: search field + portaled dropdown + selected chips.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, CloseIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  fetchProfileSnippets,
  searchProfilesForInvite,
  type ProfileSnippet,
} from '@/services/groups-api'

export interface CalendarInviteePickerProps {
  /** Preloaded candidates (e.g. group members). */
  candidates: ProfileSnippet[]
  selectedUserIds: string[]
  /** Exclude the event owner from results. */
  excludeUserId: string
  /** When true, also search profiles remotely (personal scope). */
  remoteSearch: boolean
  disabled?: boolean
  onChange: (userIds: string[]) => void
}

/**
 * Display label for a profile snippet (chip / compact).
 * @param profile - Profile row.
 * @returns Human-readable name.
 */
function profileLabel(profile: ProfileSnippet): string {
  return profile.display_name || profile.full_name || profile.email || profile.id
}

/**
 * Primary name line for invitee rows (never falls back to email).
 * @param profile - Profile row.
 * @returns Display name or em dash.
 */
function profileName(profile: ProfileSnippet): string {
  return profile.display_name || profile.full_name || '—'
}

/**
 * Matches a profile against a free-text query.
 * @param profile - Profile snippet.
 * @param query - Lowercased query.
 * @returns True when the profile matches.
 */
function matchesQuery(profile: ProfileSnippet, query: string): boolean {
  if (!query) {
    return true
  }
  const haystack = [
    profile.display_name,
    profile.full_name,
    profile.email,
    profile.employee_id,
    profile.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

/**
 * Invitee search combobox with a portaled dropdown layered above the event dialog.
 * @param props - Candidates, selection, and search mode.
 * @returns Invitee fieldset.
 */
export function CalendarInviteePicker({
  candidates,
  selectedUserIds,
  excludeUserId,
  remoteSearch,
  disabled = false,
  onChange,
}: CalendarInviteePickerProps) {
  const { t } = useTranslation()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ left: 0, width: 240, top: 0 })
  const [remoteResults, setRemoteResults] = useState<ProfileSnippet[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [knownProfiles, setKnownProfiles] = useState<Map<string, ProfileSnippet>>(
    () => new Map(candidates.map((profile) => [profile.id, profile])),
  )
  const menuPresence = useDialogPresence(menuOpen, 180)
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds])

  /**
   * Anchors the portaled menu below the search field (above the dialog panel).
   * @returns Nothing.
   */
  function updateMenuPosition(): void {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setMenuPos({
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      top: Math.round(rect.bottom + 6),
    })
  }

  useLayoutEffect(() => {
    if (!menuOpen) {
      return
    }
    updateMenuPosition()
  }, [menuOpen, query, candidates.length, remoteResults.length, remoteLoading])

  useEffect(() => {
    setKnownProfiles((prev) => {
      const next = new Map(prev)
      for (const profile of candidates) {
        next.set(profile.id, profile)
      }
      return next
    })
  }, [candidates])

  useEffect(() => {
    if (selectedUserIds.length === 0) {
      return
    }
    let cancelled = false
    void fetchProfileSnippets(selectedUserIds).then((map) => {
      if (cancelled || map.size === 0) {
        return
      }
      setKnownProfiles((prev) => {
        let changed = false
        const next = new Map(prev)
        for (const [id, profile] of map) {
          if (!next.has(id)) {
            next.set(id, profile)
            changed = true
          }
        }
        return changed ? next : prev
      })
    })
    return () => {
      cancelled = true
    }
  }, [selectedUserIds])

  useEffect(() => {
    if (!remoteSearch) {
      setRemoteResults([])
      setRemoteLoading(false)
      return
    }
    const trimmed = query.trim()
    if (trimmed.length < 1) {
      setRemoteResults([])
      setRemoteLoading(false)
      return
    }
    setRemoteLoading(true)
    const timer = window.setTimeout(() => {
      void searchProfilesForInvite(trimmed)
        .then((results) => {
          const filtered = results.filter((profile) => profile.id !== excludeUserId)
          setRemoteResults(filtered)
          setKnownProfiles((prev) => {
            const next = new Map(prev)
            for (const profile of filtered) {
              next.set(profile.id, profile)
            }
            return next
          })
        })
        .catch((err: unknown) => {
          console.error(err)
          setRemoteResults([])
        })
        .finally(() => setRemoteLoading(false))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, remoteSearch, excludeUserId])

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    /**
     * Closes the dropdown on outside pointer down.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setMenuOpen(false)
    }
    /**
     * Closes the dropdown on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    /**
     * Repositions on scroll/resize while open.
     * @returns Nothing.
     */
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
  }, [menuOpen])

  const normalizedQuery = query.trim().toLowerCase()

  const dropdownProfiles = useMemo(() => {
    const byId = new Map<string, ProfileSnippet>()
    for (const profile of candidates) {
      if (profile.id === excludeUserId || selectedSet.has(profile.id)) {
        continue
      }
      if (matchesQuery(profile, normalizedQuery)) {
        byId.set(profile.id, profile)
      }
    }
    if (remoteSearch) {
      for (const profile of remoteResults) {
        if (selectedSet.has(profile.id)) {
          continue
        }
        byId.set(profile.id, profile)
      }
    }
    return [...byId.values()].sort((a, b) =>
      profileLabel(a).localeCompare(profileLabel(b), undefined, { sensitivity: 'base' }),
    )
  }, [
    candidates,
    excludeUserId,
    normalizedQuery,
    remoteResults,
    remoteSearch,
    selectedSet,
  ])

  const selectedProfiles = useMemo(() => {
    return selectedUserIds
      .map((id) => knownProfiles.get(id))
      .filter((profile): profile is ProfileSnippet => Boolean(profile))
  }, [knownProfiles, selectedUserIds])

  /**
   * Adds an invitee and clears the search query.
   * @param userId - Profile id.
   * @returns Nothing.
   */
  function addInvitee(userId: string): void {
    if (selectedSet.has(userId)) {
      return
    }
    onChange([...selectedUserIds, userId])
    setQuery('')
    setMenuOpen(false)
  }

  /**
   * Removes an invitee chip.
   * @param userId - Profile id.
   * @returns Nothing.
   */
  function removeInvitee(userId: string): void {
    onChange(selectedUserIds.filter((id) => id !== userId))
  }

  const showNoResults =
    menuOpen &&
    Boolean(normalizedQuery) &&
    !remoteLoading &&
    dropdownProfiles.length === 0
  const showTypeHint =
    menuOpen &&
    remoteSearch &&
    !normalizedQuery &&
    !remoteLoading &&
    dropdownProfiles.length === 0
  const showDropdownBody =
    menuPresence.mounted &&
    (remoteLoading ||
      dropdownProfiles.length > 0 ||
      showNoResults ||
      showTypeHint ||
      (!remoteSearch && candidates.length === 0))

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-semibold text-muted">{t('calendar.dialog.invitees')}</legend>
      {selectedProfiles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedProfiles.map((profile) => (
            <span
              key={profile.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand/10 py-0.5 pr-1 pl-2.5 text-[11px] font-semibold text-brand"
            >
              <span className="min-w-0 truncate">{profileLabel(profile)}</span>
              <button
                type="button"
                className="grid size-5 place-items-center rounded-full text-brand transition hover:bg-brand/15 disabled:opacity-50"
                disabled={disabled}
                aria-label={t('calendar.dialog.inviteesRemove', {
                  name: profileLabel(profile),
                })}
                onClick={() => removeInvitee(profile.id)}
              >
                <CloseIcon className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div ref={rootRef} className="relative">
        <div
          ref={triggerRef}
          className="flex items-center gap-1 rounded-xl border border-ink/10 bg-canvas px-2 focus-within:border-brand"
        >
          <input
            type="search"
            value={query}
            disabled={disabled}
            placeholder={t('calendar.dialog.inviteesSearch')}
            aria-label={t('calendar.dialog.inviteesSearch')}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            aria-controls={menuPresence.mounted ? listboxId : undefined}
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-medium text-ink outline-none disabled:opacity-60"
            onChange={(event) => {
              setQuery(event.target.value)
              setMenuOpen(true)
            }}
            onFocus={() => setMenuOpen(true)}
          />
          <button
            type="button"
            disabled={disabled}
            className="grid size-7 place-items-center rounded-lg text-muted transition hover:bg-ink/5 disabled:opacity-50"
            aria-label={t('calendar.dialog.invitees')}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ChevronDownIcon
              className={[
                'size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                menuOpen ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden
            />
          </button>
        </div>
      </div>
      {showDropdownBody
        ? createPortal(
            <ul
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={t('calendar.dialog.invitees')}
              className={[
                'fixed z-[140] max-h-44 origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900',
                menuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in',
              ].join(' ')}
              style={{
                left: menuPos.left,
                width: menuPos.width,
                top: menuPos.top,
              }}
            >
              {remoteLoading ? (
                <li className="px-3 py-2 text-xs font-medium text-muted">{t('status.loading')}</li>
              ) : null}
              {showTypeHint ? (
                <li className="px-3 py-2 text-xs font-medium text-muted">
                  {t('calendar.dialog.inviteesSearchHint')}
                </li>
              ) : null}
              {showNoResults ? (
                <li className="px-3 py-2 text-xs font-medium text-muted">
                  {t('calendar.dialog.inviteesNoResults')}
                </li>
              ) : null}
              {!remoteSearch && candidates.length === 0 && !normalizedQuery ? (
                <li className="px-3 py-2 text-xs font-medium text-muted">
                  {t('calendar.dialog.inviteesEmpty')}
                </li>
              ) : null}
              {dropdownProfiles.map((profile) => (
                <li key={profile.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-ink/5"
                    onClick={() => addInvitee(profile.id)}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="min-w-0 truncate text-xs font-semibold text-ink">
                        {profileName(profile)}
                      </span>
                      {profile.employee_id ? (
                        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
                          {profile.employee_id}
                        </span>
                      ) : null}
                    </span>
                    {profile.email ? (
                      <span className="truncate text-[11px] font-medium text-muted">
                        {profile.email}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </fieldset>
  )
}
