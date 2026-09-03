import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  CheckIcon,
  ChevronDownIcon,
  CrownIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  DESKTOP_MODULE_KEYS,
  DESKTOP_MODULE_LABEL_KEYS,
  type DesktopModuleKey,
} from '@/constants/desktop-modules'
import { searchProfilesForAdmin } from '@/services/group-management-api'
import {
  appointGlobalLeader,
  listGlobalLeaders,
  revokeGlobalLeader,
  type GlobalLeaderEntry,
} from '@/services/global-leaders-api'
import {
  fetchGlobalLeaderDesktopModuleAccessBatch,
  setGlobalLeaderDesktopModuleAccess,
} from '@/services/global-leader-desktop-access-api'
import type { ProfileSnippet } from '@/services/groups-api'

/**
 * Best-effort display label for a searched/appointed profile.
 * @param profile - Profile snippet from search or roster.
 * @returns Display name, falling back to email, then an em dash.
 */
function profileLabel(profile: ProfileSnippet | null): string {
  if (!profile) {
    return '—'
  }
  return profile.display_name || profile.full_name || profile.email || '—'
}

interface InlineConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Centered, dialog-presence-animated confirmation overlay for revoking a leader.
 * @param props - Open state, copy, and handlers.
 * @returns Confirm overlay, or null while fully closed.
 */
function InlineConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isBusy,
  onConfirm,
  onCancel,
}: InlineConfirmDialogProps) {
  const presence = useDialogPresence(open, 200)
  if (!presence.mounted) {
    return null
  }
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-bold text-brand">{title}</p>
        <p className="mt-1.5 text-sm text-muted">{message}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={isBusy}
            className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            disabled={isBusy}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * System-admin Global Leaders: appoint an existing user as a cross-group
 * reader, list appointed leaders with revoke, and edit each leader's
 * desktop Function entry keys via an expandable brand-chip grid.
 * @returns Global Leaders settings section.
 */
export function GlobalLeadersSection() {
  const { t } = useTranslation()

  const [leaders, setLeaders] = useState<GlobalLeaderEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [showAppointModal, setShowAppointModal] = useState(false)
  const [appointQuery, setAppointQuery] = useState('')
  const [appointResults, setAppointResults] = useState<ProfileSnippet[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [appointingUserId, setAppointingUserId] = useState<string | null>(null)
  const [appointError, setAppointError] = useState<string | null>(null)
  const appointModalPresence = useDialogPresence(showAppointModal, 200)
  const appointResultsOpen = appointQuery.trim().length > 0
  const appointResultsPresence = useDialogPresence(showAppointModal && appointResultsOpen, 160)

  const [revokeUserId, setRevokeUserId] = useState<string | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [desktopKeysByUser, setDesktopKeysByUser] = useState<Map<string, Set<DesktopModuleKey>>>(
    () => new Map(),
  )
  const [pendingDesktopKeys, setPendingDesktopKeys] = useState<Set<DesktopModuleKey>>(new Set())
  const [isSavingDesktop, setIsSavingDesktop] = useState(false)
  const [desktopSaveError, setDesktopSaveError] = useState<string | null>(null)
  const [desktopSaveSuccess, setDesktopSaveSuccess] = useState(false)

  const existingLeaderIds = new Set(leaders.map((entry) => entry.userId))

  /**
   * Reloads the appointed global leader roster and desktop entry keys.
   * @returns Nothing.
   */
  async function loadLeaders(): Promise<void> {
    setIsLoading(true)
    try {
      const rows = await listGlobalLeaders()
      setLeaders(rows)
      const desktopMap = await fetchGlobalLeaderDesktopModuleAccessBatch(
        rows.map((row) => row.userId),
      )
      setDesktopKeysByUser(desktopMap)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadLeaders()
  }, [])

  // Debounced profile search for the appoint-leader dialog.
  useEffect(() => {
    if (!showAppointModal) {
      return
    }
    const query = appointQuery.trim()
    if (!query) {
      setAppointResults([])
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    const timer = window.setTimeout(() => {
      void searchProfilesForAdmin(query).then((results) => {
        setAppointResults(results.filter((profile) => !existingLeaderIds.has(profile.id)))
        setIsSearching(false)
      })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointQuery, showAppointModal])

  /**
   * Opens the appoint-leader dialog with a clean search form.
   * @returns Nothing.
   */
  function openAppointModal(): void {
    setAppointQuery('')
    setAppointResults([])
    setAppointError(null)
    setShowAppointModal(true)
  }

  /**
   * Closes the appoint-leader dialog and clears draft search state.
   * @returns Nothing.
   */
  function closeAppointModal(): void {
    setShowAppointModal(false)
    setAppointQuery('')
    setAppointResults([])
    setAppointError(null)
  }

  /**
   * Appoints a searched profile as a global leader.
   * @param profile - Picked profile snippet.
   * @returns Nothing.
   */
  async function handleAppoint(profile: ProfileSnippet): Promise<void> {
    setAppointingUserId(profile.id)
    setAppointError(null)
    const ok = await appointGlobalLeader(profile.id)
    if (ok) {
      closeAppointModal()
      await loadLeaders()
    } else {
      setAppointError(t('settings.globalLeaders.addLeader.addError'))
    }
    setAppointingUserId(null)
  }

  /**
   * Confirms and executes revoking a global leader.
   * @returns Nothing.
   */
  async function handleRevoke(): Promise<void> {
    if (!revokeUserId) {
      return
    }
    setIsRevoking(true)
    const ok = await revokeGlobalLeader(revokeUserId)
    setIsRevoking(false)
    setRevokeUserId(null)
    if (ok) {
      if (expandedUserId === revokeUserId) {
        setExpandedUserId(null)
      }
      await loadLeaders()
    }
  }

  /**
   * Expands (or collapses) the module whitelist editor for a leader row.
   * @param entry - Target leader entry.
   * @returns Nothing.
   */
  function toggleExpanded(entry: GlobalLeaderEntry): void {
    if (expandedUserId === entry.userId) {
      setExpandedUserId(null)
      return
    }
    setExpandedUserId(entry.userId)
    setPendingDesktopKeys(new Set(desktopKeysByUser.get(entry.userId) ?? []))
    setDesktopSaveError(null)
    setDesktopSaveSuccess(false)
  }

  /**
   * Toggles a single desktop entry key in the pending selection.
   * @param key - Desktop module key.
   */
  function toggleDesktopKey(key: DesktopModuleKey): void {
    setPendingDesktopKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    setDesktopSaveSuccess(false)
  }

  /**
   * Persists the pending desktop entry whitelist for the expanded leader.
   * @returns Nothing.
   */
  async function handleSaveDesktopModules(): Promise<void> {
    if (!expandedUserId) {
      return
    }
    setIsSavingDesktop(true)
    setDesktopSaveError(null)
    setDesktopSaveSuccess(false)
    const ok = await setGlobalLeaderDesktopModuleAccess(
      expandedUserId,
      Array.from(pendingDesktopKeys),
    )
    if (ok) {
      setDesktopSaveSuccess(true)
      setDesktopKeysByUser((prev) => {
        const next = new Map(prev)
        next.set(expandedUserId, new Set(pendingDesktopKeys))
        return next
      })
      window.setTimeout(() => setDesktopSaveSuccess(false), 3000)
    } else {
      setDesktopSaveError(
        t('settings.globalLeaders.desktopAccess.saveError', {
          defaultValue: 'Failed to save desktop access',
        }),
      )
    }
    setIsSavingDesktop(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand">
          {t('settings.globalLeaders.title', { defaultValue: 'Global Leaders' })}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg"
          onClick={openAppointModal}
        >
          <PlusIcon className="size-4" />
          {t('settings.globalLeaders.addLeader.title')}
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted">
          {t('settings.globalLeaders.list.title', { defaultValue: 'Appointed Leaders' })}
        </p>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
        ) : leaders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {t('settings.globalLeaders.list.empty', { defaultValue: 'No global leaders appointed yet' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {leaders.map((entry) => {
              const isExpanded = expandedUserId === entry.userId
              return (
                <li key={entry.userId} className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 dark:border-white/10 dark:bg-white/5">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex items-center gap-3 p-4"
                    onClick={() => toggleExpanded(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        toggleExpanded(entry)
                      }
                    }}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
                      <CrownIcon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-brand">{profileLabel(entry.profile)}</p>
                      <p className="truncate text-xs text-muted">{entry.profile?.email ?? entry.userId}</p>
                      <p className="text-xs text-muted">
                        {t('settings.globalLeaders.list.moduleCount', {
                          count: desktopKeysByUser.get(entry.userId)?.size ?? 0,
                          defaultValue: `${desktopKeysByUser.get(entry.userId)?.size ?? 0} desktop key(s)`,
                        })}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl p-2 text-rose-500 transition hover:bg-rose-500/10"
                      onClick={(event) => {
                        event.stopPropagation()
                        setRevokeUserId(entry.userId)
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                    <ChevronDownIcon
                      className={`size-4 shrink-0 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>

                  {isExpanded ? (
                    <div className="space-y-3 border-t border-zinc-950/10 p-4 dark:border-white/10">
                        <p className="text-xs font-semibold text-muted">
                          {t('settings.globalLeaders.desktopAccess.title', {
                            defaultValue: 'Desktop Functions',
                          })}
                        </p>
                        <p className="text-xs text-muted">
                          {t('settings.globalLeaders.desktopAccess.description', {
                            defaultValue:
                              'Electron Home Function and map-layer entry keys for this leader (manual; not synced from website modules).',
                          })}
                        </p>
                        <button
                          type="button"
                          className="text-xs font-semibold text-brand underline decoration-brand/40 underline-offset-2"
                          onClick={() =>
                            setPendingDesktopKeys((prev) =>
                              DESKTOP_MODULE_KEYS.every((key) => prev.has(key))
                                ? new Set()
                                : new Set(DESKTOP_MODULE_KEYS),
                            )
                          }
                        >
                          {t('settings.globalLeaders.desktopAccess.selectAll', {
                            defaultValue: 'Select all desktop keys',
                          })}
                        </button>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {DESKTOP_MODULE_KEYS.map((key) => {
                            const selected = pendingDesktopKeys.has(key)
                            return (
                              <button
                                type="button"
                                key={key}
                                onClick={() => toggleDesktopKey(key)}
                                className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${
                                  selected
                                    ? 'border-brand/60 bg-brand text-brand-fg'
                                    : 'border-zinc-950/10 bg-white/60 text-muted hover:border-brand/40 dark:border-white/10 dark:bg-zinc-950/40'
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
                        {desktopSaveSuccess ? (
                          <p className="text-sm font-semibold text-brand">
                            {t('settings.globalLeaders.desktopAccess.saveSuccess', {
                              defaultValue: 'Desktop access saved',
                            })}
                          </p>
                        ) : null}
                        {desktopSaveError ? (
                          <p className="text-sm font-semibold text-rose-500">{desktopSaveError}</p>
                        ) : null}
                        <button
                          type="button"
                          disabled={isSavingDesktop}
                          className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                          onClick={() => void handleSaveDesktopModules()}
                        >
                          {isSavingDesktop
                            ? t('settings.globalLeaders.desktopAccess.saving', {
                                defaultValue: 'Saving…',
                              })
                            : t('settings.globalLeaders.desktopAccess.save', {
                                defaultValue: 'Save desktop access',
                              })}
                        </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {appointModalPresence.mounted ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
            appointModalPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={closeAppointModal}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-bold text-brand">
              {t('settings.globalLeaders.addLeader.title')}
            </p>
            <div className="relative">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  autoComplete="off"
                  disabled={appointingUserId !== null}
                  value={appointQuery}
                  placeholder={t('settings.globalLeaders.addLeader.searchPlaceholder', {
                    defaultValue: 'Search registered users by email or name',
                  })}
                  className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 py-2.5 pr-4 pl-10 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
                  onChange={(event) => setAppointQuery(event.target.value)}
                />
              </div>
              {!appointResultsOpen ? (
                <p className="mt-1.5 text-xs text-muted">
                  {t('settings.globalLeaders.addLeader.searchEmpty', {
                    defaultValue: 'Type to search registered users to appoint as global leader',
                  })}
                </p>
              ) : null}
              {appointResultsPresence.mounted ? (
                <ul
                  className={`absolute z-30 mt-1.5 max-h-60 w-full overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                    appointResultsPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
                  }`}
                >
                  {isSearching ? (
                    <li className="px-3 py-3 text-center text-sm text-muted">…</li>
                  ) : appointResults.length > 0 ? (
                    appointResults.map((profile) => (
                      <li key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-brand">{profileLabel(profile)}</p>
                          {profile.email ? (
                            <p className="truncate text-xs text-muted">{profile.email}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={appointingUserId !== null}
                          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 py-1 text-xs font-bold text-brand-fg disabled:opacity-50"
                          onClick={() => void handleAppoint(profile)}
                        >
                          <PlusIcon className="size-3.5" />
                          {appointingUserId === profile.id
                            ? t('settings.globalLeaders.addLeader.adding')
                            : t('settings.globalLeaders.addLeader.add')}
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-3 text-center text-sm text-muted">
                      {t('settings.globalLeaders.addLeader.searchNoResults', {
                        defaultValue: 'No matching registered users',
                      })}
                    </li>
                  )}
                </ul>
              ) : null}
            </div>
            {appointError ? <p className="text-sm font-semibold text-rose-500">{appointError}</p> : null}
            <button
              type="button"
              disabled={appointingUserId !== null}
              className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
              onClick={closeAppointModal}
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <InlineConfirmDialog
        open={revokeUserId !== null}
        title={t('settings.globalLeaders.list.revokeConfirmTitle')}
        message={t('settings.globalLeaders.list.revokeConfirmMessage')}
        confirmLabel={t('settings.globalLeaders.list.revokeConfirmButton')}
        cancelLabel={t('settings.globalLeaders.list.revokeCancelButton')}
        isBusy={isRevoking}
        onConfirm={() => void handleRevoke()}
        onCancel={() => setRevokeUserId(null)}
      />
    </div>
  )
}
