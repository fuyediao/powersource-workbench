import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fromLoose, type LooseFilterBuilder } from '@/lib/supabase-loose'
import {
  createTeSubmissionsWorkbook,
  teSubmissionsWorkbookFileName,
} from '@/office/te-submissions-workbook'
import { openOfficeDocument } from '@/utils/office/office-document-request'
import { univerLocaleFromAppLanguage } from '@/utils/univer/univer-locale'
import {
  fetchProfileDisplayLabelsByIds,
  fetchTeSubmissionsCount,
  mapTeSubmissionFromRow,
  TE_EMAIL_CATEGORIES,
  teDatabaseStatusCandidates,
  teStatusRequiresLegacyEvidenceFilter,
  type TeEmailCategory,
  type TeStatus,
  type TeSubmission,
} from '@/services/te-submissions-repository'

export type { TeEmailCategory, TeStatus, TeSubmission }
export { fetchTeSubmissionsCount }

const PAGE_SIZE = 20
const COMPAT_STATUS_BATCH_SIZE = 500

/** Per-category submission counts shown in the sidebar. */
export interface TeCategoryCounts {
  all: number
  us_law_enforcement: number
  us_government: number
  popular_provider: number
  other: number
}

/**
 * Build an empty category-count map.
 *
 * @returns Zeroed counts for all and each email category
 */
function emptyCategoryCounts(): TeCategoryCounts {
  return {
    all: 0,
    us_law_enforcement: 0,
    us_government: 0,
    popular_provider: 0,
    other: 0,
  }
}

/**
 * Resolve a stored operator UUID to a CRM profile display name.
 *
 * @param raw - Profile / auth user id, or empty
 * @param labels - Map from id to display name
 * @returns Display name, the original id if unresolved, or empty
 */
function operatorExportLabel(
  raw: string | null | undefined,
  labels: Map<string, string>,
): string {
  const id = raw?.trim() ?? ''
  if (!id) return ''
  return labels.get(id) ?? id
}

/**
 * Collect operator profile ids stored on T&E rows.
 *
 * @param rows - Submissions to scan
 * @returns Unique non-empty operator ids
 */
