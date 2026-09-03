import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  CheckIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  addUserToGroupByUserIdForGroup,
  addUserToGroupForGroup,
  consumeStuckInvitations,
  fetchGroupById,
  fetchGroupMembersForAdmin,
  getLastAddWasInvitation,
  getPendingMemberInvitationsForGroup,
  removeGroupInvitation,
  removeUserFromGroupForGroup,
  searchProfilesForAdmin,
  updateGroupInfoForGroup,
  type GroupInvitationRecord,
} from '@/services/group-management-api'
import type { GroupMemberRecord, GroupRecord, ProfileSnippet } from '@/services/groups-api'

/** One member row with optional group-admin flag. */
type DetailMember = GroupMemberRecord & { isGroupAdmin?: boolean }

/**
 * Sort group members so group admins appear first (stable within each group).
 * @param members - Roster rows.
 * @returns New array with admins first.
 */
function sortMembersAdminsFirst(members: DetailMember[]): DetailMember[] {
  return [...members].sort((a, b) => {
    const aAdmin = a.isGroupAdmin ? 0 : 1
    const bAdmin = b.isGroupAdmin ? 0 : 1
    if (aAdmin !== bAdmin) {
      return aAdmin - bAdmin
    }
    const aLabel = (a.user?.email || a.user?.display_name || a.userId).toLowerCase()
    const bLabel = (b.user?.email || b.user?.display_name || b.userId).toLowerCase()
    return aLabel.localeCompare(bLabel)
  })
}

/**
 * Best-effort display label for a searched/selected profile.
 * @param profile - Profile snippet from search or roster.
 * @returns Display name, falling back to email, then an em dash.
 */
function profileLabel(profile: ProfileSnippet): string {
  return profile.display_name || profile.full_name || profile.email || '—'
}

interface ProfileSearchFieldProps {
  query: string
  onQueryChange: (value: string) => void
  results: ProfileSnippet[]
  isSearching: boolean
  placeholder: string
  emptyHint: string
  noResultsLabel: string
  pickLabel: string
  disabled?: boolean
  onPick: (profile: ProfileSnippet) => void
}

/**
 * Debounced-search input with an animated results dropdown for add-member flows.
 * @param props - Search state, callbacks, and i18n strings.
 * @returns Search field with dropdown.
 */
