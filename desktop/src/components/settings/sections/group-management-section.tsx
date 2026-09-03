import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  ArrowLeftIcon,
  CheckIcon,
  CloseIcon,
  CrownIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
} from '@/icons/AllIcons'
import {
  addGroupAdmin,
  addUserToGroupByUserIdForGroup,
  addUserToGroupForGroup,
  appointGroupAdmin,
  assignNewGroupAdmin,
  consumeStuckInvitations,
  fetchGroupById,
  fetchGroupMembersForAdmin,
  getGroupAdmins,
  getLastAddWasInvitation,
  getPendingMemberInvitationsForGroup,
  getTempManagedGroups,
  removeGroupAdmin,
  removeGroupInvitation,
  removeUserFromGroupForGroup,
  searchProfilesForAdmin,
  updateGroupInfoForGroup,
  type GroupAdminEntry,
  type GroupInvitationRecord,
} from '@/services/group-management-api'
import type {
  GroupMemberRecord,
  GroupRecord,
  ProfileSnippet,
} from '@/services/groups-api'

/** Simple RFC-5322-ish email check used for manual (non-searched) input. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** One member row returned by the drill-down roster loader. */
type DetailMember = GroupMemberRecord & { isGroupAdmin?: boolean }

/** Which pane of the in-panel drill-down is showing. */
type ManagementView = 'list' | 'detail'

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
 * Debounced-search input with an animated results dropdown, shared by the
 * "add group admin", "assign admin", and "add member" flows.
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

interface SelectedProfilePillProps {
  profile: ProfileSnippet
  onClear: () => void
  disabled?: boolean
}

/**
 * Pinned "selected profile" pill shown once a search result has been picked,
 * replacing the manual email input.
 * @param props - Picked profile and clear handler.
 * @returns Pill element.
 */
