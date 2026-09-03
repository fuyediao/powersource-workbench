/**
 * Shared tab id type and tab chrome for customer detail.
 */

export type CustomerDetailTabId =
  | 'overview'
  | 'specificInfo'
  | 'aiSummary'
  | 'visitLogs'
  | 'workItems'
  | 'followUpPlan'
  | 'contacts'
  | 'addresses'
  | 'orders'
  | 'mail'
  | 'documents'
  | 'channels'
  | 'obmAccount'
  | 'activity'

/** Row 1 tab ids (7). */
export const DETAIL_TAB_ROW1: CustomerDetailTabId[] = [
  'overview',
  'specificInfo',
  'aiSummary',
  'visitLogs',
  'workItems',
  'followUpPlan',
  'contacts',
]

/** Row 2 tab ids (7; Activity last). */
export const DETAIL_TAB_ROW2: CustomerDetailTabId[] = [
  'addresses',
  'orders',
  'mail',
  'documents',
  'channels',
  'obmAccount',
  'activity',
]

/** All detail tab ids in display order (row1 then row2). */
export const DETAIL_TAB_ALL: CustomerDetailTabId[] = [
  ...DETAIL_TAB_ROW1,
  ...DETAIL_TAB_ROW2,
]

/** i18n key for each tab label. */
export const DETAIL_TAB_LABEL_KEY: Record<CustomerDetailTabId, string> = {
  overview: 'admin.customers.detail.tabOverview',
  specificInfo: 'admin.customers.detail.tabSpecificInfo',
  aiSummary: 'admin.customers.detail.tabAiSummary',
  visitLogs: 'admin.customers.detail.visitLogPanel.title',
  workItems: 'admin.customers.detail.tabWorkItems',
  followUpPlan: 'admin.customers.detail.tabFollowUpPlan',
  contacts: 'admin.customers.detail.tabContacts',
  addresses: 'admin.customers.detail.tabAddresses',
  orders: 'admin.customers.detail.tabOrders',
  mail: 'admin.customers.detail.tabMail',
  documents: 'admin.customers.detail.tabDocuments',
  channels: 'admin.customers.detail.tabChannels',
  obmAccount: 'admin.customers.detail.tabObmAccount',
  activity: 'admin.customers.detail.tabActivity',
}

const sectionCardClass =
  'rounded-2xl border border-ink/10 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5'

/**
 * Returns shared section card class for detail panels.
 * @returns Class string.
 */
export function detailSectionCardClass(): string {
  return sectionCardClass
}

/**
 * About-panel dl row shell: matches `CrmFilterSelect` `xs` trigger height so
 * plain-text rows and proxy/sales-rep selects share one vertical rhythm.
 */
export const ABOUT_ROW_CLASS =
  'flex min-h-11 items-center gap-2 px-4 py-2'

/**
 * Displays a value or an em dash.
 * @param value - Optional string/number.
 * @returns Display text.
 */
export function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  const text = String(value).trim()
  return text.length > 0 ? text : '—'
}
