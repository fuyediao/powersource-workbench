import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  AppleIcon,
  CrownIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  MailIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  createAuthUser,
  deleteAuthUser,
  inviteAuthUser,
  isAuthAdminApiConfigured,
  listAuthUsers,
  setSystemAdmin,
  updateAuthUser,
  AUTH_ADMIN_PASSWORD_MIN_LENGTH,
  EMPLOYEE_ID_PATTERN,
  type AuthAdminUser,
} from '@/services/auth-admin-api'
import {
  fetchUserAffiliations,
  type UserAffiliationEntry,
  type UserAffiliationMap,
} from '@/services/user-affiliation-api'

const PER_PAGE = 20

interface UserManagementSectionProps {
  currentUserId: string
  isSuperAdmin: boolean
}

/**
 * Employee id from `user_metadata.employee_id`, if present.
 * @param user - Auth admin user row.
 * @returns Employee id string, or empty when absent.
 */
function employeeIdOf(user: AuthAdminUser): string {
  const raw = user.user_metadata?.employee_id
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}

/**
 * Whether the account is currently banned.
 * @param user - Auth admin user row.
 * @returns True when banned_until is in the future.
 */
function isUserBanned(user: AuthAdminUser): boolean {
  if (!user.banned_until) {
    return false
  }
  const until = new Date(user.banned_until).getTime()
  return Number.isFinite(until) && until > Date.now()
}

/**
 * Format an ISO timestamp for compact table display.
 * @param iso - ISO date string or null.
 * @returns Formatted date, or an em dash.
 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return '—'
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Auth providers linked to a user.
 * @param user - Auth admin user row.
 * @returns Provider id list.
 */
function getProviders(user: AuthAdminUser): string[] {
  if (user.identities?.length) {
    return [...new Set(user.identities.map((identity) => identity.provider))]
  }
  const meta = user.app_metadata ?? {}
  const list = meta.providers
  if (Array.isArray(list)) {
    return list.filter((item): item is string => typeof item === 'string')
  }
  if (typeof meta.provider === 'string') {
    return [meta.provider]
  }
  return []
}

/**
 * i18n label for a single affiliation entry (system-level kinds omit group name).
 * @param entry - Affiliation entry.
 * @param t - Translation function.
 * @returns Localized affiliation label.
 */
