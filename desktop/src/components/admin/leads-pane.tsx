/**
 * Admin Leads list pane (web LeadsTableView parity): left-rail VIEW / STATUS
 * filters, search, claim / release, link / unlink customer, and group-directory
 * view for group / system admins.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { LEAD_STATUS_VALUES, type Lead, type LeadListScopeFilter } from '@/types/lead'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  CloseIcon,
  LucideListChecksIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  listCustomerPickerOptions,
  type CustomerPickerOption,
} from '@/services/customers-api'
import {
  fetchGroupMembers,
  listGroups,
  type GroupMemberRecord,
  type GroupRecord,
} from '@/services/groups-api'
import {
  claimLead,
  deleteLead,
  LEADS_PAGE_SIZE,
  listLeads,
  listLeadsForGroupMemberOwners,
  releaseLead,
  updateLeadCustomerId,
} from '@/services/leads-api'
import { leadCreatePath, leadDetailPath } from '@/utils/lead-routes'

interface LeadsPaneProps {
  userId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/** Left-rail filter: pool view, group directory, or pipeline status. */
type SidebarFilter = LeadListScopeFilter | 'groupIn'

const SIDEBAR_POOL_FILTERS = ['all', 'public', 'mine'] as const satisfies readonly SidebarFilter[]

/**
 * Active vs idle classes for a left-rail filter button (T&E applications rail).
 * @param active - Whether this option is selected.
 * @returns Class string.
 */
function sidebarItemClass(active: boolean): string {
  return `flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
    active
      ? 'border-brand/50 bg-brand/10 text-brand'
      : 'border-transparent text-ink hover:bg-brand/5'
  }`
}

/**
 * Tailwind color classes for a lead status badge.
 * @param status - Lead pipeline status.
 * @returns Class string.
 */
function statusBadgeClass(status: Lead['status']): string {
  switch (status) {
    case 'unhandled':
      return 'bg-zinc-500/15 text-zinc-500'
    case 'following_up':
      return 'bg-blue-500/15 text-blue-500'
    case 'qualified':
      return 'bg-emerald-500/15 text-emerald-500'
    case 'disqualified':
      return 'bg-rose-500/15 text-rose-500'
    default:
      return 'bg-zinc-500/15 text-zinc-500'
  }
}

/**
 * Lead-name column value from scalar `extendedFields.leadName`.
 * @param lead - List row.
 * @returns Trimmed name, or em dash when empty.
 */
function getLeadNameForColumn(lead: Lead): string {
  const leadName = lead.extendedFields.leadName
  if (typeof leadName !== 'string') {
    return '—'
  }
  const trimmed = leadName.trim()
  return trimmed || '—'
}

/**
 * Leads list with pool scope filter, search, and claim/release actions.
 * @param props - Current user, shell writes, and navigation.
 * @returns List UI.
 */
