/** T&E homepage partner-department management pane. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  createTePartnerDepartment,
  deleteTePartnerDepartment,
  listTePartnerDepartments,
  updateTePartnerDepartment,
  type TePartnerDepartment,
} from '@/services/te-partner-departments-api'

interface TePartnerDepartmentsPaneProps {
  writes: AdminShellWrites
}

const DEPARTMENTS_PAGE_SIZE = 20

/**
 * Determine whether a Supabase error is a unique-name conflict.
 * @param error - Unknown caught value.
 * @returns Whether Postgres reported a unique violation.
 */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505',
  )
}

/**
 * Manage T&E homepage partner departments.
 * @param props - Active write capabilities.
 * @returns Department management UI.
 */
export function TePartnerDepartmentsPane({ writes }: TePartnerDepartmentsPaneProps) {
  const { t } = useTranslation()
  const [departments, setDepartments] = useState<TePartnerDepartment[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const newNameInputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setErrorMessage(null)
    try {
      setDepartments(await listTePartnerDepartments())
    } catch (error) {
      console.error('Load T&E partner departments error:', error)
      setErrorMessage(t('teAdmin.partnerDepartments.errors.load'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  const filteredDepartments = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('en-US')
    if (!query) return departments
    return departments.filter((department) =>
      department.name.toLocaleLowerCase('en-US').includes(query),
    )
  }, [departments, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredDepartments.length / DEPARTMENTS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visibleDepartments = useMemo(() => {
    const start = (currentPage - 1) * DEPARTMENTS_PAGE_SIZE
    return filteredDepartments.slice(start, start + DEPARTMENTS_PAGE_SIZE)
  }, [currentPage, filteredDepartments])

  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  /** Create a department from the add field. */
  async function handleCreate(): Promise<void> {
    const name = newName.trim()
    if (!writes.canCreate || creating) return
    if (!name) {
      setErrorMessage(t('teAdmin.partnerDepartments.errors.nameRequired'))
      newNameInputRef.current?.focus()
      return
    }
    setCreating(true)
    setErrorMessage(null)
    try {
      await createTePartnerDepartment(name)
      setNewName('')
      await reload()
      setPage(Math.max(1, Math.ceil((departments.length + 1) / DEPARTMENTS_PAGE_SIZE)))
    } catch (error) {
      console.error('Create T&E partner department error:', error)
      setErrorMessage(
        t(
          isUniqueViolation(error)
            ? 'teAdmin.partnerDepartments.errors.duplicate'
            : 'teAdmin.partnerDepartments.errors.save',
        ),
      )
    } finally {
      setCreating(false)
    }
  }

  /**
   * Enter inline edit mode for one row.
   * @param department - Row to edit.
   */
  function beginEdit(department: TePartnerDepartment): void {
    setEditingId(department.id)
    setEditingName(department.name)
    setConfirmDeleteId(null)
  }

  /** Save the active inline name edit. */
  async function saveEdit(): Promise<void> {
    if (!editingId || !editingName.trim() || !writes.canEdit || savingId) return
    setSavingId(editingId)
    setErrorMessage(null)
    try {
      await updateTePartnerDepartment(editingId, { name: editingName })
      setEditingId(null)
      setEditingName('')
      await reload()
    } catch (error) {
      console.error('Update T&E partner department error:', error)
      setErrorMessage(
        t(
          isUniqueViolation(error)
            ? 'teAdmin.partnerDepartments.errors.duplicate'
            : 'teAdmin.partnerDepartments.errors.save',
        ),
      )
    } finally {
      setSavingId(null)
    }
  }

  /**
   * Toggle whether a department appears on the T&E homepage.
   * @param department - Row to toggle.
   */
  async function toggleActive(department: TePartnerDepartment): Promise<void> {
    if (!writes.canEdit || savingId) return
    setSavingId(department.id)
    setErrorMessage(null)
    try {
      await updateTePartnerDepartment(department.id, { isActive: !department.isActive })
      await reload()
    } catch (error) {
      console.error('Toggle T&E partner department error:', error)
      setErrorMessage(t('teAdmin.partnerDepartments.errors.save'))
    } finally {
      setSavingId(null)
    }
  }

  /**
   * Permanently delete one confirmed department.
   * @param id - Department row id.
   */
  async function handleDelete(id: string): Promise<void> {
    if (!writes.canDelete || savingId) return
    setSavingId(id)
    setErrorMessage(null)
    try {
      await deleteTePartnerDepartment(id)
      setConfirmDeleteId(null)
      await reload()
    } catch (error) {
      console.error('Delete T&E partner department error:', error)
      setErrorMessage(t('teAdmin.partnerDepartments.errors.delete'))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('teAdmin.partnerDepartments.title')}
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
          onClick={() => void reload()}
        >
          <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          {t('teAdmin.partnerDepartments.refresh')}
        </button>
      </div>

      {writes.readOnly ? (
        <p className="text-sm font-semibold text-muted">{t('admin.moduleAccess.readOnly')}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={t('teAdmin.partnerDepartments.searchPlaceholder')}
            className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
          />
        </div>
        <form
          className="flex min-w-[18rem] flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCreate()
          }}
        >
          <input
            ref={newNameInputRef}
            type="text"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value)
              if (errorMessage) setErrorMessage(null)
            }}
            placeholder={t('teAdmin.partnerDepartments.namePlaceholder')}
            disabled={!writes.canCreate || creating}
            className="min-w-0 flex-1 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 disabled:opacity-50 dark:bg-white/5"
          />
          <button
            type="submit"
            disabled={!writes.canCreate || creating}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlusIcon className="size-4" />
            {t('teAdmin.partnerDepartments.add')}
          </button>
        </form>
      </div>

      {errorMessage ? <p className="text-sm font-semibold text-rose-500">{errorMessage}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5">
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_8rem_12rem] gap-3 border-b border-ink/10 bg-white/95 px-4 py-3 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
          <span>{t('teAdmin.partnerDepartments.columns.name')}</span>
          <span>{t('teAdmin.partnerDepartments.columns.status')}</span>
          <span className="text-right">{t('teAdmin.partnerDepartments.columns.actions')}</span>
        </div>

        {loading ? (
          <p className="p-6 text-center text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : filteredDepartments.length === 0 ? (
          <p className="p-6 text-center text-sm font-medium text-muted">
            {t('teAdmin.partnerDepartments.empty')}
          </p>
        ) : (
          visibleDepartments.map((department) => {
            const isEditing = editingId === department.id
            const isConfirmingDelete = confirmDeleteId === department.id
            const isSaving = savingId === department.id
            return (
              <div
                key={department.id}
                className="grid grid-cols-[minmax(0,1fr)_8rem_12rem] items-center gap-3 border-b border-ink/8 px-4 py-3 last:border-b-0"
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveEdit()
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    className="min-w-0 rounded-xl border border-brand/30 bg-white/80 px-3 py-2 text-sm font-semibold text-ink outline-none dark:bg-white/5"
                  />
                ) : (
                  <span className="truncate text-sm font-semibold text-ink">{department.name}</span>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={department.isActive}
                  disabled={!writes.canEdit || isSaving}
                  onClick={() => void toggleActive(department)}
                  className={`w-fit rounded-full border px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
                    department.isActive
                      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'border-ink/15 bg-ink/5 text-muted'
                  }`}
                >
                  {t(
                    department.isActive
                      ? 'teAdmin.partnerDepartments.active'
                      : 'teAdmin.partnerDepartments.inactive',
                  )}
                </button>

                <div className="flex justify-end gap-1.5">
                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        disabled={!editingName.trim() || isSaving}
                        onClick={() => void saveEdit()}
                        className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand/10 disabled:opacity-50"
                      >
                        {t('teAdmin.partnerDepartments.save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-ink/5"
                      >
                        {t('teAdmin.partnerDepartments.cancel')}
                      </button>
                    </>
                  ) : isConfirmingDelete ? (
                    <>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => void handleDelete(department.id)}
                        className="rounded-xl bg-rose-500/15 px-2.5 py-1.5 text-xs font-bold text-rose-600 disabled:opacity-50"
                      >
                        {t('teAdmin.partnerDepartments.confirmDelete')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-muted hover:bg-ink/5"
                      >
                        {t('teAdmin.partnerDepartments.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label={t('teAdmin.partnerDepartments.edit')}
                        disabled={!writes.canEdit || isSaving}
                        onClick={() => beginEdit(department)}
                        className="rounded-xl p-2 text-muted hover:bg-brand/10 hover:text-brand disabled:opacity-40"
                      >
                        <PencilIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={t('teAdmin.partnerDepartments.delete')}
                        disabled={!writes.canDelete || isSaving}
                        onClick={() => {
                          setConfirmDeleteId(department.id)
                          setEditingId(null)
                        }}
                        className="rounded-xl p-2 text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-40"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted">
          {t('teAdmin.partnerDepartments.count', { count: filteredDepartments.length })}
        </p>
        <PaginationStrip
          currentPage={currentPage}
          totalPages={totalPages}
          onGoToPage={setPage}
          disabled={loading}
        />
      </div>
    </div>
  )
}