function affiliationLabel(entry: UserAffiliationEntry, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (entry.kind) {
    case 'super_admin':
      return t('settings.userManagement.affiliation.superAdmin')
    case 'system_admin':
      return t('settings.userManagement.affiliation.systemAdmin')
    case 'global_leader':
      return t('settings.userManagement.affiliation.globalLeader')
    case 'group_admin':
      return t('settings.userManagement.affiliation.groupAdmin', {
        group: entry.groupName ?? '',
      })
    case 'group_member':
    default:
      return t('settings.userManagement.affiliation.groupMember', {
        group: entry.groupName ?? '',
      })
  }
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

interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

/**
 * Modal form to create a new auth user (email, optional password, employee id).
 * @param props - Open state and callbacks.
 * @returns Create-user dialog, or null while fully closed.
 */
function CreateUserDialog({ open, onClose, onCreated }: CreateUserDialogProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(open, 200)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [sendInvite, setSendInvite] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setEmployeeId('')
      setSendInvite(true)
      setError(null)
    }
  }, [open])

  if (!presence.mounted) {
    return null
  }

  /**
   * Validates and submits the create-user form.
   * @returns Nothing.
   */
  async function handleSubmit(): Promise<void> {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError(t('settings.userManagement.create.emailRequired', { defaultValue: 'Email is required' }))
      return
    }
    if (employeeId.trim() && !EMPLOYEE_ID_PATTERN.test(employeeId.trim())) {
      setError(
        t('settings.userManagement.create.employeeIdInvalid', {
          defaultValue: 'Employee id must match the PS#### format',
        }),
      )
      return
    }
    if (password && password.length < AUTH_ADMIN_PASSWORD_MIN_LENGTH) {
      setError(
        t('settings.userManagement.create.passwordTooShort', {
          minLength: AUTH_ADMIN_PASSWORD_MIN_LENGTH,
          defaultValue: `Password must be at least ${AUTH_ADMIN_PASSWORD_MIN_LENGTH} characters`,
        }),
      )
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await createAuthUser({
        email: trimmedEmail,
        password: password || undefined,
        employeeId: employeeId.trim() || undefined,
        emailConfirm: !sendInvite,
        sendInvite,
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic', { defaultValue: 'Something went wrong' }))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-base font-bold text-brand">
          {t('settings.userManagement.create.title', { defaultValue: 'Create User' })}
        </p>
        <input
          type="email"
          value={email}
          disabled={isSaving}
          placeholder={t('settings.userManagement.create.emailPlaceholder', { defaultValue: 'Enter email address' })}
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="text"
          value={employeeId}
          disabled={isSaving}
          placeholder={t('settings.userManagement.create.employeeIdPlaceholder', { defaultValue: 'Employee id (e.g. PS1234)' })}
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
          onChange={(event) => setEmployeeId(event.target.value)}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            disabled={isSaving}
            placeholder={t('settings.userManagement.create.passwordPlaceholder', {
              defaultValue: 'Optional initial password',
            })}
            className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 pr-10 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted"
            onClick={() => setShowPassword((prev) => !prev)}
          >
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={sendInvite}
            disabled={isSaving}
            onChange={(event) => setSendInvite(event.target.checked)}
            className="size-4 rounded border-zinc-950/20 accent-brand dark:border-white/20"
          />
          {t('settings.userManagement.create.sendInvite', { defaultValue: 'Send invitation email' })}
        </label>
        {error ? <p className="text-sm font-semibold text-rose-500">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isSaving}
            className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void handleSubmit()}
          >
            {isSaving
              ? t('settings.userManagement.create.creating', { defaultValue: 'Creating...' })
              : t('settings.userManagement.create.submit', { defaultValue: 'Create User' })}
          </button>
          <button
            type="button"
            disabled={isSaving}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={onClose}
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

interface EditUserDialogProps {
  user: AuthAdminUser | null
  onClose: () => void
  onSaved: () => void
}

/**
 * Modal form to edit an auth user's email and employee id.
 * @param props - Target user (null when closed) and callbacks.
 * @returns Edit-user dialog, or null while fully closed.
 */
function EditUserDialog({ user, onClose, onSaved }: EditUserDialogProps) {
  const { t } = useTranslation()
  const open = user !== null
  const presence = useDialogPresence(open, 200)
  const [activeUser, setActiveUser] = useState<AuthAdminUser | null>(user)
  const [email, setEmail] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setActiveUser(user)
      setEmail(user.email ?? '')
      setEmployeeId(employeeIdOf(user) === '—' ? '' : employeeIdOf(user))
      setError(null)
    }
  }, [user])

  if (!presence.mounted || !activeUser) {
    return null
  }

  /**
   * Validates and submits the edit-user form.
   * @returns Nothing.
   */
  async function handleSubmit(): Promise<void> {
    if (!activeUser) {
      return
    }
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError(t('settings.userManagement.edit.emailRequired', { defaultValue: 'Email is required' }))
      return
    }
    if (employeeId.trim() && !EMPLOYEE_ID_PATTERN.test(employeeId.trim())) {
      setError(
        t('settings.userManagement.edit.employeeIdInvalid', {
          defaultValue: 'Employee id must match the PS#### format',
        }),
      )
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await updateAuthUser(activeUser.id, {
        email: trimmedEmail !== activeUser.email ? trimmedEmail : undefined,
        employeeId: employeeId.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic', { defaultValue: 'Something went wrong' }))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-base font-bold text-brand">
          {t('settings.userManagement.edit.title', { defaultValue: 'Edit User' })}
        </p>
        <input
          type="email"
          value={email}
          disabled={isSaving}
          placeholder={t('settings.userManagement.edit.emailPlaceholder', { defaultValue: 'Enter email address' })}
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="text"
          value={employeeId}
          disabled={isSaving}
          placeholder={t('settings.userManagement.edit.employeeIdPlaceholder', { defaultValue: 'Employee id (e.g. PS1234)' })}
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40"
          onChange={(event) => setEmployeeId(event.target.value)}
        />
        {error ? <p className="text-sm font-semibold text-rose-500">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isSaving}
            className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void handleSubmit()}
          >
            {isSaving
              ? t('settings.userManagement.edit.saving', { defaultValue: 'Saving...' })
              : t('settings.userManagement.edit.save', { defaultValue: 'Save Changes' })}
          </button>
          <button
            type="button"
            disabled={isSaving}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={onClose}
          >
            {t('actions.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * System-admin User Management: paginated auth user roster with search,
 * create/edit/ban/invite/delete, CRM affiliation labels, and (super admin
 * only) system admin grant/revoke.
 * @param props - Signed-in user id and whether they are a super admin.
 * @returns User Management settings section.
 */
export function UserManagementSection({ currentUserId, isSuperAdmin }: UserManagementSectionProps) {
  const { t } = useTranslation()
  const configured = isAuthAdminApiConfigured()

  const [users, setUsers] = useState<AuthAdminUser[]>([])
  const [affiliations, setAffiliations] = useState<UserAffiliationMap>({})
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<AuthAdminUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AuthAdminUser | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  /**
   * Reloads the current page of auth users and their CRM affiliations.
   * @returns Nothing.
   */
  async function loadUsers(): Promise<void> {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await listAuthUsers({ page, perPage: PER_PAGE, search: searchQuery })
      setUsers(result.users)
      setHasNextPage(result.users.length === PER_PAGE)
      const map = await fetchUserAffiliations(result.users.map((user) => user.id))
      setAffiliations(map)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('errors.generic', { defaultValue: 'Something went wrong' }))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!configured) {
      return
    }
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, page, searchQuery])

  // Debounce the search input into searchQuery, resetting to page 1.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  /**
   * Toggles ban status for a user.
   * @param user - Target auth user.
   * @returns Nothing.
   */
  async function handleToggleBan(user: AuthAdminUser): Promise<void> {
    setBusyUserId(user.id)
    setRowError(null)
    try {
      await updateAuthUser(user.id, { banned: !isUserBanned(user) })
      await loadUsers()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : t('errors.generic', { defaultValue: 'Something went wrong' }))
    } finally {
      setBusyUserId(null)
    }
  }

  /**
   * Resends an invitation email to a user.
   * @param user - Target auth user.
   * @returns Nothing.
   */
  async function handleInvite(user: AuthAdminUser): Promise<void> {
    setBusyUserId(user.id)
    setRowError(null)
    try {
      await inviteAuthUser(user.id)
    } catch (err) {
      setRowError(err instanceof Error ? err.message : t('errors.generic', { defaultValue: 'Something went wrong' }))
    } finally {
      setBusyUserId(null)
    }
  }

  /**
   * Confirms and deletes the targeted auth user.
   * @returns Nothing.
   */
  async function handleDelete(): Promise<void> {
    if (!deleteTarget) {
      return
    }
    setIsDeleting(true)
    setRowError(null)
    try {
      await deleteAuthUser(deleteTarget.id)
      setDeleteTarget(null)
      await loadUsers()
    } catch (err) {
      setRowError(err instanceof Error ? err.message : t('errors.generic', { defaultValue: 'Something went wrong' }))
    } finally {
      setIsDeleting(false)
    }
  }

  /**
   * Grants or revokes system_admin for a user (super admin only).
   * @param user - Target auth user.
   * @param grant - True to grant, false to revoke.
   * @returns Nothing.
   */
  async function handleToggleSystemAdmin(user: AuthAdminUser, grant: boolean): Promise<void> {
    setBusyUserId(user.id)
    setRowError(null)
    const ok = await setSystemAdmin(user.id, grant)
    if (!ok) {
      setRowError(
        t('settings.userManagement.errors.systemAdminToggleFailed'),
      )
    } else {
      await loadUsers()
    }
    setBusyUserId(null)
  }

  if (!configured) {
    return (
      <div className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 text-sm text-muted dark:border-white/10 dark:bg-white/5">
        {t('settings.userManagement.errors.apiNotConfigured')}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">
        {t('settings.userManagement.title', { defaultValue: 'User Management' })}
      </p>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-zinc-950/10 bg-white/60 px-3.5 py-2.5 dark:border-white/10 dark:bg-zinc-950/40">
          <SearchIcon className="size-4 shrink-0 text-muted" />
          <input
            type="text"
            value={searchInput}
            placeholder={t('settings.userManagement.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <button
          type="button"
          title={t('settings.userManagement.createUser')}
          aria-label={t('settings.userManagement.createUser')}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition hover:opacity-90"
          onClick={() => setShowCreateDialog(true)}
        >
          <PlusIcon className="size-4" />
        </button>
        <button
          type="button"
          title={t('settings.userManagement.refresh')}
          aria-label={t('settings.userManagement.refresh')}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-zinc-950/5 text-brand transition hover:bg-zinc-950/10 dark:bg-white/10 dark:hover:bg-white/15"
          onClick={() => void loadUsers()}
        >
          <RefreshIcon className="size-4" />
        </button>
      </div>

      {rowError ? <p className="text-sm font-semibold text-rose-500">{rowError}</p> : null}
      {loadError ? <p className="text-sm font-semibold text-rose-500">{loadError}</p> : null}

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted">
          {t('common.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : users.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('settings.userManagement.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-950/10 bg-zinc-950/5 dark:border-white/10 dark:bg-white/5">
          <table className="w-full min-w-[720px] table-fixed text-sm">
            <thead>
              <tr className="border-b border-zinc-950/10 text-left text-xs font-semibold text-muted dark:border-white/10">
                <th className="px-3 py-3 font-semibold">{t('settings.userManagement.columns.email')}</th>
                <th className="hidden px-3 py-3 font-semibold lg:table-cell">
                  {t('settings.userManagement.columns.employeeId')}
                </th>
                <th className="hidden px-3 py-3 font-semibold sm:table-cell">
                  {t('settings.userManagement.columns.affiliation')}
                </th>
                <th className="hidden px-3 py-3 font-semibold md:table-cell">
                  {t('settings.userManagement.columns.providers')}
                </th>
                <th className="hidden px-3 py-3 font-semibold lg:table-cell">
                  {t('settings.userManagement.columns.createdAt')}
                </th>
                <th className="hidden px-3 py-3 font-semibold xl:table-cell">
                  {t('settings.userManagement.columns.lastSignIn')}
                </th>
                <th className="px-3 py-3 font-semibold">{t('settings.userManagement.columns.status')}</th>
                <th className="px-3 py-3 text-right font-semibold">
                  {t('settings.userManagement.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const banned = isUserBanned(user)
                const entries = affiliations[user.id] ?? []
                const isSelf = user.id === currentUserId
                const hasSuperAdminAffiliation = entries.some((entry) => entry.kind === 'super_admin')
                const hasSystemAdminAffiliation = entries.some((entry) => entry.kind === 'system_admin')
                const isBusy = busyUserId === user.id
                const providers = getProviders(user)
                const employeeId = employeeIdOf(user)

                return (
                  <tr
                    key={user.id}
                    className="border-b border-zinc-950/5 last:border-0 hover:bg-zinc-950/5 dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <td className="min-w-0 px-3 py-3">
                      <div className="truncate font-semibold text-brand" title={user.email ?? undefined}>
                        {user.email || '—'}
                        {isSelf ? (
                          <span className="ml-1 text-xs font-semibold text-muted">
                            ({t('settings.userManagement.you')})
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="hidden truncate px-3 py-3 text-muted lg:table-cell"
                      title={employeeId || undefined}
                    >
                      {employeeId || '—'}
                    </td>
                    <td className="hidden min-w-0 px-3 py-3 sm:table-cell">
                      {entries.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {entries.map((entry, index) => (
                            <span
                              key={`${entry.kind}-${entry.groupName ?? index}`}
                              className="truncate text-xs text-muted"
                              title={affiliationLabel(entry, t)}
                            >
                              {affiliationLabel(entry, t)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="hidden min-w-0 px-3 py-3 md:table-cell">
                      {providers.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {providers.map((provider) => {
                            const lower = provider.toLowerCase()
                            if (lower === 'google') {
                              return (
                                <span key={provider} title={provider} className="inline-flex text-brand">
                                  <GoogleIcon className="size-4.5" />
                                </span>
                              )
                            }
                            if (lower === 'apple') {
                              return (
                                <span key={provider} title={provider} className="inline-flex text-brand">
                                  <AppleIcon className="size-4.5" />
                                </span>
                              )
                            }
                            if (lower === 'email' || lower === 'phone') {
                              return (
                                <span key={provider} title={provider} className="inline-flex text-brand">
                                  <MailIcon className="size-4.5" />
                                </span>
                              )
                            }
                            return (
                              <span
                                key={provider}
                                title={provider}
                                className="rounded-full border border-zinc-950/10 px-1.5 py-0.5 text-[10px] font-semibold text-muted dark:border-white/10"
                              >
                                {provider}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td
                      className="hidden truncate px-3 py-3 text-xs text-muted lg:table-cell"
                      title={formatDate(user.created_at)}
                    >
                      {formatDate(user.created_at)}
                    </td>
                    <td
                      className="hidden truncate px-3 py-3 text-xs text-muted xl:table-cell"
                      title={formatDate(user.last_sign_in_at)}
                    >
                      {formatDate(user.last_sign_in_at)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${
                          banned
                            ? 'bg-rose-500/15 text-rose-500'
                            : 'bg-brand/15 text-brand'
                        }`}
                      >
                        {banned
                          ? t('settings.userManagement.status.banned')
                          : t('settings.userManagement.status.active')}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex shrink-0 items-center justify-end gap-0.5">
                        {isSuperAdmin && !isSelf && !hasSuperAdminAffiliation ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            title={
                              hasSystemAdminAffiliation
                                ? t('settings.userManagement.actions.revokeSystemAdmin')
                                : t('settings.userManagement.actions.grantSystemAdmin')
                            }
                            className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
                              hasSystemAdminAffiliation
                                ? 'text-brand hover:bg-brand/10'
                                : 'text-muted hover:bg-brand/10 hover:text-brand'
                            }`}
                            onClick={() =>
                              void handleToggleSystemAdmin(user, !hasSystemAdminAffiliation)
                            }
                          >
                            <CrownIcon className="size-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isBusy}
                          title={t('settings.userManagement.actions.edit')}
                          className="rounded-lg p-1.5 text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                          onClick={() => setEditingUser(user)}
                        >
                          <PencilIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          title={t('settings.userManagement.actions.invite')}
                          className="rounded-lg p-1.5 text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                          onClick={() => void handleInvite(user)}
                        >
                          <RefreshIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          title={
                            banned
                              ? t('settings.userManagement.actions.unban')
                              : t('settings.userManagement.actions.ban')
                          }
                          className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
                            banned
                              ? 'text-brand hover:bg-brand/10'
                              : 'text-muted hover:bg-rose-500/10 hover:text-rose-500'
                          }`}
                          onClick={() => void handleToggleBan(user)}
                        >
                          <ShieldIcon className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || isSelf}
                          title={
                            isSelf
                              ? t('settings.userManagement.actions.cannotDeleteSelf')
                              : t('settings.userManagement.actions.delete')
                          }
                          className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {users.length > 0 ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            {t('settings.userManagement.prev')}
          </button>
          <span className="text-xs text-muted">
            {t('settings.userManagement.pageLabel', { page })}
          </span>
          <button
            type="button"
            disabled={!hasNextPage || isLoading}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={() => setPage((prev) => prev + 1)}
          >
            {t('settings.userManagement.next')}
          </button>
        </div>
      ) : null}

      <CreateUserDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} onCreated={() => void loadUsers()} />
      <EditUserDialog user={editingUser} onClose={() => setEditingUser(null)} onSaved={() => void loadUsers()} />

      <InlineConfirmDialog
        open={deleteTarget !== null}
        title={t('settings.userManagement.deleteConfirmTitle')}
        message={t('settings.userManagement.deleteConfirmMessage', {
          email: deleteTarget?.email ?? '',
        })}
        confirmLabel={t('settings.userManagement.actions.delete')}
        cancelLabel={t('actions.cancel')}
        isBusy={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