export function LeadsPane({ userId, writes, onNavigate }: LeadsPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)
  const canViewGroupDirectory = domainWrites.isGroupAdmin || domainWrites.isSystemAdmin

  const [rows, setRows] = useState<Lead[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [scopeFilter, setScopeFilter] = useState<SidebarFilter>('all')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [releasingId, setReleasingId] = useState<string | null>(null)
  const [customers, setCustomers] = useState<CustomerPickerOption[]>([])
  const [linkingLead, setLinkingLead] = useState<Lead | null>(null)
  const [linkCustomerSearch, setLinkCustomerSearch] = useState('')
  const [linking, setLinking] = useState(false)
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
  const deletePresence = useDialogPresence(Boolean(deleteTarget))
  const linkPresence = useDialogPresence(Boolean(linkingLead))

  // Group-directory tab (system / group admins): loaded on demand, paged client-side.
  const [groupDirectoryLeads, setGroupDirectoryLeads] = useState<Lead[]>([])
  const [groupDirectoryLoading, setGroupDirectoryLoading] = useState(false)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [groupMembers, setGroupMembers] = useState<GroupMemberRecord[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const groupsLoadedRef = useRef(false)

  const loadSerial = useRef(0)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const isGroupDirectory = scopeFilter === 'groupIn'
  const groupSearchFiltered = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) {
      return groupDirectoryLeads
    }
    return groupDirectoryLeads.filter(
      (lead) =>
        lead.companyName.toLowerCase().includes(q) ||
        getLeadNameForColumn(lead).toLowerCase().includes(q) ||
        (lead.contactName ?? '').toLowerCase().includes(q) ||
        (lead.phone ?? '').toLowerCase().includes(q) ||
        (lead.email ?? '').toLowerCase().includes(q),
    )
  }, [groupDirectoryLeads, searchInput])
  const totalPages = isGroupDirectory
    ? Math.max(1, Math.ceil(groupSearchFiltered.length / LEADS_PAGE_SIZE))
    : Math.max(1, Math.ceil(totalCount / LEADS_PAGE_SIZE))
  const visibleRows = isGroupDirectory
    ? groupSearchFiltered.slice((page - 1) * LEADS_PAGE_SIZE, page * LEADS_PAGE_SIZE)
    : rows
  const visibleTotalCount = isGroupDirectory ? groupSearchFiltered.length : totalCount
  const isListLoading = isGroupDirectory ? groupDirectoryLoading : loading

  const rangeLabel = useMemo(() => {
    if (visibleTotalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * LEADS_PAGE_SIZE + 1
    const to = Math.min(page * LEADS_PAGE_SIZE, visibleTotalCount)
    return t('admin.customers.countText', { from, to, total: visibleTotalCount })
  }, [page, t, visibleTotalCount])

  const groupPickerOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  )

  const filteredCustomersForLink = useMemo(() => {
    const q = linkCustomerSearch.trim().toLowerCase()
    if (!q) {
      return customers
    }
    return customers.filter(
      (customer) =>
        customer.companyName.toLowerCase().includes(q) ||
        (customer.contactName ?? '').toLowerCase().includes(q) ||
        (customer.email ?? '').toLowerCase().includes(q),
    )
  }, [customers, linkCustomerSearch])

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

  /**
   * Loads the current page from Supabase (pool/status scopes).
   * @returns Nothing.
   */
  const reload = useCallback(
    async (options?: { page?: number }): Promise<void> => {
      const pageToLoad = options?.page ?? page
      const serial = ++loadSerial.current
      setLoading(true)
      setListError(null)
      try {
        const result = await listLeads({
          page: pageToLoad,
          pageSize: LEADS_PAGE_SIZE,
          searchQuery,
          scope: scopeFilter === 'groupIn' ? 'all' : scopeFilter,
          userId,
        })
        if (serial !== loadSerial.current) {
          return
        }
        setRows(result.rows)
        setTotalCount(result.totalCount)
      } catch (err) {
        if (serial !== loadSerial.current) {
          return
        }
        console.error('[LeadsPane] load:', err)
        setListError(t('admin.leadsTable.error.load'))
        setRows([])
        setTotalCount(0)
      } finally {
        if (serial === loadSerial.current) {
          setLoading(false)
        }
      }
    },
    [page, scopeFilter, searchQuery, t, userId],
  )

  /**
   * Loads the group-directory tab: members of the target group, then their leads.
   * @param groupId - Target group id.
   * @returns Nothing.
   */
  const loadGroupDirectory = useCallback(
    async (groupId: string): Promise<void> => {
      setGroupDirectoryLoading(true)
      setListError(null)
      try {
        const members = await fetchGroupMembers(groupId)
        const memberIds = members.map((member) => member.userId)
        const leads = await listLeadsForGroupMemberOwners(memberIds)
        setGroupMembers(members)
        setGroupDirectoryLeads(leads)
      } catch (err) {
        console.error('[LeadsPane] loadGroupDirectory:', err)
        setListError(t('admin.leadsTable.error.load'))
        setGroupMembers([])
        setGroupDirectoryLeads([])
      } finally {
        setGroupDirectoryLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (scopeFilter !== 'groupIn') {
      void reload()
    }
  }, [reload, scopeFilter])

  useEffect(() => {
    if (scopeFilter !== 'groupIn') {
      return
    }
    let cancelled = false
    async function init(): Promise<void> {
      if (domainWrites.isSystemAdmin && !groupsLoadedRef.current) {
        groupsLoadedRef.current = true
        try {
          const allGroups = await listGroups()
          if (cancelled) {
            return
          }
          setGroups(allGroups)
          const preferred =
            selectedGroupId && allGroups.some((group) => group.id === selectedGroupId)
              ? selectedGroupId
              : domainWrites.groupId &&
                  allGroups.some((group) => group.id === domainWrites.groupId)
                ? domainWrites.groupId
                : allGroups[0]?.id ?? null
          setSelectedGroupId(preferred)
          if (preferred) {
            await loadGroupDirectory(preferred)
          }
          return
        } catch (err) {
          console.error('[LeadsPane] listGroups:', err)
        }
      }
      const targetGroupId = selectedGroupId ?? domainWrites.groupId
      if (targetGroupId) {
        if (!selectedGroupId) {
          setSelectedGroupId(targetGroupId)
        }
        await loadGroupDirectory(targetGroupId)
      }
    }
    void init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFilter])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void listCustomerPickerOptions({
      isSystemAdmin: domainWrites.isSystemAdmin,
      groupId: domainWrites.groupId,
    })
      .then((rows) => {
        if (!cancelled) {
          setCustomers(rows)
        }
      })
      .catch((err) => {
        console.error('[LeadsPane] listCustomerPickerOptions:', err)
      })
    return () => {
      cancelled = true
    }
  }, [domainWrites.groupId, domainWrites.isSystemAdmin])

  /**
   * Debounces search input into the committed query.
   * @param value - Raw input.
   * @returns Nothing.
   */
  function onSearchChange(value: string): void {
    setSearchInput(value)
    if (scopeFilter === 'groupIn') {
      setEnterDirection('next')
      setPage(1)
      return
    }
    if (searchTimer.current != null) {
      window.clearTimeout(searchTimer.current)
    }
    searchTimer.current = window.setTimeout(() => {
      setEnterDirection('next')
      setPage(1)
      setSearchQuery(value.trim())
    }, 300)
  }

  /**
   * Count badge for a rail option. Vue only fills the active pool/status
   * filter (server `totalCount`); group directory uses the loaded list length.
   * @param target - Rail option.
   * @returns Count shown beside the label.
   */
  function countLeadsForFilter(target: SidebarFilter): number {
    if (target === 'groupIn') {
      return groupDirectoryLeads.length
    }
    if (scopeFilter === target) {
      return totalCount
    }
    return 0
  }

  /**
   * Owner label for the group-directory column.
   * @param ownerId - Lead owner uuid.
   * @returns Display name, email, or short id.
   */
  function ownerDisplayLabel(ownerId: string | null): string {
    if (!ownerId) {
      return '—'
    }
    const member = groupMembers.find((row) => row.userId === ownerId)
    const user = member?.user
    const name = user?.display_name?.trim() || user?.full_name?.trim() || user?.email?.trim()
    if (name) {
      return name
    }
    return `${ownerId.slice(0, 8)}…`
  }

  /**
   * Switches the sidebar scope and resets to page 1.
   * @param next - Target scope.
   * @returns Nothing.
   */
  function changeScope(next: SidebarFilter): void {
    setEnterDirection('next')
    setPage(1)
    setScopeFilter(next)
  }

  /**
   * Navigates to a page with enter animation direction.
   * @param nextPage - Target page.
   * @param direction - Slide direction.
   * @returns Nothing.
   */
  function goToPage(nextPage: number, direction: PageSwipeDirection): void {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page || isListLoading) {
      return
    }
    setEnterDirection(direction)
    setPage(nextPage)
  }

  /**
   * Handles horizontal swipe between pages.
   * @param direction - Swipe direction.
   * @returns Nothing.
   */
  function handlePageSwipe(direction: PageSwipeDirection): void {
    if (direction === 'next') {
      goToPage(page + 1, 'next')
    } else {
      goToPage(page - 1, 'prev')
    }
  }

  const { swiping, dragOffset, pointerHandlers } = useHorizontalPageSwipe({
    canGoPrev: page > 1,
    canGoNext: page < totalPages,
    scrollRef: listScrollRef,
    enabled: !isListLoading,
    onPageSwipe: handlePageSwipe,
  })

  /**
   * Claims a public-pool lead for the current user.
   * @param leadId - Lead uuid.
   * @returns Nothing.
   */
  async function handleClaim(leadId: string): Promise<void> {
    setClaimingId(leadId)
    try {
      await claimLead(leadId, userId)
      await reload()
    } catch (err) {
      console.error('[LeadsPane] claim:', err)
      setListError(t('admin.leadsTable.error.claim'))
    } finally {
      setClaimingId(null)
    }
  }

  /**
   * Releases an owned lead back to the public pool.
   * @param leadId - Lead uuid.
   * @returns Nothing.
   */
  async function handleRelease(leadId: string): Promise<void> {
    setReleasingId(leadId)
    try {
      await releaseLead(leadId, userId)
      await reload()
    } catch (err) {
      console.error('[LeadsPane] release:', err)
      setListError(t('admin.leadsTable.error.release'))
    } finally {
      setReleasingId(null)
    }
  }

  /**
   * Deletes the confirmed lead and reloads the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteLead(deleteTarget.id, userId)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[LeadsPane] delete:', err)
      setListError(t('admin.leadsTable.error.delete'))
    } finally {
      setDeleting(false)
    }
  }

  /**
   * Replaces one lead in both the paged list and the group-directory cache.
   * @param updated - Fresh row from the API.
   */
  function replaceLeadInLists(updated: Lead): void {
    setRows((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
    setGroupDirectoryLeads((prev) =>
      prev.map((row) => (row.id === updated.id ? updated : row)),
    )
  }

  /**
   * Resolves the CRM customer linked to a lead, if loaded.
   * @param lead - List row.
   * @returns Picker option or undefined.
   */
  function getLinkedCustomer(lead: Lead): CustomerPickerOption | undefined {
    return lead.customerId
      ? customers.find((customer) => customer.id === lead.customerId)
      : undefined
  }

  /**
   * Opens the link-customer modal for an owned lead.
   * @param lead - Row to link.
   */
  function openLinkCustomer(lead: Lead): void {
    if (lead.ownerId !== userId) {
      return
    }
    setLinkingLead(lead)
    setLinkCustomerSearch('')
  }

  /**
   * Closes the link-customer modal.
   */
  function closeLinkCustomerModal(): void {
    if (linking) {
      return
    }
    setLinkingLead(null)
    setLinkCustomerSearch('')
  }

  /**
   * Links the modal lead to the selected customer.
   * @param customerId - Customer uuid.
   */
  async function confirmLinkCustomer(customerId: string): Promise<void> {
    const lead = linkingLead
    if (!lead || lead.ownerId !== userId || linking) {
      return
    }
    setLinking(true)
    try {
      const updated = await updateLeadCustomerId(lead.id, userId, customerId)
      replaceLeadInLists(updated)
      setLinkingLead(null)
      setLinkCustomerSearch('')
    } catch (err) {
      console.error('[LeadsPane] linkCustomer:', err)
      setListError(t('admin.leadsTable.error.link'))
    } finally {
      setLinking(false)
    }
  }

  /**
   * Unlinks a lead from its CRM customer.
   * @param lead - Row to unlink.
   */
  async function unlinkCustomer(lead: Lead): Promise<void> {
    if (lead.ownerId !== userId || unlinkingId) {
      return
    }
    setUnlinkingId(lead.id)
    try {
      const updated = await updateLeadCustomerId(lead.id, userId, null)
      replaceLeadInLists(updated)
    } catch (err) {
      console.error('[LeadsPane] unlinkCustomer:', err)
      setListError(t('admin.leadsTable.error.unlink'))
    } finally {
      setUnlinkingId(null)
    }
  }

  const baseListEmpty = isGroupDirectory
    ? groupDirectoryLeads.length === 0
    : totalCount === 0
  const searchActive = isGroupDirectory
    ? Boolean(searchInput.trim())
    : Boolean(searchQuery)
  const emptyFilterOnly =
    !baseListEmpty && isGroupDirectory && groupSearchFiltered.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.leadsTable.sidebar.heading')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.leadsTable.refresh')}
            onClick={() =>
              void (isGroupDirectory
                ? selectedGroupId && loadGroupDirectory(selectedGroupId)
                : reload())
            }
          >
            <RefreshIcon
              className={`size-4 ${isListLoading ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">{t('admin.leadsTable.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={() => onNavigate(leadCreatePath())}
            >
              <PlusIcon className="size-4" />
              <span>{t('admin.leadsTable.add')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white/60 lg:w-56 lg:max-w-60 lg:self-stretch dark:bg-white/5">
          <nav
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3"
            aria-label={t('admin.leadsTable.sidebar.filtersAria')}
          >
            <div>
              <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                {t('admin.leadsTable.sidebar.sectionView')}
              </p>
              <div className="flex flex-col gap-0.5">
                {SIDEBAR_POOL_FILTERS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={sidebarItemClass(scopeFilter === opt)}
                    onClick={() => changeScope(opt)}
                  >
                    <span>{t(`admin.leadsTable.sidebar.filter.${opt}`)}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {countLeadsForFilter(opt)}
                    </span>
                  </button>
                ))}
                {canViewGroupDirectory ? (
                  <button
                    type="button"
                    className={sidebarItemClass(scopeFilter === 'groupIn')}
                    onClick={() => changeScope('groupIn')}
                  >
                    <span>{t('admin.leadsTable.sidebar.filter.groupIn')}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {countLeadsForFilter('groupIn')}
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                {t('admin.leadsTable.sidebar.sectionStatus')}
              </p>
              <div className="flex flex-col gap-0.5">
                {LEAD_STATUS_VALUES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={sidebarItemClass(scopeFilter === status)}
                    onClick={() => changeScope(status)}
                  >
                    <span>{t(`admin.leadsTable.status.${status}`)}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {countLeadsForFilter(status)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-sm flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.leadsTable.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.leadsTable.searchPlaceholder')}
            />
          </div>
          {isGroupDirectory && domainWrites.isSystemAdmin && groupPickerOptions.length > 0 ? (
            <CrmFilterSelect
              className="min-w-36 max-w-52 shrink-0"
              value={selectedGroupId ?? ''}
              options={groupPickerOptions}
              ariaLabel={t('admin.leadsTable.groupSwitcherLabel')}
              onChange={(next) => {
                setSelectedGroupId(next || null)
                setPage(1)
                if (next) {
                  void loadGroupDirectory(next)
                }
              }}
            />
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-medium text-muted">{rangeLabel}</p>
      </div>

      {listError ? (
        <p className="text-sm font-medium text-rose-500">{listError}</p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.leadsTable.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!isListLoading && (baseListEmpty || emptyFilterOnly) ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideListChecksIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {emptyFilterOnly
                ? t('admin.leadsTable.emptyFilter')
                : searchActive
                  ? t('admin.leadsTable.noResults')
                  : t('admin.leadsTable.empty')}
            </p>
          </div>
        ) : (
          <table
            className={`admin-list-rows ${isListLoading ? '' : pageEnterClass} w-full min-w-[40rem] border-collapse text-left text-sm ${
              swiping || isListLoading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
          >
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">{t('admin.leadsTable.col.operation')}</th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {t('admin.leadsTable.col.leadName')}
                </th>
                <th className="px-4 py-3">{t('admin.leadsTable.col.companyName')}</th>
                <th className="px-4 py-3">{t('admin.leadsTable.col.status')}</th>
                {isGroupDirectory ? (
                  <th className="hidden px-4 py-3 md:table-cell">
                    {t('admin.leadsTable.col.owner')}
                  </th>
                ) : null}
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.leadsTable.col.customer')}
                </th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.leadsTable.col.pool')}
                </th>
                <th className="px-4 py-3 text-right">
                  {t('admin.leadsTable.col.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isListLoading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={isGroupDirectory ? 8 : 7} className="px-4 py-12 text-center text-muted">
                    {t('admin.leadsTable.loading')}
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((lead) => {
                const linkedCustomer = getLinkedCustomer(lead)
                return (
                <tr
                  key={lead.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(leadDetailPath(lead.id))}
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {lead.ownerId === null ? (
                      <button
                        type="button"
                        disabled={claimingId === lead.id}
                        className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
                        onClick={() => void handleClaim(lead.id)}
                      >
                        {claimingId === lead.id
                          ? t('admin.leadsTable.claiming')
                          : t('admin.leadsTable.claim')}
                      </button>
                    ) : lead.ownerId === userId ? (
                      <button
                        type="button"
                        disabled={releasingId === lead.id}
                        className="rounded-lg bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/25 disabled:opacity-50"
                        onClick={() => void handleRelease(lead.id)}
                      >
                        {releasingId === lead.id
                          ? t('admin.leadsTable.releasing')
                          : t('admin.leadsTable.release')}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {getLeadNameForColumn(lead)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">
                    {lead.companyName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(lead.status)}`}
                    >
                      {t(`admin.leadsTable.status.${lead.status}`)}
                    </span>
                  </td>
                  {isGroupDirectory ? (
                    <td className="hidden px-4 py-3 text-sm text-ink/80 md:table-cell">
                      {ownerDisplayLabel(lead.ownerId)}
                    </td>
                  ) : null}
                  <td
                    className="hidden px-4 py-3 lg:table-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {linkedCustomer ? (
                      <>
                        <span className="text-ink/80">
                          {linkedCustomer.companyName === lead.companyName
                            ? t('admin.leadsTable.linked')
                            : linkedCustomer.companyName}
                        </span>
                        {lead.ownerId === userId ? (
                          <button
                            type="button"
                            disabled={unlinkingId === lead.id}
                            className="ml-2 text-xs text-muted hover:text-brand disabled:opacity-50"
                            onClick={() => void unlinkCustomer(lead)}
                          >
                            {t('admin.leadsTable.unlinkCustomer')}
                          </button>
                        ) : null}
                      </>
                    ) : lead.ownerId === userId ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-brand hover:text-brand/80"
                        onClick={() => openLinkCustomer(lead)}
                      >
                        {t('admin.leadsTable.linkCustomer')}
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        lead.ownerId === null
                          ? 'bg-zinc-500/15 text-zinc-500'
                          : 'bg-rose-500/15 text-rose-500'
                      }`}
                    >
                      {lead.ownerId === null
                        ? t('admin.leadsTable.poolPublic')
                        : t('admin.leadsTable.poolPrivate')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canDelete && lead.ownerId === userId ? (
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                        title={t('admin.leadsTable.delete')}
                        aria-label={t('admin.leadsTable.delete')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(lead)
                        }}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <PaginationStrip
        currentPage={page}
        totalPages={totalPages}
        disabled={isListLoading}
        onGoToPage={(nextPage) =>
          goToPage(nextPage, nextPage > page ? 'next' : 'prev')
        }
      />
        </div>
      </div>

      {deletePresence.mounted && deleteTarget
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                deletePresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!deleting) {
                  setDeleteTarget(null)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.leadsTable.deleteConfirm.title')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.leadsTable.deleteConfirm.message')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('admin.leadsTable.deleteConfirm.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.leadsTable.deleteConfirm.confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {linkPresence.mounted && linkingLead
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                linkPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              onClick={() => closeLinkCustomerModal()}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="lead-link-customer-title"
                className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
                  <h2
                    id="lead-link-customer-title"
                    className="text-base font-extrabold text-brand"
                  >
                    {t('admin.leadsTable.linkCustomerModal.title')}
                  </h2>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
                    aria-label={t('admin.leadsTable.linkCustomerModal.cancel')}
                    disabled={linking}
                    onClick={() => closeLinkCustomerModal()}
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </div>
                <div className="space-y-3 px-5 py-4">
                  <p className="text-xs font-medium text-muted">
                    {t('admin.leadsTable.linkCustomerModal.leadLabel')}: {linkingLead.companyName}
                  </p>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
                    <input
                      type="search"
                      value={linkCustomerSearch}
                      onChange={(e) => setLinkCustomerSearch(e.target.value)}
                      placeholder={t('admin.leadsTable.linkCustomerModal.searchPlaceholder')}
                      className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
                      aria-label={t('admin.leadsTable.linkCustomerModal.searchPlaceholder')}
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-2xl border border-ink/10 bg-white/50 dark:bg-white/5">
                    {customers.length === 0 ? (
                      <p className="px-4 py-3 text-xs font-medium text-muted">
                        {t('admin.leadsTable.linkCustomerModal.noCustomers')}
                      </p>
                    ) : filteredCustomersForLink.length === 0 ? (
                      <p className="px-4 py-3 text-xs font-medium text-muted">
                        {t('admin.leadsTable.linkCustomerModal.noResults')}
                      </p>
                    ) : (
                      filteredCustomersForLink.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          disabled={linking}
                          className="w-full border-b border-ink/5 px-4 py-2.5 text-left last:border-0 hover:bg-brand/5 disabled:opacity-50"
                          onClick={() => void confirmLinkCustomer(customer.id)}
                        >
                          <span className="block text-sm font-semibold text-ink">
                            {customer.companyName}
                          </span>
                          {customer.contactName ? (
                            <span className="text-xs text-muted">{customer.contactName}</span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex justify-end border-t border-ink/10 px-5 py-4">
                  <button
                    type="button"
                    disabled={linking}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => closeLinkCustomerModal()}
                  >
                    {t('admin.leadsTable.linkCustomerModal.cancel')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
