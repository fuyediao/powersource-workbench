/**
 * Admin CRM customers list pane (web columns + toolbar filters).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { CountryFlag } from '@/components/common/country-flag'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import {
  CUSTOMER_CHANNEL_VALUES,
  CUSTOMER_SOURCE_VALUES,
  isCustomerChannelSlug,
  isCustomerSourceSlug,
} from '@/constants/customer-options'
import {
  CUSTOMER_LEVEL_VALUES,
  getCustomerLevelBadgeClass,
} from '@/constants/customer-levels'
import { CUSTOMER_TYPE_VALUES, isCustomerTypeSlug } from '@/constants/customer-types'
import {
  isUnitedStatesCountryFilter,
  usStateOptionsForRegion,
  type UsRegionFilter,
} from '@/constants/us-east-west-regions'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  CUSTOMERS_PAGE_SIZE,
  deleteCustomer,
  isCustomerDeleteDependencyError,
  listCustomers,
} from '@/services/customers-api'
import {
  fetchCurrentGroup,
  fetchProfileSnippets,
  listGroups,
  type GroupRecord,
  type ProfileSnippet,
} from '@/services/groups-api'
import type {
  CustomerListFilters,
  CustomerListItem,
} from '@/types/customer'
import { getCountryDisplayName, countryMatchesSearch } from '@/utils/map/country-alpha2'

interface CustomersPaneProps {
  userId: string
  writes: AdminShellWrites | null
  /** Shell path navigation (create / detail). */
  onNavigate: (path: string) => void
}

const EMPTY_FILTERS: CustomerListFilters = {
  customerType: '',
  country: '',
  usRegion: '',
  usState: '',
  channel: '',
  level: '',
  source: '',
  filterGroupId: null,
}

/** localStorage key for customers list `created_at` sort direction. */
const CUSTOMERS_SORT_ASC_KEY = 'geocrm-electron-customers-sort-ascending'

/** localStorage key for customers list toolbar filters. */
const CUSTOMERS_FILTERS_KEY = 'geocrm-electron-customers-filters'

/**
 * Reads cached sort direction (ascending = oldest created first).
 * @returns True when ascending; default false (newest first).
 */
