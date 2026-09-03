import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  CrownIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import { searchProfilesForAdmin } from '@/services/group-management-api'
import {
  appointGlobalLeader,
  listGlobalLeaders,
  revokeGlobalLeader,
} from '@/services/global-leaders-api'
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
 * reader and list appointed leaders with revoke.
 * @returns Global Leaders settings section.
 */
export function GlobalLeadersSection() {
  const { t } = useTranslation()

  const [leaders, setLeaders] = useState<Awaited<ReturnType<typeof listGlobalLeaders>>>([])
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

  const existingLeaderIds = new Set(leaders.map((entry) => entry.userId))

  /**
   * Reloads the appointed global leader roster.
   * @returns Nothing.
   */
  async function loadLeaders(): Promise<void> {
    setIsLoading(true)
    try {
      setLeaders(await listGlobalLeaders())
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
      await loadLeaders()
    }
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
            {leaders.map((entry) => (
              <li
                key={entry.userId}
                className="flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
                  <CrownIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-brand">{profileLabel(entry.profile)}</p>
                  <p className="truncate text-xs text-muted">{entry.profile?.email ?? entry.userId}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-xl p-2 text-rose-500 transition hover:bg-rose-500/10"
                  onClick={() => setRevokeUserId(entry.userId)}
                >
                  <TrashIcon className="size-4" />
                </button>
              </li>
            ))}
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