function collectOperatorIds(rows: readonly TeSubmission[]): string[] {
  const ids = new Set<string>()
  for (const row of rows) {
    for (const value of [
      row.handledByUserId,
      row.approvedProductsConfirmedBy,
      row.returnConfirmedBy,
    ]) {
      const id = value?.trim() ?? ''
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

/**
 * Convert a T&E submission into a flat CSV row.
 *
 * @param submission - Submission to serialize
 * @param labels - Profile display names for operator UUID columns
 * @returns Values aligned with {@link CSV_HEADERS}
 */
export function submissionToCsvRow(
  submission: TeSubmission,
  labels: Map<string, string> = new Map(),
): string[] {
  const handledBy =
    submission.handledBy?.trim() ||
    operatorExportLabel(submission.handledByUserId, labels)
  return [
    submission.id,
    submission.createdAt,
    submission.status,
    submission.legacyStatus ?? '',
    String(submission.legacyManualReviewRequired),
    submission.email ?? '',
    submission.emailCategory,
    submission.emailDomain ?? '',
    submission.emailCategorySource,
    submission.identityType ?? '',
    submission.firstName ?? '',
    submission.lastName ?? '',
    submission.agency ?? '',
    submission.deptRole ?? '',
    submission.mobile ?? '',
    submission.shippingCountry ?? '',
    submission.shippingCity ?? '',
    submission.shippingState ?? '',
    submission.shippingZip ?? '',
    submission.shippingStreet ?? '',
    submission.shippingApt ?? '',
    (submission.product ?? []).join('; '),
    (submission.approvedProductIds ?? []).join('; '),
    submission.intendedUse ?? '',
    submission.duration ?? '',
    submission.consentAfterTest ?? '',
    submission.consentShareMedia == null ? '' : String(submission.consentShareMedia),
    submission.consentCommunity == null ? '' : String(submission.consentCommunity),
    submission.consentWall == null ? '' : String(submission.consentWall),
    submission.consentMarketingEmails == null
      ? ''
      : String(submission.consentMarketingEmails),
    submission.ip ?? '',
    submission.country ?? '',
    submission.countryCode ?? '',
    submission.browserLanguage ?? '',
    handledBy,
    submission.handledByUserId ?? '',
    submission.handledAt ?? '',
    operatorExportLabel(submission.approvedProductsConfirmedBy, labels),
    submission.approvedProductsConfirmedAt ?? '',
    submission.erpPushStatus ?? '',
    submission.erpPushAt ?? '',
    submission.erpPushError ?? '',
    submission.testingStartAt ?? '',
    submission.testingCompletedAt ?? '',
    submission.evaluationDueAt ?? '',
    submission.evaluationFirstSentAt ?? '',
    submission.evaluationLastRemindedAt ?? '',
    submission.evaluationSubmittedAt ?? '',
    submission.settlementStartedAt ?? '',
    submission.settlementLastRemindedAt ?? '',
    submission.returnRequestedAt ?? '',
    submission.returnConfirmedAt ?? '',
    operatorExportLabel(submission.returnConfirmedBy, labels),
    submission.paymentSucceededAt ?? '',
    submission.completedAt ?? '',
    submission.completionReason ?? '',
    submission.notes ?? '',
  ]
}

const HANDLED_BY_USER_ID_HEADER = 'Handled By User ID'

/** CSV column headers aligned with {@link submissionToCsvRow}. */
export const CSV_HEADERS = [
  'ID',
  'Created At',
  'Status',
  'Legacy Source Status',
  'Legacy Manual Review Required',
  'Work Email',
  'Email Category',
  'Email Domain',
  'Category Source',
  'Identity Type',
  'First Name',
  'Last Name',
  'Agency',
  'Dept/Role',
  'Mobile',
  'Shipping Country',
  'Shipping City',
  'Shipping State',
  'Shipping ZIP',
  'Shipping Street',
  'Shipping Apt',
  'Requested Products',
  'Approved Products',
  'Intended Use',
  'Duration',
  'Consent After Test',
  'Share Media',
  'Community',
  'Wall',
  'Marketing Emails',
  'IP',
  'Country',
  'Country Code',
  'Browser Language',
  'Handled By',
  'Handled By User ID',
  'Handled At',
  'Approved Products Confirmed By',
  'Approved Products Confirmed At',
  'ERP Push Status',
  'ERP Push At',
  'ERP Push Error',
  'Testing Started At',
  'Testing Completed At',
  'Evaluation Due At',
  'Evaluation First Sent At',
  'Evaluation Last Reminded At',
  'Evaluation Submitted At',
  'Settlement Started At',
  'Settlement Last Reminded At',
  'Return Requested At',
  'Return Confirmed At',
  'Return Confirmed By',
  'Payment Succeeded At',
  'Completed At',
  'Completion Reason',
  'Notes',
]

/** Spreadsheet headers: CSV columns without the raw handler UUID. */
export const SHEET_HEADERS = CSV_HEADERS.filter(
  (header) => header !== HANDLED_BY_USER_ID_HEADER,
)

/**
 * Convert a T&E submission into a spreadsheet row with operator names.
 *
 * @param submission - Submission to serialize
 * @param labels - Profile display names for operator UUID columns
 * @returns Values aligned with {@link SHEET_HEADERS}
 */
export function submissionToSheetRow(
  submission: TeSubmission,
  labels: Map<string, string>,
): string[] {
  const csv = submissionToCsvRow(submission, labels)
  const uuidIndex = CSV_HEADERS.indexOf(HANDLED_BY_USER_ID_HEADER)
  return csv.filter((_, index) => index !== uuidIndex)
}

/**
 * Escape one value for RFC 4180-style CSV output.
 *
 * @param value - Raw cell value
 * @returns Escaped CSV cell
 */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Trigger a browser download for generated text.
 *
 * @param contents - Download body
 * @param mimeType - Blob media type
 * @param filename - Download filename
 */
function downloadText(contents: string, mimeType: string, filename: string): void {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Apply the shared keyword filter to a T&E submission query.
 *
 * @param query - T&E submission query builder
 * @param keyword - Search text
 * @returns Query builder with search filtering
 */
function applySearch(query: LooseFilterBuilder, keyword: string): LooseFilterBuilder {
  const trimmed = keyword.trim()
  if (!trimmed) return query
  const pattern = `%${trimmed}%`
  return query.or(
    `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},agency.ilike.${pattern}`,
  )
}

/**
 * Exclude selected email categories from a T&E submission query.
 *
 * @param query - T&E submission query builder
 * @param excluded - Categories to omit
 * @returns Query builder with category exclusions
 */
function applyExcludedCategories(
  query: LooseFilterBuilder,
  excluded: TeEmailCategory[],
): LooseFilterBuilder {
  let next = query
  for (const category of excluded) {
    next = next.neq('email_category', category)
  }
  return next
}

/**
 * Fetch and canonicalize every candidate for an evidence-sensitive status.
 *
 * @param status - Active status filter
 * @param category - Optional email category
 * @param applyExclusions - Whether to apply the current category exclusions
 * @param excluded - Categories to omit when `applyExclusions` is true
 * @param search - Search text
 * @returns Canonical rows matching the active status
 */
async function fetchCanonicalStatusRows(
  status: TeStatus | '',
  category: TeEmailCategory | null,
  applyExclusions: boolean,
  excluded: TeEmailCategory[],
  search: string,
): Promise<TeSubmission[]> {
  if (!status || !teStatusRequiresLegacyEvidenceFilter(status) || !isSupabaseConfigured) {
    return []
  }
  const rows: TeSubmission[] = []
  let from = 0
  while (true) {
    let query = fromLoose('te_submissions')
      .select('*')
      .in('status', teDatabaseStatusCandidates(status))
      .order('created_at', { ascending: false })
    if (category) {
      query = query.eq('email_category', category)
    } else if (applyExclusions) {
      query = applyExcludedCategories(query, excluded)
    }
    query = applySearch(query, search)
    const { data, error: fetchError } = await query.range(
      from,
      from + COMPAT_STATUS_BATCH_SIZE - 1,
    )
    if (fetchError) throw fetchError
    const batch = data ?? []
    rows.push(
      ...batch
        .map((row) => mapTeSubmissionFromRow(row))
        .filter((submission) => submission.status === status),
    )
    if (batch.length < COMPAT_STATUS_BATCH_SIZE) break
    from += COMPAT_STATUS_BATCH_SIZE
  }
  return rows
}

/**
 * Read-only T&E submission state for the GeoCRM admin panel.
 *
 * @returns Submission list, filters, pagination, refresh, and export actions
 */
export function useTeSubmissions() {
  const { t, i18n } = useTranslation()
  const [submissions, setSubmissions] = useState<TeSubmission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilterState] = useState<TeStatus | ''>('')
  const [categoryFilter, setCategoryFilterState] = useState<TeEmailCategory | ''>('')
  const [excludedCategories, setExcludedCategories] = useState<TeEmailCategory[]>([])
  const [categoryCounts, setCategoryCounts] = useState<TeCategoryCounts>(emptyCategoryCounts)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  )

  /**
   * Load counts for the category sidebar using the given search and status filters.
   *
   * @param status - Exact workflow status, or an empty string for all
   * @param search - Search text
   * @param excluded - Categories omitted from the all view
   */
  const fetchCategoryCounts = useCallback(
    async (
      status: TeStatus | '',
      search: string,
      excluded: TeEmailCategory[],
    ): Promise<void> => {
      if (!isSupabaseConfigured) {
        setCategoryCounts(emptyCategoryCounts())
        return
      }

      /**
       * Count one category, or the current all-categories view.
       *
       * @param category - Category to count, or null for the all view
       * @returns Matching row count
       */
      const countFor = async (category: TeEmailCategory | null): Promise<number> => {
        let query = fromLoose('te_submissions').select('id', { count: 'exact', head: true })
        if (category) {
          query = query.eq('email_category', category)
        } else {
          query = applyExcludedCategories(query, excluded)
        }
        if (status) {
          query = query.eq('status', status)
        }
        query = applySearch(query, search)
        const { count, error: countError } = await query
        if (countError) throw countError
        return count ?? 0
      }

      try {
        if (status && teStatusRequiresLegacyEvidenceFilter(status)) {
          const rows = await fetchCanonicalStatusRows(status, null, false, excluded, search)
          const next = emptyCategoryCounts()
          next.all = rows.filter(
            (submission) => !excluded.includes(submission.emailCategory),
          ).length
          for (const category of TE_EMAIL_CATEGORIES) {
            next[category] = rows.filter(
              (submission) => submission.emailCategory === category,
            ).length
          }
          setCategoryCounts(next)
          return
        }
        const [all, ...byCategory] = await Promise.all([
          countFor(null),
          ...TE_EMAIL_CATEGORIES.map((category) => countFor(category)),
        ])
        const next = emptyCategoryCounts()
        next.all = all
        TE_EMAIL_CATEGORIES.forEach((category, index) => {
          next[category] = byCategory[index] ?? 0
        })
        setCategoryCounts(next)
      } catch (countError) {
        console.error('useTeSubmissions fetchCategoryCounts error:', countError)
      }
    },
    [],
  )

  /**
   * Load a read-only submission page from Supabase using explicit list parameters.
   *
   * @param page - One-based page number
   * @param search - Search text
   * @param status - Exact workflow status, or an empty string for all
   * @param category - Category, or an empty string for all
   * @param excluded - Categories omitted from the all view
   */
  const fetchSubmissionsWith = useCallback(
    async (
      page: number,
      search: string,
      status: TeStatus | '',
      category: TeEmailCategory | '',
      excluded: TeEmailCategory[],
    ): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.te.errorNotConfigured'))
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        if (status && teStatusRequiresLegacyEvidenceFilter(status)) {
          const rows = await fetchCanonicalStatusRows(
            status,
            category || null,
            !category,
            excluded,
            search,
          )
          setSubmissions(rows.slice(from, to + 1))
          setTotalCount(rows.length)
          void fetchCategoryCounts(status, search, excluded)
          return
        }
        let query = fromLoose('te_submissions')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to)
        if (category) {
          query = query.eq('email_category', category)
        } else {
          query = applyExcludedCategories(query, excluded)
        }
        if (status) {
          query = query.eq('status', status)
        }
        query = applySearch(query, search)
        const { data, count, error: fetchError } = await query
        if (fetchError) throw fetchError
        setSubmissions((data ?? []).map((row) => mapTeSubmissionFromRow(row)))
        setTotalCount(count ?? 0)
        void fetchCategoryCounts(status, search, excluded)
      } catch (fetchError) {
        console.error('useTeSubmissions fetchSubmissions error:', fetchError)
        setError(t('admin.te.errorLoad'))
      } finally {
        setIsLoading(false)
      }
    },
    [fetchCategoryCounts, t],
  )

  /** Load the current read-only submission page from Supabase. */
  const fetchSubmissions = useCallback(async (): Promise<void> => {
    await fetchSubmissionsWith(
      currentPage,
      searchQuery,
      statusFilter,
      categoryFilter,
      excludedCategories,
    )
  }, [
    categoryFilter,
    currentPage,
    excludedCategories,
    fetchSubmissionsWith,
    searchQuery,
    statusFilter,
  ])

  /**
   * Reload category sidebar counts using the active search and status filters.
   */
  const reloadCategoryCounts = useCallback(async (): Promise<void> => {
    await fetchCategoryCounts(statusFilter, searchQuery, excludedCategories)
  }, [excludedCategories, fetchCategoryCounts, searchQuery, statusFilter])

  /**
   * Update the search query and reload page one.
   *
   * @param query - Search text
   */
  const setSearch = useCallback(
    async (query: string): Promise<void> => {
      setSearchQuery(query)
      setCurrentPage(1)
      await fetchSubmissionsWith(1, query, statusFilter, categoryFilter, excludedCategories)
    },
    [categoryFilter, excludedCategories, fetchSubmissionsWith, statusFilter],
  )

  /**
   * Update the status filter and reload page one.
   *
   * @param status - Exact workflow status, or an empty string for all
   */
  const setStatusFilter = useCallback(
    async (status: TeStatus | ''): Promise<void> => {
      setStatusFilterState(status)
      setCurrentPage(1)
      await fetchSubmissionsWith(1, searchQuery, status, categoryFilter, excludedCategories)
    },
    [categoryFilter, excludedCategories, fetchSubmissionsWith, searchQuery],
  )

  /**
   * Update the category filter and reload page one.
   *
   * @param category - Category, or an empty string for all
   */
  const setCategoryFilter = useCallback(
    async (category: TeEmailCategory | ''): Promise<void> => {
      setCategoryFilterState(category)
      const nextExcluded = category ? [] : excludedCategories
      if (category) setExcludedCategories([])
      setCurrentPage(1)
      await fetchSubmissionsWith(1, searchQuery, statusFilter, category, nextExcluded)
    },
    [excludedCategories, fetchSubmissionsWith, searchQuery, statusFilter],
  )

  /**
   * Toggle a category in the all-view exclusion list.
   *
   * @param category - Category to toggle
   */
  const toggleExcludedCategory = useCallback(
    async (category: TeEmailCategory): Promise<void> => {
      let nextExcluded: TeEmailCategory[]
      let nextCategory = categoryFilter
      if (excludedCategories.includes(category)) {
        nextExcluded = excludedCategories.filter((candidate) => candidate !== category)
      } else {
        nextCategory = ''
        nextExcluded = [...excludedCategories, category]
      }
      setExcludedCategories(nextExcluded)
      setCategoryFilterState(nextCategory)
      setCurrentPage(1)
      await fetchSubmissionsWith(1, searchQuery, statusFilter, nextCategory, nextExcluded)
    },
    [categoryFilter, excludedCategories, fetchSubmissionsWith, searchQuery, statusFilter],
  )

  /** Clear all category exclusions and reload page one. */
  const clearExcludedCategories = useCallback(async (): Promise<void> => {
    if (excludedCategories.length === 0) return
    setExcludedCategories([])
    setCurrentPage(1)
    await fetchSubmissionsWith(1, searchQuery, statusFilter, categoryFilter, [])
  }, [categoryFilter, excludedCategories.length, fetchSubmissionsWith, searchQuery, statusFilter])

  /**
   * Navigate to a submission list page.
   *
   * @param page - One-based page number
   */
  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      if (page < 1 || page > totalPages) return
      setCurrentPage(page)
      await fetchSubmissionsWith(
        page,
        searchQuery,
        statusFilter,
        categoryFilter,
        excludedCategories,
      )
    },
    [
      categoryFilter,
      excludedCategories,
      fetchSubmissionsWith,
      searchQuery,
      statusFilter,
      totalPages,
    ],
  )

  /**
   * Fetch every row matching the current filters for export.
   *
   * @returns Filtered submissions in newest-first order
   */
  const fetchFilteredRows = useCallback(async (): Promise<TeSubmission[]> => {
    if (!isSupabaseConfigured) return []
    if (statusFilter && teStatusRequiresLegacyEvidenceFilter(statusFilter)) {
      return fetchCanonicalStatusRows(
        statusFilter,
        categoryFilter || null,
        !categoryFilter,
        excludedCategories,
        searchQuery,
      )
    }
    let query = fromLoose('te_submissions')
      .select('*')
      .order('created_at', { ascending: false })
    if (categoryFilter) {
      query = query.eq('email_category', categoryFilter)
    } else {
      query = applyExcludedCategories(query, excludedCategories)
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }
    query = applySearch(query, searchQuery)
    const { data, error: fetchError } = await query
    if (fetchError) throw fetchError
    return (data ?? []).map((row) => mapTeSubmissionFromRow(row))
  }, [categoryFilter, excludedCategories, searchQuery, statusFilter])

  /**
   * Export every filtered submission as CSV.
   *
   * @param filenamePrefix - Optional filename prefix
   */
  const exportCsv = useCallback(
    async (filenamePrefix = 'te-submissions'): Promise<void> => {
      try {
        const rows = await fetchFilteredRows()
        const labels = await fetchProfileDisplayLabelsByIds(collectOperatorIds(rows))
        const lines = [
          CSV_HEADERS.map(escapeCsv).join(','),
          ...rows.map((submission) =>
            submissionToCsvRow(submission, labels).map(escapeCsv).join(','),
          ),
        ]
        downloadText(
          lines.join('\n'),
          'text/csv;charset=utf-8;',
          `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`,
        )
      } catch (exportError) {
        console.error('useTeSubmissions exportCsv error:', exportError)
        setError(t('admin.te.errorExportCsv'))
      }
    },
    [fetchFilteredRows, t],
  )

  /**
   * Export every filtered submission as JSON.
   *
   * @param filenamePrefix - Optional filename prefix
   */
  const exportJson = useCallback(
    async (filenamePrefix = 'te-submissions'): Promise<void> => {
      try {
        const rows = await fetchFilteredRows()
        downloadText(
          JSON.stringify(rows, null, 2),
          'application/json;charset=utf-8;',
          `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`,
        )
      } catch (exportError) {
        console.error('useTeSubmissions exportJson error:', exportError)
        setError(t('admin.te.errorExportJson'))
      }
    },
    [fetchFilteredRows, t],
  )

  /**
   * Export every filtered submission into the built-in spreadsheet editor.
   * @returns Nothing.
   */
  const exportSheets = useCallback(async (): Promise<void> => {
    try {
      const records = await fetchFilteredRows()
      const labels = await fetchProfileDisplayLabelsByIds(
        collectOperatorIds(records),
      )
      const snapshot = createTeSubmissionsWorkbook(
        SHEET_HEADERS,
        records.map((submission) => submissionToSheetRow(submission, labels)),
        univerLocaleFromAppLanguage(i18n.language),
      )
      openOfficeDocument({
        kind: 'sheets',
        name: teSubmissionsWorkbookFileName(),
        snapshot: snapshot as unknown as Record<string, unknown>,
      })
    } catch (exportError) {
      console.error('useTeSubmissions exportSheets error:', exportError)
      setError(t('admin.te.errorExportSheets'))
    }
  }, [fetchFilteredRows, i18n.language, t])

  return {
    submissions,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    categoryFilter,
    excludedCategories,
    categoryCounts,
    PAGE_SIZE,
    fetchSubmissions,
    fetchCategoryCounts: reloadCategoryCounts,
    setSearch,
    setStatusFilter,
    setCategoryFilter,
    toggleExcludedCategory,
    clearExcludedCategories,
    goToPage,
    exportCsv,
    exportJson,
    exportSheets,
  }
}