function readCustomersSortAscending(): boolean {
  try {
    return localStorage.getItem(CUSTOMERS_SORT_ASC_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Persists sort direction to localStorage.
 * @param ascending - True when oldest created first.
 * @returns Nothing.
 */
function writeCustomersSortAscending(ascending: boolean): void {
  try {
    localStorage.setItem(CUSTOMERS_SORT_ASC_KEY, ascending ? '1' : '0')
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Sanitizes a cached filter payload into a safe {@link CustomerListFilters}.
 * @param raw - Parsed JSON value.
 * @returns Normalized filters.
 */
function sanitizeCustomersFilters(raw: unknown): CustomerListFilters {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_FILTERS }
  }
  const input = raw as Partial<CustomerListFilters>
  const country = typeof input.country === 'string' ? input.country : ''
  let usRegion: CustomerListFilters['usRegion'] = ''
  if (input.usRegion === 'west' || input.usRegion === 'east') {
    usRegion = input.usRegion
  }
  let usState = typeof input.usState === 'string' ? input.usState : ''
  if (!isUnitedStatesCountryFilter(country)) {
    usRegion = ''
    usState = ''
  } else if (usRegion === 'west' || usRegion === 'east') {
    const allowed = new Set(usStateOptionsForRegion(usRegion).map((row) => row.code))
    if (usState && !allowed.has(usState.toUpperCase())) {
      usState = ''
    }
  } else {
    usState = ''
  }
  const filterGroupId =
    typeof input.filterGroupId === 'string' && input.filterGroupId.trim()
      ? input.filterGroupId.trim()
      : null
  return {
    customerType: typeof input.customerType === 'string' ? input.customerType : '',
    country,
    usRegion,
    usState,
    channel: typeof input.channel === 'string' ? input.channel : '',
    level: typeof input.level === 'string' ? input.level : '',
    source: typeof input.source === 'string' ? input.source : '',
    filterGroupId,
  }
}

/**
 * Reads cached customers toolbar filters.
 * @returns Sanitized filters (defaults when missing/invalid).
 */
function readCustomersFilters(): CustomerListFilters {
  try {
    const raw = localStorage.getItem(CUSTOMERS_FILTERS_KEY)
    if (!raw) {
      return { ...EMPTY_FILTERS }
    }
    return sanitizeCustomersFilters(JSON.parse(raw) as unknown)
  } catch {
    return { ...EMPTY_FILTERS }
  }
}

/**
 * Persists customers toolbar filters to localStorage.
 * @param filters - Current filters.
 * @returns Nothing.
 */
function writeCustomersFilters(filters: CustomerListFilters): void {
  try {
    localStorage.setItem(CUSTOMERS_FILTERS_KEY, JSON.stringify(filters))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Admin customers list with desktop write gates and web-parity columns/filters.
 * @param props - User id, write flags, and navigation.
 * @returns List UI.
 */
export function CustomersPane({ userId, writes, onNavigate }: CustomersPaneProps) {
  const { t, i18n } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const [rows, setRows] = useState<CustomerListItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<CustomerListFilters>(readCustomersFilters)
  const [sortAscending, setSortAscending] = useState(readCustomersSortAscending)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const groupIdRef = useRef<string | null>(null)
  const groupsLoadedRef = useRef(false)
  const [ownerLabels, setOwnerLabels] = useState<Map<string, string>>(new Map())
  const [deleteTarget, setDeleteTarget] = useState<CustomerListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deletePresence = useDialogPresence(deleteTarget !== null, 200)
  const searchTimer = useRef<number | null>(null)
  const loadSerial = useRef(0)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMERS_PAGE_SIZE))
  const canGoPrev = page > 1 && !loading
  const canGoNext = page < totalPages && !loading
  const showUsRegion = isUnitedStatesCountryFilter(filters.country)
  const localeTag = i18n.language
  const pageEnterClass =
    enterDirection === 'prev' ? 'admin-list-page-enter-prev' : 'admin-list-page-enter-next'

  /**
   * Moves to a page and records enter animation direction.
   * @param nextPage - Target page (1-based).
   * @param direction - Optional override for row pull-in side.
   * @returns Nothing.
   */
  const goToPage = useCallback(
    (nextPage: number, direction?: PageSwipeDirection): void => {
      setPage((current) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage))
        if (clamped === current) {
          return current
        }
        setEnterDirection(direction ?? (clamped > current ? 'next' : 'prev'))
        // Lock controls immediately so a second click cannot advance again
        // before the in-flight reload sets loading.
        setLoading(true)
        return clamped
      })
    },
    [totalPages],
  )

  /**
   * Handles a committed horizontal page swipe.
   * @param direction - Swipe direction.
   * @returns Nothing.
   */
  const handlePageSwipe = useCallback(
    (direction: PageSwipeDirection): void => {
      setEnterDirection(direction)
      setPage((current) => {
        const clamped =
          direction === 'next'
            ? Math.min(totalPages, current + 1)
            : Math.max(1, current - 1)
        if (clamped === current) {
          return current
        }
        setLoading(true)
        return clamped
      })
    },
    [totalPages],
  )

  const { dragOffset, swiping, pointerHandlers } = useHorizontalPageSwipe({
    canGoPrev,
    canGoNext,
    scrollRef: listScrollRef,
    enabled: deleteTarget === null && !loading,
    onPageSwipe: handlePageSwipe,
  })

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * CUSTOMERS_PAGE_SIZE + 1
    const to = Math.min(page * CUSTOMERS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const hasActiveFilters = Boolean(
    searchQuery ||
      filters.customerType ||
      filters.country ||
      filters.usRegion ||
      filters.usState ||
      filters.channel ||
      filters.level ||
      filters.source ||
      filters.filterGroupId,
  )

  /**
   * Patches one toolbar filter and resets to page 1.
   * @param patch - Partial filter update.
   * @returns Nothing.
   */
  function patchFilters(patch: Partial<CustomerListFilters>): void {
    setEnterDirection('next')
    setLoading(true)
    setPage(1)
    setFilters((current) => {
      const next = { ...current, ...patch }
      if (patch.country !== undefined && !isUnitedStatesCountryFilter(patch.country)) {
        next.usRegion = ''
        next.usState = ''
      }
      if (patch.usRegion !== undefined) {
        const region = patch.usRegion
        if (region !== 'west' && region !== 'east') {
          next.usState = ''
        } else if (next.usState) {
          const allowed = new Set(
            usStateOptionsForRegion(region).map((row) => row.code),
          )
          if (!allowed.has(next.usState.toUpperCase())) {
            next.usState = ''
          }
        }
      }
      writeCustomersFilters(next)
      return next
    })
  }

  /**
   * Loads the current page from Supabase.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      let resolvedGroupId = groupIdRef.current
      if (!resolvedGroupId) {
        const group = await fetchCurrentGroup(userId)
        if (serial !== loadSerial.current) {
          return
        }
        resolvedGroupId = group?.id ?? null
        groupIdRef.current = resolvedGroupId
        setGroupId(resolvedGroupId)
      }
      if (domainWrites.isSystemAdmin && !groupsLoadedRef.current) {
        const allGroups = await listGroups()
        if (serial !== loadSerial.current) {
          return
        }
        setGroups(allGroups)
        groupsLoadedRef.current = true
      }
      const result = await listCustomers({
        page,
        pageSize: CUSTOMERS_PAGE_SIZE,
        searchQuery,
        groupId: resolvedGroupId,
        isSystemAdmin: domainWrites.isSystemAdmin,
        filters,
        sortAscending,
      })
      if (serial !== loadSerial.current) {
        return
      }
      setRows(result.rows)
      setTotalCount(result.totalCount)

      const ownerIds = [
        ...new Set(
          result.rows
            .map((row) => row.ownerUserId)
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      if (ownerIds.length > 0) {
        const profiles = await fetchProfileSnippets(ownerIds)
        if (serial !== loadSerial.current) {
          return
        }
        const labels = new Map<string, string>()
        for (const [id, profile] of profiles) {
          labels.set(id, profileDisplayName(profile))
        }
        setOwnerLabels(labels)
      } else {
        setOwnerLabels(new Map())
      }
    } catch (err) {
      console.error('[CustomersPane] reload:', err)
      if (serial === loadSerial.current) {
        setListError(t('admin.customers.errorLoad'))
        setRows([])
        setTotalCount(0)
      }
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [domainWrites.isSystemAdmin, filters, page, searchQuery, sortAscending, t, userId])

  /**
   * Toggles `created_at` sort direction, caches it, and reloads from page 1.
   * @returns Nothing.
   */
  function toggleSortOrder(): void {
    setSortAscending((prev) => {
      const next = !prev
      writeCustomersSortAscending(next)
      return next
    })
    setEnterDirection('next')
    setLoading(true)
    setPage(1)
  }

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (domainWrites.isSystemAdmin || !filters.filterGroupId) {
      return
    }
    setFilters((current) => {
      if (!current.filterGroupId) {
        return current
      }
      const next = { ...current, filterGroupId: null }
      writeCustomersFilters(next)
      return next
    })
  }, [domainWrites.isSystemAdmin, filters.filterGroupId])

  useEffect(() => {
    if (searchTimer.current !== null) {
      window.clearTimeout(searchTimer.current)
    }
    searchTimer.current = window.setTimeout(() => {
      setEnterDirection('next')
      setLoading(true)
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 300)
    return () => {
      if (searchTimer.current !== null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [searchInput])

  /**
   * Opens the create page when insert is allowed.
   * @returns Nothing.
   */
  function openCreate(): void {
    if (!canCreate) {
      return
    }
    onNavigate('/admin/customers/new')
  }

  /**
   * Opens the customer detail page (read-only; edit is in-place on detail).
   * @param row - Customer to open.
   * @returns Nothing.
   */
  function openDetail(row: CustomerListItem): void {
    onNavigate(`/admin/customers/${row.id}`)
  }

  /**
   * Deletes the confirmed customer when delete is allowed.
   * @returns Nothing.
   */
  async function handleDeleteConfirm(): Promise<void> {
    if (!deleteTarget || !canDelete) {
      return
    }
    if (!domainWrites.isSystemAdmin && deleteTarget.groupId !== groupId) {
      setListError(t('admin.customers.errorDeleteNoPermission'))
      setDeleteTarget(null)
      return
    }
    setDeleting(true)
    try {
      await deleteCustomer(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[CustomersPane] delete:', err)
      setListError(
        isCustomerDeleteDependencyError(err)
          ? t('admin.customers.errorDeleteHasDependencies')
          : t('admin.customers.errorDeleteFailed'),
      )
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  /**
   * Resolves a customer type label.
   * @param slug - Stored type.
   * @returns Display label.
   */
  function typeLabel(slug: string | null): string {
    if (!slug) {
      return '—'
    }
    if (isCustomerTypeSlug(slug)) {
      return t(`admin.customers.customerType.${slug}`)
    }
    return slug
  }

  /**
   * Resolves channel label.
   * @param slug - Stored channel.
   * @returns Display label.
   */
  function channelLabel(slug: string | null): string {
    if (!slug) {
      return '—'
    }
    if (isCustomerChannelSlug(slug)) {
      return t(`admin.customers.customerChannel.${slug}`)
    }
    return slug
  }

  /**
   * Resolves source label.
   * @param slug - Stored source.
   * @returns Display label.
   */
  function sourceLabel(slug: string | null): string {
    if (!slug) {
      return '—'
    }
    if (isCustomerSourceSlug(slug)) {
      return t(`admin.customers.customerSource.${slug}`)
    }
    return slug
  }

  /**
   * Owner display name for a row.
   * @param row - Customer row.
   * @returns Label or em dash.
   */
  function ownerLabel(row: CustomerListItem): string {
    if (!row.ownerUserId) {
      return '—'
    }
    return ownerLabels.get(row.ownerUserId) ?? '—'
  }

  const groupFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllGroups') },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups, t],
  )

  const typeFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAll') },
      { value: '__empty__', label: t('admin.customers.filterNoCustomerType') },
      ...CUSTOMER_TYPE_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerType.${slug}`),
      })),
    ],
    [t],
  )

  const countryFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllCountries') },
      { value: '__empty__', label: t('admin.customers.filterNoCountry') },
      ...COUNTRY_OPTIONS.map((name) => ({
        value: name,
        label: getCountryDisplayName(name, localeTag),
      })),
    ],
    [localeTag, t],
  )

  const usRegionFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllUsRegion') },
      { value: 'west', label: t('admin.customers.filterUsRegionWest') },
      { value: 'east', label: t('admin.customers.filterUsRegionEast') },
    ],
    [t],
  )

  const showUsState =
    showUsRegion && (filters.usRegion === 'west' || filters.usRegion === 'east')

  const usStateFilterOptions = useMemo(() => {
    if (filters.usRegion !== 'west' && filters.usRegion !== 'east') {
      return [{ value: '', label: t('admin.customers.filterAllUsStates') }]
    }
    return [
      { value: '', label: t('admin.customers.filterAllUsStates') },
      ...usStateOptionsForRegion(filters.usRegion).map((row) => ({
        value: row.code,
        label: `${row.name} (${row.code})`,
      })),
    ]
  }, [filters.usRegion, t])

  const channelFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllChannel') },
      ...CUSTOMER_CHANNEL_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerChannel.${slug}`),
      })),
    ],
    [t],
  )

  const levelFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllLevel') },
      ...CUSTOMER_LEVEL_VALUES.map((lvl) => ({ value: lvl, label: lvl })),
    ],
    [t],
  )

  const sourceFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllSource') },
      ...CUSTOMER_SOURCE_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerSource.${slug}`),
      })),
    ],
    [t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 text-xl font-extrabold text-brand">
          {t('admin.customers.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={
              sortAscending
                ? t('admin.customers.sortOldestFirst')
                : t('admin.customers.sortNewestFirst')
            }
            aria-label={
              sortAscending
                ? t('admin.customers.sortOldestFirst')
                : t('admin.customers.sortNewestFirst')
            }
            aria-pressed={sortAscending}
            onClick={toggleSortOrder}
            disabled={loading}
          >
            <SortIcon
              className={`size-4 transition-transform ${sortAscending ? 'rotate-180' : ''}`}
              aria-hidden
            />
            <span className="hidden sm:inline">
              {sortAscending
                ? t('admin.customers.sortOldestFirst')
                : t('admin.customers.sortNewestFirst')}
            </span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            onClick={() => void reload()}
            disabled={loading}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin.customers.refresh')}
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={openCreate}
            >
              <PlusIcon className="size-4" />
              {t('admin.customers.addButton')}
            </button>
          ) : null}
        </div>
      </div>

      {writes?.readOnly ? (
        <p className="text-sm font-semibold text-muted">{t('admin.moduleAccess.readOnly')}</p>
      ) : null}

      <div className="mb-0 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 min-[1980px]:flex-row">
          <div className="relative w-full max-w-sm min-[1980px]:max-w-md min-[1980px]:flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2.5 pr-3 pl-9 text-sm font-medium text-ink outline-none focus:border-brand dark:bg-white/5"
              value={searchInput}
              placeholder={t('admin.customers.searchPlaceholder')}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <div className="flex min-w-0 w-full flex-wrap items-center gap-2 min-[1980px]:w-auto min-[1980px]:flex-1">
            {domainWrites.isSystemAdmin ? (
              <CrmFilterSelect
                className="min-w-36 max-w-52 shrink-0"
                value={filters.filterGroupId ?? ''}
                options={groupFilterOptions}
                ariaLabel={t('admin.customers.filterAllGroups')}
                onChange={(next) =>
                  patchFilters({ filterGroupId: next ? next : null })
                }
              />
            ) : null}
            <CrmFilterSelect
              className="min-w-36 max-w-52 shrink-0"
              value={filters.customerType}
              options={typeFilterOptions}
              ariaLabel={t('admin.customers.filterAll')}
              onChange={(next) => patchFilters({ customerType: next })}
            />
            <CrmFilterSelect
              className="min-w-36 max-w-56 shrink-0"
              value={filters.country}
              options={countryFilterOptions}
              searchable
              searchPlaceholder={t('admin.customers.countrySearchPlaceholder')}
              closeAriaLabel={t('common.inlineSearchComboboxClose')}
              emptyLabel={t('admin.customers.noMatchingCountries')}
              ariaLabel={t('admin.customers.filterAllCountries')}
              renderLeading={(option) =>
                option.value && option.value !== '__empty__' ? (
                  <CountryFlag countryName={option.value} size={16} />
                ) : null
              }
              filterOption={(option, query) =>
                countryMatchesSearch(option.value, query) ||
                option.label.toLowerCase().includes(query.toLowerCase())
              }
              onChange={(next) => patchFilters({ country: next })}
            />
            {showUsRegion ? (
              <CrmFilterSelect
                className="min-w-32 max-w-44 shrink-0"
                value={filters.usRegion}
                options={usRegionFilterOptions}
                ariaLabel={t('admin.customers.filterAllUsRegion')}
                onChange={(next) =>
                  patchFilters({ usRegion: next as '' | UsRegionFilter })
                }
              />
            ) : null}
            {showUsState ? (
              <CrmFilterSelect
                className="min-w-40 max-w-56 shrink-0"
                value={filters.usState}
                options={usStateFilterOptions}
                searchable
                searchPlaceholder={t('admin.customers.usStateSearchPlaceholder')}
                closeAriaLabel={t('common.inlineSearchComboboxClose')}
                ariaLabel={t('admin.customers.filterAllUsStates')}
                onChange={(next) => patchFilters({ usState: next })}
              />
            ) : null}
            <CrmFilterSelect
              className="min-w-32 max-w-52 shrink-0"
              value={filters.channel}
              options={channelFilterOptions}
              ariaLabel={t('admin.customers.filterAllChannel')}
              onChange={(next) => patchFilters({ channel: next })}
            />
            <CrmFilterSelect
              className="min-w-28 max-w-40 shrink-0"
              value={filters.level}
              options={levelFilterOptions}
              ariaLabel={t('admin.customers.filterAllLevel')}
              onChange={(next) => patchFilters({ level: next })}
            />
            <CrmFilterSelect
              className="min-w-32 max-w-52 shrink-0"
              value={filters.source}
              options={sourceFilterOptions}
              ariaLabel={t('admin.customers.filterAllSource')}
              onChange={(next) => patchFilters({ source: next })}
            />
          </div>
        </div>
        <p className="shrink-0 self-start text-right text-sm font-medium text-muted">
          {rangeLabel}
        </p>
      </div>

      {listError ? (
        <p className="text-sm font-medium text-rose-500">{listError}</p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.customers.listRegionAria')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        <table
          className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[64rem] border-collapse text-left text-sm ${
            swiping || loading ? 'admin-list-transition-disabled' : ''
          }`}
          style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
        >
          <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
            <tr>
              <th className="px-4 py-3">{t('admin.customers.col.customerCode')}</th>
              <th className="px-4 py-3">{t('admin.customers.col.company')}</th>
              <th className="px-4 py-3">{t('admin.customers.col.owner')}</th>
              <th className="px-4 py-3">{t('admin.customers.col.customerType')}</th>
              <th className="px-4 py-3">{t('admin.customers.form.customerChannel')}</th>
              <th className="px-4 py-3">{t('admin.customers.form.customerLevel')}</th>
              <th className="px-4 py-3">{t('admin.customers.form.customerSource')}</th>
              <th className="px-4 py-3">{t('admin.customers.col.category')}</th>
              <th className="px-4 py-3">{t('admin.customers.col.country')}</th>
              <th className="px-4 py-3 text-right">{t('admin.customers.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-muted">
                  {t('status.loading')}
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-muted">
                  {hasActiveFilters
                    ? t('admin.customers.noResults')
                    : t('admin.customers.empty')}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                onClick={() => openDetail(row)}
              >
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {row.customerCode || '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-brand">{row.companyName}</td>
                <td className="px-4 py-3 text-ink">{ownerLabel(row)}</td>
                <td className="px-4 py-3 text-ink">{typeLabel(row.customerType)}</td>
                <td className="px-4 py-3 text-ink">{channelLabel(row.customerChannel)}</td>
                <td className="px-4 py-3">
                  {row.customerLevel ? (
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${getCustomerLevelBadgeClass(row.customerLevel)}`}
                    >
                      {row.customerLevel}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink">{sourceLabel(row.customerSource)}</td>
                <td className="px-4 py-3 text-ink">{row.category || '—'}</td>
                <td className="px-4 py-3">
                  {row.companyCountry ? (
                    <span
                      className="inline-flex items-center gap-1.5"
                      title={getCountryDisplayName(row.companyCountry, localeTag)}
                    >
                      <CountryFlag countryName={row.companyCountry} size={18} />
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td
                  className="px-4 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1">
                    {canDelete ? (
                      <button
                        type="button"
                        className="rounded-xl p-2 text-rose-500 hover:bg-rose-500/10"
                        title={t('admin.customers.deleteButton')}
                        aria-label={t('admin.customers.deleteButton')}
                        onClick={() => setDeleteTarget(row)}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationStrip
        currentPage={page}
        totalPages={totalPages}
        disabled={loading}
        onGoToPage={(nextPage) =>
          goToPage(nextPage, nextPage > page ? 'next' : 'prev')
        }
      />

      {deletePresence.mounted && deleteTarget ? (
        <div
          className={`fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/50 p-4 ${
            deletePresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={() => {
            if (!deleting) {
              setDeleteTarget(null)
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-bold text-brand">
              {t('admin.customers.deleteConfirm.title')}
            </p>
            <p className="mt-1.5 text-sm text-muted">
              {t('admin.customers.deleteConfirm.message')}
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">{deleteTarget.companyName}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={deleting}
                className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                onClick={() => void handleDeleteConfirm()}
              >
                {deleting
                  ? t('admin.customers.deleteConfirm.deleting')
                  : t('admin.customers.deleteConfirm.confirm')}
              </button>
              <button
                type="button"
                disabled={deleting}
                className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={() => setDeleteTarget(null)}
              >
                {t('admin.customers.deleteConfirm.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Human-readable profile label for owner column.
 * @param profile - Profile snippet.
 * @returns Display name.
 */
function profileDisplayName(profile: ProfileSnippet): string {
  return (
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    profile.email?.trim() ||
    profile.employee_id?.trim() ||
    profile.id.slice(0, 8)
  )
}