function SelectedProfilePill({ profile, onClear, disabled }: SelectedProfilePillProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <CheckIcon className="size-4 shrink-0 text-brand" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand">{profileLabel(profile)}</p>
          {profile.email ? <p className="truncate text-xs text-brand/80">{profile.email}</p> : null}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        className="shrink-0 rounded-lg p-1 text-brand transition hover:bg-brand/20 disabled:opacity-50"
        onClick={onClear}
      >
        <CloseIcon className="size-4" />
      </button>
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

/**
 * System-admin Group Management: create group + admin, roster of admins with
 * revoke, temp-managed / pending-invitation assignment, and an in-panel
 * drill-down into a single group's members and invitations.
 * @returns Group Management settings section.
 */
export function GroupManagementSection() {
  const { t } = useTranslation()

  const [view, setView] = useState<ManagementView>('list')
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const detailPresence = useDialogPresence(view === 'detail', 320)

  // ── List data ────────────────────────────────────────────────────────────
  const [groupAdmins, setGroupAdmins] = useState<GroupAdminEntry[]>([])
  const [tempManagedGroups, setTempManagedGroups] = useState<GroupRecord[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)

  // ── Add group admin form ────────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDescription, setNewGroupDescription] = useState('')
  const [selectedAdminProfile, setSelectedAdminProfile] = useState<ProfileSnippet | null>(null)
  const [adminSearchQuery, setAdminSearchQuery] = useState('')
  const [adminSearchResults, setAdminSearchResults] = useState<ProfileSnippet[]>([])
  const [isSearchingAdmin, setIsSearchingAdmin] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const addModalPresence = useDialogPresence(showAddForm, 200)

  // ── Revoke group admin confirm ──────────────────────────────────────────
  const [revokeUserId, setRevokeUserId] = useState<string | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  // ── Assign new admin modal (temp-managed groups) ────────────────────────
  const [assignGroupId, setAssignGroupId] = useState<string | null>(null)
  const [assignEmail, setAssignEmail] = useState('')
  const [selectedAssignProfile, setSelectedAssignProfile] = useState<ProfileSnippet | null>(null)
  const [assignSearchQuery, setAssignSearchQuery] = useState('')
  const [assignSearchResults, setAssignSearchResults] = useState<ProfileSnippet[]>([])
  const [isSearchingAssign, setIsSearchingAssign] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignSuccessMessage, setAssignSuccessMessage] = useState<string | null>(null)
  const assignModalPresence = useDialogPresence(assignGroupId !== null, 200)

  // ── Detail (drill-down) data ─────────────────────────────────────────────
  const [detailGroup, setDetailGroup] = useState<GroupRecord | null>(null)
  const [detailMembers, setDetailMembers] = useState<DetailMember[]>([])
  const [detailInvitations, setDetailInvitations] = useState<GroupInvitationRecord[]>([])
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [loadingDetailGroupId, setLoadingDetailGroupId] = useState<string | null>(null)
  const detailLoadSeqRef = useRef(0)

  const [isEditingInfo, setIsEditingInfo] = useState(false)
  const groupInfoModalPresence = useDialogPresence(isEditingInfo, 200)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [groupDescDraft, setGroupDescDraft] = useState('')
  const [isSavingInfo, setIsSavingInfo] = useState(false)
  const [saveInfoError, setSaveInfoError] = useState<string | null>(null)
  const [saveInfoSuccess, setSaveInfoSuccess] = useState(false)

  const [showAddMemberForm, setShowAddMemberForm] = useState(false)
  const [memberEmail, setMemberEmail] = useState('')
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [memberSearchResults, setMemberSearchResults] = useState<ProfileSnippet[]>([])
  const [isSearchingMember, setIsSearchingMember] = useState(false)
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null)
  const [addMemberError, setAddMemberError] = useState<string | null>(null)
  const [addMemberSuccess, setAddMemberSuccess] = useState(false)
  const addMemberModalPresence = useDialogPresence(showAddMemberForm, 200)

  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null)
  const [isRemovingMember, setIsRemovingMember] = useState(false)

  const [revokeInvitationId, setRevokeInvitationId] = useState<string | null>(null)
  const [isRevokingInvitation, setIsRevokingInvitation] = useState(false)

  const [togglingAdminUserId, setTogglingAdminUserId] = useState<string | null>(null)
  const [toggleAdminError, setToggleAdminError] = useState<string | null>(null)

  const existingAdminIds = new Set(groupAdmins.map((entry) => entry.userId))
  const pendingInvitationGroups = tempManagedGroups.filter((group) => Boolean(group.pendingAdminEmail?.trim()))
  const unassignedTempGroups = tempManagedGroups.filter((group) => !group.pendingAdminEmail?.trim())
  const memberIds = new Set(detailMembers.map((member) => member.userId))

  /**
   * Reloads the roster of group admins and temp-managed groups.
   * @returns Nothing.
   */
  async function loadList(): Promise<void> {
    setIsLoadingList(true)
    try {
      const [admins, tempGroups] = await Promise.all([getGroupAdmins(), getTempManagedGroups()])
      setGroupAdmins(admins)
      setTempManagedGroups(tempGroups)
    } finally {
      setIsLoadingList(false)
    }
  }

  useEffect(() => {
    void loadList()
  }, [])

  // Debounced profile search for the "add group admin" form.
  useEffect(() => {
    const query = adminSearchQuery.trim()
    if (!query) {
      setAdminSearchResults([])
      setIsSearchingAdmin(false)
      return
    }
    setIsSearchingAdmin(true)
    const timer = window.setTimeout(() => {
      void searchProfilesForAdmin(query).then((results) => {
        setAdminSearchResults(results.filter((profile) => !existingAdminIds.has(profile.id)))
        setIsSearchingAdmin(false)
      })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSearchQuery])

  // Debounced profile search for the "assign new admin" modal.
  useEffect(() => {
    const query = assignSearchQuery.trim()
    if (!query) {
      setAssignSearchResults([])
      setIsSearchingAssign(false)
      return
    }
    setIsSearchingAssign(true)
    const timer = window.setTimeout(() => {
      void searchProfilesForAdmin(query).then((results) => {
        setAssignSearchResults(results.filter((profile) => !existingAdminIds.has(profile.id)))
        setIsSearchingAssign(false)
      })
    }, 300)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignSearchQuery])

  // Debounced profile search for "add member" inside the drill-down.
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
  }, [memberSearchQuery])

  /**
   * Resets every field of the "add group admin" form.
   * @returns Nothing.
   */
  function resetAddForm(): void {
    setNewAdminEmail('')
    setNewGroupName('')
    setNewGroupDescription('')
    setSelectedAdminProfile(null)
    setAdminSearchQuery('')
    setAdminSearchResults([])
    setAddError(null)
  }

  /**
   * Opens the add-group-admin dialog with a clean form.
   * @returns Nothing.
   */
  function openAddModal(): void {
    resetAddForm()
    setShowAddForm(true)
  }

  /**
   * Closes the add-group-admin dialog and clears form state.
   * @returns Nothing.
   */
  function closeAddModal(): void {
    setShowAddForm(false)
    resetAddForm()
  }

  /**
   * Submits the "create group + appoint admin" form.
   * @returns Nothing.
   */
  async function handleAddGroupAdmin(): Promise<void> {
    const email = selectedAdminProfile?.email ?? newAdminEmail.trim()
    if (!email || !newGroupName.trim()) {
      setAddError(
        t('settings.group.management.addGroupAdmin.emailRequired', {
          defaultValue: 'Please fill in email and group name',
        }),
      )
      return
    }
    setIsAdding(true)
    setAddError(null)
    const ok = await addGroupAdmin(email, newGroupName.trim(), newGroupDescription.trim() || undefined)
    if (ok) {
      resetAddForm()
      setShowAddForm(false)
      await loadList()
    } else {
      setAddError(
        t('settings.group.management.addGroupAdmin.addError', {
          defaultValue: 'Failed to add group administrator, please try again',
        }),
      )
    }
    setIsAdding(false)
  }

  /**
   * Confirms and executes revoking a group admin from the roster.
   * @returns Nothing.
   */
  async function handleRevokeGroupAdmin(): Promise<void> {
    if (!revokeUserId) {
      return
    }
    setIsRevoking(true)
    const ok = await removeGroupAdmin(revokeUserId)
    setIsRevoking(false)
    setRevokeUserId(null)
    if (ok) {
      await loadList()
    }
  }

  /**
   * Opens the assign-admin modal for a temp-managed group.
   * @param group - Target temp-managed group.
   * @param prefillEmail - Existing pending email to seed the form with.
   * @returns Nothing.
   */
  function openAssignModal(group: GroupRecord, prefillEmail?: string): void {
    setAssignGroupId(group.id)
    setAssignEmail(prefillEmail ?? '')
    setSelectedAssignProfile(null)
    setAssignSearchQuery('')
    setAssignSearchResults([])
    setAssignError(null)
    setAssignSuccessMessage(null)
  }

  /**
   * Closes and fully resets the assign-admin modal.
   * @returns Nothing.
   */
  function closeAssignModal(): void {
    setAssignGroupId(null)
    setAssignEmail('')
    setSelectedAssignProfile(null)
    setAssignSearchQuery('')
    setAssignSearchResults([])
    setAssignError(null)
    setAssignSuccessMessage(null)
  }

  /**
   * Assigns a new admin (existing user or pending invite) to a temp-managed group.
   * @returns Nothing.
   */
  async function handleAssignNewGroupAdmin(): Promise<void> {
    if (!assignGroupId) {
      return
    }
    const email = selectedAssignProfile?.email ?? assignEmail.trim()
    if (!email) {
      setAssignError(
        t('settings.group.management.addGroupAdmin.emailRequired', {
          defaultValue: 'Please enter an email address',
        }),
      )
      return
    }
    if (!EMAIL_REGEX.test(email)) {
      setAssignError(
        t('settings.group.management.addGroupAdmin.invalidEmail', {
          defaultValue: 'Please enter a valid email address',
        }),
      )
      return
    }
    setIsAssigning(true)
    setAssignError(null)
    setAssignSuccessMessage(null)
    const ok = await assignNewGroupAdmin(assignGroupId, email)
    if (ok) {
      await loadList()
      const refreshed = await getTempManagedGroups()
      const stillPending = refreshed.find((group) => group.id === assignGroupId)?.pendingAdminEmail?.trim()
      if (stillPending) {
        setAssignSuccessMessage(
          t('settings.group.management.tempManagedGroups.assignSuccessPending', {
            defaultValue:
              'Pending assignment created. The user will automatically become a group administrator when they register and log in.',
          }),
        )
        window.setTimeout(() => closeAssignModal(), 5000)
      } else {
        closeAssignModal()
      }
    } else {
      setAssignError(
        t('settings.group.management.tempManagedGroups.assignError', {
          defaultValue: 'Failed to assign administrator, please try again',
        }),
      )
    }
    setIsAssigning(false)
  }

  /**
   * Loads group detail first, then slides into the drill-down once data is ready.
   * @param groupId - Target group id.
   * @returns Nothing.
   */
  async function openDetail(groupId: string): Promise<void> {
    const seq = detailLoadSeqRef.current + 1
    detailLoadSeqRef.current = seq
    setLoadingDetailGroupId(groupId)
    setIsEditingInfo(false)
    setShowAddMemberForm(false)
    setToggleAdminError(null)

    await loadDetail(groupId)

    if (seq !== detailLoadSeqRef.current) {
      return
    }

    setActiveGroupId(groupId)
    setView('detail')
    setLoadingDetailGroupId(null)
  }

  /** Returns to the group admin list. */
  function closeDetail(): void {
    detailLoadSeqRef.current += 1
    setLoadingDetailGroupId(null)
    setIsEditingInfo(false)
    setView('list')
  }

  /**
   * Loads group info, members, and invitations for the drill-down.
   * @param groupId - Target group id.
   * @returns Nothing.
   */
  async function loadDetail(groupId: string): Promise<void> {
    setIsLoadingDetail(true)
    try {
      await consumeStuckInvitations(groupId)
      const group = await fetchGroupById(groupId)
      setDetailGroup(group)
      if (group && !isEditingInfo) {
        setGroupNameDraft(group.name)
        setGroupDescDraft(group.description ?? '')
      }
      const [members, invitations] = await Promise.all([
        fetchGroupMembersForAdmin(groupId, group?.groupAdminId ?? null),
        getPendingMemberInvitationsForGroup(groupId),
      ])
      setDetailMembers(sortMembersAdminsFirst(members))
      setDetailInvitations(invitations)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  /**
   * Saves the edited group name/description.
   * @returns Nothing.
   */
  async function handleSaveGroupInfo(): Promise<void> {
    if (!activeGroupId || !groupNameDraft.trim()) {
      setSaveInfoError(t('settings.group.admin.groupInfo.nameRequired', { defaultValue: 'Group name is required' }))
      return
    }
    setIsSavingInfo(true)
    setSaveInfoError(null)
    const ok = await updateGroupInfoForGroup(activeGroupId, groupNameDraft.trim(), groupDescDraft.trim() || undefined)
    if (ok) {
      setSaveInfoSuccess(true)
      setIsEditingInfo(false)
      await loadDetail(activeGroupId)
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
   * Opens the group-info editor modal with current drafts.
   * @returns Nothing.
   */
  function openGroupInfoModal(): void {
    if (detailGroup) {
      setGroupNameDraft(detailGroup.name)
      setGroupDescDraft(detailGroup.description ?? '')
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
    if (detailGroup) {
      setGroupNameDraft(detailGroup.name)
      setGroupDescDraft(detailGroup.description ?? '')
    }
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
   * Adds a member to the active group by picked profile id.
   * @param userId - Target auth user id.
   * @returns Nothing.
   */
  async function handleAddMemberById(userId: string): Promise<void> {
    if (!activeGroupId) {
      return
    }
    setAddingMemberId(userId)
    setAddMemberError(null)
    setAddMemberSuccess(false)
    const ok = await addUserToGroupByUserIdForGroup(activeGroupId, userId)
    if (ok) {
      setAddMemberSuccess(true)
      setMemberSearchResults((results) => results.filter((profile) => profile.id !== userId))
      await loadDetail(activeGroupId)
      window.setTimeout(() => setAddMemberSuccess(false), 3000)
    } else {
      setAddMemberError(
        t('settings.group.admin.addMember.addError', { defaultValue: 'Failed to add member, please try again' }),
      )
    }
    setAddingMemberId(null)
  }

  /**
   * Adds a member to the active group by typed email (invite if unregistered).
   * @returns Nothing.
   */
  async function handleAddMemberByEmail(): Promise<void> {
    if (!activeGroupId || !memberEmail.trim()) {
      setAddMemberError(t('settings.group.admin.addMember.emailPlaceholder', { defaultValue: 'Enter email address' }))
      return
    }
    setAddingMemberId('__email__')
    setAddMemberError(null)
    setAddMemberSuccess(false)
    const ok = await addUserToGroupForGroup(activeGroupId, memberEmail.trim())
    if (ok) {
      setAddMemberSuccess(true)
      setMemberEmail('')
      await loadDetail(activeGroupId)
      window.setTimeout(() => setAddMemberSuccess(false), 3000)
    } else {
      setAddMemberError(
        t('settings.group.admin.addMember.addError', { defaultValue: 'Failed to add member, please try again' }),
      )
    }
    setAddingMemberId(null)
  }

  /**
   * Confirms and removes a member from the active group.
   * @returns Nothing.
   */
  async function handleRemoveMember(): Promise<void> {
    if (!activeGroupId || !removeMemberId) {
      setRemoveMemberId(null)
      return
    }
    setIsRemovingMember(true)
    const ok = await removeUserFromGroupForGroup(activeGroupId, removeMemberId)
    setIsRemovingMember(false)
    setRemoveMemberId(null)
    if (ok) {
      await loadDetail(activeGroupId)
    }
  }

  /**
   * Toggles a member between plain member and group admin.
   * @param member - Target member row.
   * @returns Nothing.
   */
  async function handleToggleGroupAdmin(member: DetailMember): Promise<void> {
    if (!activeGroupId) {
      return
    }
    setTogglingAdminUserId(member.userId)
    setToggleAdminError(null)
    const ok = member.isGroupAdmin
      ? await removeGroupAdmin(member.userId)
      : await appointGroupAdmin(activeGroupId, member.userId)
    if (ok) {
      await loadDetail(activeGroupId)
    } else {
      setToggleAdminError(
        t('settings.group.admin.members.toggleAdminError', {
          defaultValue: 'Failed to update group admin status, please try again',
        }),
      )
    }
    setTogglingAdminUserId(null)
  }

  /**
   * Display label for a detail roster member.
   * @param member - Roster row.
   * @returns Email or display name.
   */
  function detailMemberLabel(member: DetailMember): string {
    return (
      member.user?.email ||
      member.user?.display_name ||
      member.user?.full_name ||
      member.userId
    )
  }

  /**
   * Confirms and revokes a pending member invitation.
   * @returns Nothing.
   */
  async function handleRevokeInvitation(): Promise<void> {
    if (!activeGroupId || !revokeInvitationId) {
      setRevokeInvitationId(null)
      return
    }
    setIsRevokingInvitation(true)
    const ok = await removeGroupInvitation(revokeInvitationId)
    setIsRevokingInvitation(false)
    setRevokeInvitationId(null)
    if (ok) {
      await loadDetail(activeGroupId)
    }
  }

  // ── List pane ────────────────────────────────────────────────────────────
  const listPane = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand">
          {t('settings.group.management.title', { defaultValue: 'Group Management' })}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg"
          onClick={openAddModal}
        >
          <PlusIcon className="size-4" />
          {t('settings.group.management.addGroupAdmin.title', { defaultValue: 'Add Group Administrator' })}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">
          {t('settings.group.management.groupAdmins.title', { defaultValue: 'Group Administrators' })}
        </p>
        {isLoadingList ? (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
        ) : groupAdmins.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {t('settings.group.management.groupAdmins.noAdmins', { defaultValue: 'No group administrators' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {groupAdmins.map((entry) => (
              <li key={`${entry.group.id}-${entry.userId}`}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-busy={loadingDetailGroupId === entry.group.id}
                  className={`flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 transition hover:border-brand/40 dark:border-white/10 dark:bg-white/5 ${
                    loadingDetailGroupId === entry.group.id ? 'border-brand/40 opacity-80' : ''
                  }`}
                  onClick={() => void openDetail(entry.group.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void openDetail(entry.group.id)
                    }
                  }}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
                    {loadingDetailGroupId === entry.group.id ? (
                      <span className="block size-5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                    ) : (
                      <UsersIcon className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-brand">{entry.group.name}</p>
                    <p className="truncate text-xs text-muted">
                      {entry.user?.email || entry.user?.display_name || entry.user?.full_name || entry.userId}
                    </p>
                    <p className="text-xs text-muted">
                      {t('settings.group.management.groupAdmins.memberCount', { defaultValue: 'Members' })}: {entry.memberCount}
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
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingInvitationGroups.length > 0 ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted">
              {t('settings.group.management.pendingInvitations.title', { defaultValue: 'Pending Invitations' })}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t('settings.group.management.pendingInvitations.description', {
                defaultValue:
                  'These groups have invited a user who has not yet registered. They will automatically take over once they sign up and log in.',
              })}
            </p>
          </div>
          <ul className="space-y-2">
            {pendingInvitationGroups.map((group) => (
              <li key={group.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-busy={loadingDetailGroupId === group.id}
                  className={`flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 transition hover:border-amber-500/60 ${
                    loadingDetailGroupId === group.id ? 'opacity-80' : ''
                  }`}
                  onClick={() => void openDetail(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void openDetail(group.id)
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-brand">{group.name}</p>
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        {t('settings.group.management.pendingInvitations.invitedBadge', { defaultValue: 'Invited' })}
                      </span>
                      {loadingDetailGroupId === group.id ? (
                        <span className="block size-3.5 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-600" />
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-amber-600 dark:text-amber-400">
                      {t('settings.group.management.pendingInvitations.invitedEmailLabel', {
                        email: group.pendingAdminEmail ?? '',
                        defaultValue: `Invited: ${group.pendingAdminEmail ?? ''}`,
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-2xl bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-600 transition hover:bg-amber-500/25 dark:text-amber-400"
                    onClick={(event) => {
                      event.stopPropagation()
                      openAssignModal(group, group.pendingAdminEmail ?? undefined)
                    }}
                  >
                    {t('settings.group.management.pendingInvitations.changeButton', { defaultValue: 'Change Invitation' })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unassignedTempGroups.length > 0 ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted">
              {t('settings.group.management.tempManagedGroups.title', { defaultValue: 'Temporarily Managed Groups' })}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t('settings.group.management.tempManagedGroups.description', {
                defaultValue: 'These groups currently have no administrator. Please assign a new one.',
              })}
            </p>
          </div>
          <ul className="space-y-2">
            {unassignedTempGroups.map((group) => (
              <li key={group.id}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-busy={loadingDetailGroupId === group.id}
                  className={`flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5 ${
                    loadingDetailGroupId === group.id ? 'border-brand/40 opacity-80' : ''
                  }`}
                  onClick={() => void openDetail(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void openDetail(group.id)
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-brand">{group.name}</p>
                      {loadingDetailGroupId === group.id ? (
                        <span className="block size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-2xl bg-brand px-3 py-2 text-xs font-bold text-brand-fg"
                    onClick={(event) => {
                      event.stopPropagation()
                      openAssignModal(group)
                    }}
                  >
                    {t('settings.group.management.tempManagedGroups.assignAdmin', { defaultValue: 'Assign Administrator' })}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )

  // ── Detail pane ──────────────────────────────────────────────────────────
  const detailPane = (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          title={t('settings.group.management.editMembersBack', { defaultValue: 'Back to Group Management' })}
          aria-label={t('settings.group.management.editMembersBack', { defaultValue: 'Back to Group Management' })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-2xl bg-zinc-950/5 text-brand transition hover:bg-zinc-950/10 dark:bg-white/10 dark:hover:bg-white/15"
          onClick={closeDetail}
        >
          <ArrowLeftIcon className="size-4" />
        </button>

        {isLoadingDetail && !detailGroup ? (
          <p className="min-w-0 flex-1 text-sm text-muted">{t('common.loading', { defaultValue: 'Loading…' })}</p>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-sm font-bold text-brand">
              {detailGroup?.name || t('settings.group.management.editMembersTitle', { defaultValue: 'Manage Group Members' })}
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

      {isLoadingDetail && !detailGroup ? null : (
        <>
          <div className="space-y-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">
                {t('settings.group.admin.groupInfo.description', { defaultValue: 'Group Description' })}
              </p>
              <button
                type="button"
                className="text-xs font-bold text-brand"
                onClick={openGroupInfoModal}
              >
                {t('settings.profile.edit')}
              </button>
            </div>
            <p className="text-sm text-muted">{detailGroup?.description || '—'}</p>
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

            {toggleAdminError ? <p className="text-sm font-semibold text-rose-500">{toggleAdminError}</p> : null}

            {detailMembers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                {t('settings.group.admin.members.noMembers', { defaultValue: 'No members' })}
              </p>
            ) : (
              <ul className="space-y-2">
                {detailMembers.map((member) => {
                  return (
                    <li
                      key={member.id}
                      className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
                          <UsersIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-brand">
                              {detailMemberLabel(member)}
                            </p>
                            {member.isGroupAdmin ? (
                              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
                                {t('settings.group.admin.members.adminBadge')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={togglingAdminUserId === member.userId}
                            title={
                              member.isGroupAdmin
                                ? t('settings.group.admin.members.revokeAdmin')
                                : t('settings.group.admin.members.makeAdmin')
                            }
                            className={`rounded-xl p-2 transition disabled:opacity-50 ${
                              member.isGroupAdmin
                                ? 'text-rose-500 hover:bg-rose-500/10'
                                : 'text-brand hover:bg-brand/10'
                            }`}
                            onClick={() => void handleToggleGroupAdmin(member)}
                          >
                            <CrownIcon className="size-4" />
                          </button>
                          {!member.isGroupAdmin ? (
                            <button
                              type="button"
                              className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-500/10"
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

          {detailInvitations.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted">
                {t('settings.group.admin.pendingInvitations.title', { defaultValue: 'Pending Invitations' })}
              </p>
              <ul className="space-y-2">
                {detailInvitations.map((invitation) => (
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
    </div>
  )

  return (
    <div className="overflow-hidden">
      <div
        className="flex transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: '200%', transform: view === 'detail' ? 'translateX(-50%)' : 'translateX(0%)' }}
      >
        <div className="w-1/2 min-w-0 shrink-0 pr-3">{listPane}</div>
        <div className="w-1/2 min-w-0 shrink-0 pl-3">{detailPresence.mounted || view === 'detail' ? detailPane : null}</div>
      </div>

      <InlineConfirmDialog
        open={revokeUserId !== null}
        title={t('settings.group.management.groupAdmins.deleteConfirmTitle', { defaultValue: 'Confirm Delete Group Administrator' })}
        message={t('settings.group.management.groupAdmins.deleteConfirmMessage', {
          defaultValue:
            'Are you sure you want to delete this group administrator? The group will be set to temporary managed state, waiting for a new administrator to be assigned.',
        })}
        confirmLabel={t('settings.group.management.groupAdmins.deleteConfirmButton', { defaultValue: 'Confirm Delete' })}
        cancelLabel={t('settings.group.management.groupAdmins.deleteCancelButton', { defaultValue: 'Cancel' })}
        isBusy={isRevoking}
        onConfirm={() => void handleRevokeGroupAdmin()}
        onCancel={() => setRevokeUserId(null)}
      />

      <InlineConfirmDialog
        open={removeMemberId !== null}
        title={t('settings.group.admin.members.removeConfirmTitle', { defaultValue: 'Confirm Remove Member' })}
        message={t('settings.group.admin.members.removeConfirmMessage', {
          defaultValue: 'Are you sure you want to remove this member? After removal, the member will no longer be able to view group data.',
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
          defaultValue: 'After revoking, signing in with this email will no longer auto-join this group. Revoke this invitation?',
        })}
        confirmLabel={t('settings.group.admin.pendingInvitations.revokeConfirmButton', { defaultValue: 'Confirm Revoke' })}
        cancelLabel={t('settings.group.admin.pendingInvitations.revokeCancelButton', { defaultValue: 'Cancel' })}
        isBusy={isRevokingInvitation}
        onConfirm={() => void handleRevokeInvitation()}
        onCancel={() => setRevokeInvitationId(null)}
      />

      {assignModalPresence.mounted ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
            assignModalPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={closeAssignModal}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-bold text-brand">
              {t('settings.group.management.tempManagedGroups.assignAdmin', { defaultValue: 'Assign Administrator' })}
            </p>
            <ProfileSearchField
              query={assignSearchQuery}
              onQueryChange={setAssignSearchQuery}
              results={assignSearchResults}
              isSearching={isSearchingAssign}
              placeholder={t('settings.group.management.addGroupAdmin.searchPlaceholder', {
                defaultValue: 'Search registered users by email or name',
              })}
              emptyHint={t('settings.group.management.addGroupAdmin.searchEmpty', {
                defaultValue: 'Type to search registered users, or enter an email below to create a pending invitation',
              })}
              noResultsLabel={t('settings.group.management.addGroupAdmin.searchNoResults', {
                defaultValue: 'No matching registered users',
              })}
              pickLabel={t('settings.group.management.addGroupAdmin.pick', { defaultValue: 'Pick' })}
              disabled={isAssigning}
              onPick={(profile) => {
                setSelectedAssignProfile(profile)
                setAssignEmail(profile.email ?? '')
                setAssignSearchQuery('')
                setAssignSearchResults([])
              }}
            />
            {selectedAssignProfile ? (
              <SelectedProfilePill
                profile={selectedAssignProfile}
                disabled={isAssigning}
                onClear={() => {
                  setSelectedAssignProfile(null)
                  setAssignEmail('')
                }}
              />
            ) : (
              <input
                type="email"
                value={assignEmail}
                disabled={isAssigning}
                placeholder={t('settings.group.management.addGroupAdmin.emailPlaceholder', {
                  defaultValue: 'Enter an unregistered email address',
                })}
                className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
                onChange={(event) => setAssignEmail(event.target.value)}
              />
            )}
            {assignSuccessMessage ? (
              <p className="text-sm font-semibold text-brand">{assignSuccessMessage}</p>
            ) : null}
            {assignError ? <p className="text-sm font-semibold text-rose-500">{assignError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isAssigning}
                className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void handleAssignNewGroupAdmin()}
              >
                {isAssigning
                  ? t('settings.group.management.tempManagedGroups.assigning', { defaultValue: 'Assigning...' })
                  : t('settings.group.management.tempManagedGroups.assignAdmin', { defaultValue: 'Assign Administrator' })}
              </button>
              <button
                type="button"
                disabled={isAssigning}
                className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={closeAssignModal}
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addModalPresence.mounted ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
            addModalPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={closeAddModal}
        >
          <div
            className="max-h-[min(90vh,40rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-base font-bold text-brand">
              {t('settings.group.management.addGroupAdmin.title', { defaultValue: 'Add Group Administrator' })}
            </p>
            <ProfileSearchField
              query={adminSearchQuery}
              onQueryChange={setAdminSearchQuery}
              results={adminSearchResults}
              isSearching={isSearchingAdmin}
              placeholder={t('settings.group.management.addGroupAdmin.searchPlaceholder', {
                defaultValue: 'Search registered users by email or name',
              })}
              emptyHint={t('settings.group.management.addGroupAdmin.searchEmpty', {
                defaultValue: 'Type to search registered users, or enter an email below to create a pending invitation',
              })}
              noResultsLabel={t('settings.group.management.addGroupAdmin.searchNoResults', {
                defaultValue: 'No matching registered users',
              })}
              pickLabel={t('settings.group.management.addGroupAdmin.pick', { defaultValue: 'Pick' })}
              disabled={isAdding}
              onPick={(profile) => {
                setSelectedAdminProfile(profile)
                setNewAdminEmail(profile.email ?? '')
                setAdminSearchQuery('')
                setAdminSearchResults([])
              }}
            />
            {selectedAdminProfile ? (
              <SelectedProfilePill
                profile={selectedAdminProfile}
                disabled={isAdding}
                onClear={() => {
                  setSelectedAdminProfile(null)
                  setNewAdminEmail('')
                }}
              />
            ) : (
              <input
                type="email"
                value={newAdminEmail}
                disabled={isAdding}
                placeholder={t('settings.group.management.addGroupAdmin.emailPlaceholder', {
                  defaultValue: 'Enter an unregistered email address',
                })}
                className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
                onChange={(event) => setNewAdminEmail(event.target.value)}
              />
            )}
            <input
              type="text"
              value={newGroupName}
              disabled={isAdding}
              placeholder={t('settings.group.management.addGroupAdmin.groupNamePlaceholder', {
                defaultValue: 'Enter group name',
              })}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
              onChange={(event) => setNewGroupName(event.target.value)}
            />
            <textarea
              value={newGroupDescription}
              disabled={isAdding}
              rows={3}
              placeholder={t('settings.group.management.addGroupAdmin.descriptionPlaceholder', {
                defaultValue: 'Enter group description',
              })}
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
              onChange={(event) => setNewGroupDescription(event.target.value)}
            />
            {addError ? <p className="text-sm font-semibold text-rose-500">{addError}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isAdding}
                className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void handleAddGroupAdmin()}
              >
                {isAdding
                  ? t('settings.group.management.addGroupAdmin.adding', { defaultValue: 'Adding...' })
                  : t('settings.group.management.addGroupAdmin.add', { defaultValue: 'Add' })}
              </button>
              <button
                type="button"
                disabled={isAdding}
                className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={closeAddModal}
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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