function ProfileSearchField({
  query,
  onQueryChange,
  results,
  isSearching,
  placeholder,
  emptyHint,
  noResultsLabel,
  pickLabel,
  disabled,
  onPick,
}: ProfileSearchFieldProps) {
  const open = query.trim().length > 0
  const presence = useDialogPresence(open, 160)

  return (
    <div className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 py-2.5 pr-4 pl-10 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {!open ? <p className="mt-1.5 text-xs text-muted">{emptyHint}</p> : null}
      {presence.mounted ? (
        <ul
          className={`absolute z-30 mt-1.5 max-h-60 w-full overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
            presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
        >
          {isSearching ? (
            <li className="px-3 py-3 text-center text-sm text-muted">…</li>
          ) : results.length > 0 ? (
            results.map((profile) => (
              <li key={profile.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand">{profileLabel(profile)}</p>
                  {profile.email ? (
                    <p className="truncate text-xs text-muted">{profile.email}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-brand px-3 py-1 text-xs font-bold text-brand-fg"
                  onClick={() => onPick(profile)}
                >
                  <CheckIcon className="size-3.5" />
                  {pickLabel}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-center text-sm text-muted">{noResultsLabel}</li>
          )}
        </ul>
      ) : null}
    </div>
  )
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
 * Centered, dialog-presence-animated confirmation overlay for destructive actions.
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

interface GroupAdminSectionProps {
  groupId: string
  onRefresh: () => Promise<void>
}

/**
 * Group admin workspace: manage own group's info, members, and invitations.
 * Loads its own data (Vue GroupAdminView parity). Website module/write ACL is
 * edited in geocrm-web; desktop ACL uses Desktop Writes.
 * @param props - Current group id and parent refresh callback.
 * @returns Group admin settings section.
 */
export function GroupAdminSection({ groupId, onRefresh }: GroupAdminSectionProps) {
  const { t } = useTranslation()

  const [group, setGroup] = useState<GroupRecord | null>(null)
  const [members, setMembers] = useState<DetailMember[]>([])
  const [invitations, setInvitations] = useState<GroupInvitationRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadSeqRef = useRef(0)

  const [isEditingInfo, setIsEditingInfo] = useState(false)
  const groupInfoModalPresence = useDialogPresence(isEditingInfo, 200)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [groupDescDraft, setGroupDescDraft] = useState('')
  const [isSavingInfo, setIsSavingInfo] = useState(false)
  const [saveInfoError, setSaveInfoError] = useState<string | null>(null)
  const [saveInfoSuccess, setSaveInfoSuccess] = useState(false)

  const [showAddMemberForm, setShowAddMemberForm] = useState(false)
  const addMemberModalPresence = useDialogPresence(showAddMemberForm, 200)
  const [memberEmail, setMemberEmail] = useState('')
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<ProfileSnippet[]>([])
  const [isSearchingMember, setIsSearchingMember] = useState(false)
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null)
  const [addMemberError, setAddMemberError] = useState<string | null>(null)
  const [addMemberSuccess, setAddMemberSuccess] = useState(false)

  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null)
  const [isRemovingMember, setIsRemovingMember] = useState(false)

  const [revokeInvitationId, setRevokeInvitationId] = useState<string | null>(null)
  const [isRevokingInvitation, setIsRevokingInvitation] = useState(false)

  const memberIds = new Set(members.map((member) => member.userId))

  /**
   * Reload group info, members, and invitations.
   * @returns Nothing.
   */
  async function loadGroupData(): Promise<void> {
    const seq = loadSeqRef.current + 1
    loadSeqRef.current = seq
    setIsLoading(true)
    try {
      await consumeStuckInvitations(groupId)
      const loadedGroup = await fetchGroupById(groupId)
      if (seq !== loadSeqRef.current) {
        return
      }
      setGroup(loadedGroup)
      if (loadedGroup && !isEditingInfo) {
        setGroupNameDraft(loadedGroup.name)
        setGroupDescDraft(loadedGroup.description ?? '')
      }
      const [loadedMembers, loadedInvitations] = await Promise.all([
        fetchGroupMembersForAdmin(groupId, loadedGroup?.groupAdminId ?? null),
        getPendingMemberInvitationsForGroup(groupId),
      ])
      if (seq !== loadSeqRef.current) {
        return
      }
      setMembers(sortMembersAdminsFirst(loadedMembers))
      setInvitations(loadedInvitations)
      await onRefresh()
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadGroupData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  useEffect(() => {
    const query = memberSearchQuery.trim()
    if (!query) {
      setMemberSearchResults([])
      setIsSearchingMember(false)
      return
    }
    setIsSearchingMember(true)
    const timer = window.setTimeout(() => {
      void searchProfilesForAdmin(query).then((results) => {
        setMemberSearchResults(results.filter((profile) => !memberIds.has(profile.id)))
        setIsSearchingMember(false)
      })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSearchQuery, members])

  /**
   * Opens the group-info editor modal with current drafts.
   * @returns Nothing.
   */
  function openGroupInfoModal(): void {
    if (group) {
      setGroupNameDraft(group.name)
      setGroupDescDraft(group.description ?? '')
    }
    setSaveInfoError(null)
    setIsEditingInfo(true)
  }

  /**
   * Closes the group-info editor modal and restores drafts from the loaded group.
   * @returns Nothing.
   */
  function closeGroupInfoModal(): void {
    setIsEditingInfo(false)
    setSaveInfoError(null)
    if (group) {
      setGroupNameDraft(group.name)
      setGroupDescDraft(group.description ?? '')
    }
  }

  /**
   * Saves the edited group name/description.
   * @returns Nothing.
   */
  async function handleSaveGroupInfo(): Promise<void> {
    if (!groupNameDraft.trim()) {
      setSaveInfoError(
        t('settings.group.admin.groupInfo.nameRequired', {
          defaultValue: 'Group name is required',
        }),
      )
      return
    }
    setIsSavingInfo(true)
    setSaveInfoError(null)
    const ok = await updateGroupInfoForGroup(
      groupId,
      groupNameDraft.trim(),
      groupDescDraft.trim() || undefined,
    )
    if (ok) {
      setSaveInfoSuccess(true)
      setIsEditingInfo(false)
      await loadGroupData()
      window.setTimeout(() => setSaveInfoSuccess(false), 3000)
    } else {
      setSaveInfoError(
        t('settings.group.admin.groupInfo.saveError', {
          defaultValue: 'Failed to update group information, please try again',
        }),
      )
    }
    setIsSavingInfo(false)
  }

  /**
   * Opens the add-member dialog with a clean form.
   * @returns Nothing.
   */
  function openAddMemberModal(): void {
    setShowAddMemberForm(true)
    setAddMemberError(null)
    setAddMemberSuccess(false)
    setMemberEmail('')
    setMemberSearchQuery('')
    setMemberSearchResults([])
  }

  /**
   * Closes the add-member dialog and clears form state.
   * @returns Nothing.
   */
  function closeAddMemberModal(): void {
    setShowAddMemberForm(false)
    setAddMemberError(null)
    setAddMemberSuccess(false)
    setMemberEmail('')
    setMemberSearchQuery('')
    setMemberSearchResults([])
  }

  /**
   * Adds a member to the group by picked profile id.
   * @param userId - Target auth user id.
   * @returns Nothing.
   */
  async function handleAddMemberById(userId: string): Promise<void> {
    setAddingMemberId(userId)
    setAddMemberError(null)
    setAddMemberSuccess(false)
    const ok = await addUserToGroupByUserIdForGroup(groupId, userId)
    if (ok) {
      setAddMemberSuccess(true)
      setMemberSearchResults((results) => results.filter((profile) => profile.id !== userId))
      await loadGroupData()
      window.setTimeout(() => setAddMemberSuccess(false), 3000)
    } else {
      setAddMemberError(
        t('settings.group.admin.addMember.addError', { defaultValue: 'Failed to add member, please try again' }),
      )
    }
    setAddingMemberId(null)
  }

  /**
   * Adds a member to the group by typed email (invite if unregistered).
   * @returns Nothing.
   */
  async function handleAddMemberByEmail(): Promise<void> {
    if (!memberEmail.trim()) {
      setAddMemberError(
        t('settings.group.admin.addMember.emailPlaceholder', { defaultValue: 'Enter email address' }),
      )
      return
    }
    setAddingMemberId('__email__')
    setAddMemberError(null)
    setAddMemberSuccess(false)
    const ok = await addUserToGroupForGroup(groupId, memberEmail.trim())
    if (ok) {
      setAddMemberSuccess(true)
      setMemberEmail('')
      await loadGroupData()
      window.setTimeout(() => setAddMemberSuccess(false), 3000)
    } else {
      setAddMemberError(
        t('settings.group.admin.addMember.addError', { defaultValue: 'Failed to add member, please try again' }),
      )
    }
    setAddingMemberId(null)
  }

  /**
   * Confirms and removes a member from the group.
   * @returns Nothing.
   */
  async function handleRemoveMember(): Promise<void> {
    if (!removeMemberId) {
      return
    }
    setIsRemovingMember(true)
    const ok = await removeUserFromGroupForGroup(groupId, removeMemberId)
    setIsRemovingMember(false)
    setRemoveMemberId(null)
    if (ok) {
      await loadGroupData()
    }
  }

  /**
   * Confirms and revokes a pending member invitation.
   * @returns Nothing.
   */
  async function handleRevokeInvitation(): Promise<void> {
    if (!revokeInvitationId) {
      return
    }
    setIsRevokingInvitation(true)
    const ok = await removeGroupInvitation(revokeInvitationId)
    setIsRevokingInvitation(false)
    setRevokeInvitationId(null)
    if (ok) {
      await loadGroupData()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        {isLoading && !group ? (
          <p className="min-w-0 flex-1 text-sm text-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-brand">
              {group?.name || t('settings.sections.groupAdmin')}
            </p>
            <button
              type="button"
              title={t('settings.group.admin.addMember.title', { defaultValue: 'Add Member' })}
              aria-label={t('settings.group.admin.addMember.title', { defaultValue: 'Add Member' })}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg transition hover:opacity-90"
              onClick={openAddMemberModal}
            >
              <PlusIcon className="size-4" />
            </button>
          </>
        )}
      </div>

      {isLoading && !group ? null : (
        <>
          <div className="space-y-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">
                {t('settings.group.admin.groupInfo.description', { defaultValue: 'Group Description' })}
              </p>
              <button type="button" className="text-xs font-bold text-brand" onClick={openGroupInfoModal}>
                {t('settings.profile.edit')}
              </button>
            </div>
            <p className="text-sm text-muted">{group?.description || '—'}</p>
            {saveInfoSuccess ? (
              <p className="text-sm font-semibold text-brand">
                {t('settings.group.admin.groupInfo.saveSuccess', {
                  defaultValue: 'Group information successfully updated',
                })}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted">
              {t('settings.group.admin.members.title', { defaultValue: 'Group Members' })}
            </p>

            {members.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                {t('settings.group.admin.members.noMembers', { defaultValue: 'No members' })}
              </p>
            ) : (
              <ul className="space-y-2">
                {members.map((member) => {
                  const primaryLabel =
                    member.user?.email ||
                    member.user?.display_name ||
                    member.user?.full_name ||
                    member.userId
                  const secondaryLabel =
                    member.user?.display_name && member.user?.email && member.user.display_name !== member.user.email
                      ? member.user.display_name
                      : member.user?.full_name &&
                          member.user?.email &&
                          member.user.full_name !== member.user.email
                        ? member.user.full_name
                        : null

                  return (
                    <li
                      key={member.id}
                      className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-brand">{primaryLabel}</p>
                            {member.isGroupAdmin ? (
                              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                                {t('settings.group.admin.members.adminBadge')}
                              </span>
                            ) : null}
                          </div>
                          {secondaryLabel ? (
                            <p className="mt-0.5 truncate text-xs text-muted">{secondaryLabel}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {!member.isGroupAdmin ? (
                              <button
                                type="button"
                                className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-500/10"
                                title={t('settings.group.admin.members.remove', { defaultValue: 'Remove' })}
                                onClick={() => setRemoveMemberId(member.userId)}
                              >
                                <TrashIcon className="size-4" />
                              </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {invitations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted">
                {t('settings.group.admin.pendingInvitations.title', { defaultValue: 'Pending Invitations' })}
              </p>
              <ul className="space-y-2">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-brand">{invitation.email}</p>
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          {t('settings.group.admin.pendingInvitations.invitedBadge', { defaultValue: 'Invited' })}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      title={t('settings.group.admin.pendingInvitations.revoke', { defaultValue: 'Revoke Invitation' })}
                      className="shrink-0 rounded-xl p-2 text-rose-500 transition hover:bg-rose-500/10"
                      onClick={() => setRevokeInvitationId(invitation.id)}
                    >
                      <CloseIcon className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      <InlineConfirmDialog
        open={removeMemberId !== null}
        title={t('settings.group.admin.members.removeConfirmTitle', { defaultValue: 'Confirm Remove Member' })}
        message={t('settings.group.admin.members.removeConfirmMessage', {
          defaultValue:
            'Are you sure you want to remove this member? After removal, the member will no longer be able to view group data.',
        })}
        confirmLabel={t('settings.group.admin.members.removeConfirmButton', { defaultValue: 'Confirm Remove' })}
        cancelLabel={t('settings.group.admin.members.removeCancelButton', { defaultValue: 'Cancel' })}
        isBusy={isRemovingMember}
        onConfirm={() => void handleRemoveMember()}
        onCancel={() => setRemoveMemberId(null)}
      />

      <InlineConfirmDialog
        open={revokeInvitationId !== null}
        title={t('settings.group.admin.pendingInvitations.revokeConfirmTitle', { defaultValue: 'Revoke Invitation' })}
        message={t('settings.group.admin.pendingInvitations.revokeConfirmMessage', {
          defaultValue:
            'After revoking, signing in with this email will no longer auto-join this group. Revoke this invitation?',
        })}
        confirmLabel={t('settings.group.admin.pendingInvitations.revokeConfirmButton', {
          defaultValue: 'Confirm Revoke',
        })}
        cancelLabel={t('settings.group.admin.pendingInvitations.revokeCancelButton', { defaultValue: 'Cancel' })}
        isBusy={isRevokingInvitation}
        onConfirm={() => void handleRevokeInvitation()}
        onCancel={() => setRevokeInvitationId(null)}
      />

      {addMemberModalPresence.mounted ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
            addMemberModalPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={closeAddMemberModal}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-bold text-brand">
              {t('settings.group.admin.addMember.title', { defaultValue: 'Add Member' })}
            </p>
            <ProfileSearchField
              query={memberSearchQuery}
              onQueryChange={setMemberSearchQuery}
              results={memberSearchResults}
              isSearching={isSearchingMember}
              placeholder={t('settings.group.admin.addMember.searchPlaceholder', {
                defaultValue: 'Search by email or name',
              })}
              emptyHint={t('settings.group.admin.addMember.searchEmpty', {
                defaultValue: 'Type to search, or enter email below to invite users who have not registered',
              })}
              noResultsLabel={t('settings.group.admin.addMember.searchNoResults', {
                defaultValue: 'No matching users',
              })}
              pickLabel={t('settings.group.admin.addMember.add', { defaultValue: 'Add' })}
              disabled={addingMemberId !== null}
              onPick={(profile) => void handleAddMemberById(profile.id)}
            />
            <input
              type="email"
              value={memberEmail}
              disabled={addingMemberId !== null}
              placeholder={t('settings.group.admin.addMember.emailPlaceholder', {
                defaultValue: 'Enter email address',
              })}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
              onChange={(event) => setMemberEmail(event.target.value)}
            />
            {addMemberSuccess ? (
              <p className="text-sm font-semibold text-brand">
                {getLastAddWasInvitation()
                  ? t('settings.group.admin.addMember.invitationSent', {
                      defaultValue:
                        'Invitation sent. They will join the group when they register with this email.',
                    })
                  : t('settings.group.admin.addMember.addSuccess', {
                      defaultValue: 'Member successfully added',
                    })}
              </p>
            ) : null}
            {addMemberError ? <p className="text-sm font-semibold text-rose-500">{addMemberError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={addingMemberId !== null}
                className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void handleAddMemberByEmail()}
              >
                {addingMemberId === '__email__'
                  ? t('settings.group.admin.addMember.adding', { defaultValue: 'Adding...' })
                  : t('settings.group.admin.addMember.add', { defaultValue: 'Add' })}
              </button>
              <button
                type="button"
                disabled={addingMemberId !== null}
                className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={closeAddMemberModal}
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {groupInfoModalPresence.mounted ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
            groupInfoModalPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={closeGroupInfoModal}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-bold text-brand">
              {t('settings.group.admin.groupInfo.title', { defaultValue: 'Group Information' })}
            </p>
            <input
              type="text"
              value={groupNameDraft}
              disabled={isSavingInfo}
              placeholder={t('settings.group.admin.groupInfo.groupNamePlaceholder', {
                defaultValue: 'Enter group name',
              })}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
              onChange={(event) => setGroupNameDraft(event.target.value)}
            />
            <textarea
              value={groupDescDraft}
              rows={3}
              disabled={isSavingInfo}
              placeholder={t('settings.group.admin.groupInfo.descriptionPlaceholder', {
                defaultValue: 'Enter group description',
              })}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
              onChange={(event) => setGroupDescDraft(event.target.value)}
            />
            {saveInfoError ? <p className="text-sm font-semibold text-rose-500">{saveInfoError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSavingInfo}
                className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void handleSaveGroupInfo()}
              >
                {isSavingInfo
                  ? t('settings.group.admin.groupInfo.saving', { defaultValue: 'Saving...' })
                  : t('settings.group.admin.groupInfo.save', { defaultValue: 'Save Changes' })}
              </button>
              <button
                type="button"
                disabled={isSavingInfo}
                className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={closeGroupInfoModal}
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}