/**
 * Opportunity (sales pipeline) types aligned with workbench-web Admin Opportunities
 * models. Electron ships the Freeform board, list, create/edit core fields,
 * exchange rate, and attachments. Collaborators and product lines stay web-only.
 */

/** `opportunities.sales_process` (text column; no DB enum). */
export type OpportunitySalesProcess = 'ai_automated_sales' | 'brand_order' | 'tender' | 'custom'

export const SALES_PROCESS_VALUES: OpportunitySalesProcess[] = [
  'ai_automated_sales',
  'brand_order',
  'tender',
  'custom',
]

/** Default sales process for new opportunities (web parity). */
export const DEFAULT_SALES_PROCESS: OpportunitySalesProcess = 'tender'

/** Pipeline stage row: slug + default win probability (web `opportunity-pipeline.ts` parity). */
export interface PipelineStageRow {
  stage: string
  defaultProbability: number
}

/** Pipeline stages per sales process (`opportunities.stage`, text). */
export const PIPELINE_STAGES_BY_SALES_PROCESS: Record<OpportunitySalesProcess, PipelineStageRow[]> = {
  ai_automated_sales: [
    { stage: 'ai_inquiry', defaultProbability: 8 },
    { stage: 'ai_requirements', defaultProbability: 12 },
    { stage: 'ai_quotation', defaultProbability: 18 },
    { stage: 'ai_sample', defaultProbability: 22 },
    { stage: 'ai_order_intent', defaultProbability: 35 },
    { stage: 'ai_pi_contract', defaultProbability: 42 },
    { stage: 'ai_order_payment', defaultProbability: 55 },
    { stage: 'ai_production', defaultProbability: 62 },
    { stage: 'ai_logistics', defaultProbability: 70 },
    { stage: 'ai_final_payment', defaultProbability: 78 },
    { stage: 'ai_customer_receipt', defaultProbability: 88 },
    { stage: 'ai_after_sales', defaultProbability: 92 },
  ],
  brand_order: [
    { stage: 'brand_inquiry', defaultProbability: 12 },
    { stage: 'brand_quotation', defaultProbability: 22 },
    { stage: 'brand_sample', defaultProbability: 32 },
    { stage: 'brand_agency_agreement', defaultProbability: 45 },
    { stage: 'brand_order_unshipped', defaultProbability: 72 },
    { stage: 'brand_won_shipped', defaultProbability: 100 },
  ],
  tender: [
    { stage: 'tender_embed', defaultProbability: 10 },
    { stage: 'tender_discussion', defaultProbability: 18 },
    { stage: 'tender_quotation', defaultProbability: 28 },
    { stage: 'tender_sample', defaultProbability: 38 },
    { stage: 'tender_won_bid_unshipped', defaultProbability: 78 },
    { stage: 'tender_won_shipped', defaultProbability: 100 },
  ],
  custom: [
    { stage: 'custom_inquiry', defaultProbability: 12 },
    { stage: 'custom_quotation', defaultProbability: 24 },
    { stage: 'custom_sample', defaultProbability: 36 },
    { stage: 'custom_order_unshipped', defaultProbability: 70 },
    { stage: 'custom_won_shipped', defaultProbability: 100 },
  ],
}

/**
 * Returns the pipeline stage rows for a sales process (falls back to `tender`).
 * @param salesProcess - Sales process value, or null/undefined.
 * @returns Ordered stage rows for that process.
 */
export function pipelineStagesForSalesProcess(
  salesProcess: OpportunitySalesProcess | null | undefined,
): PipelineStageRow[] {
  return PIPELINE_STAGES_BY_SALES_PROCESS[salesProcess ?? DEFAULT_SALES_PROCESS]
}

/**
 * Type guard for sales-process slugs.
 * @param value - Unknown string.
 * @returns Whether value is a known sales process.
 */
export function isOpportunitySalesProcess(
  value: string | null | undefined,
): value is OpportunitySalesProcess {
  return (
    value != null &&
    (SALES_PROCESS_VALUES as readonly string[]).includes(value)
  )
}

/** Shared CRM currency codes (opportunities form; web `crm-currency-options.ts` parity). */
export const CRM_CURRENCY_OPTIONS = [
  'USD',
  'CNY',
  'EUR',
  'AUD',
  'CAD',
  'DKK',
  'NOK',
  'SEK',
  'CHF',
  'GBP',
  'HKD',
  'JPY',
  'NTD',
  'NZD',
  'SGD',
  'BRL',
  'ZAR',
  'TWD',
  'RUB',
  'PHP',
  'KRW',
  'MYR',
  'THB',
  'MOP',
  'IDR',
  'VND',
  'MXN',
  'AED',
] as const

export type CrmCurrencyCode = (typeof CRM_CURRENCY_OPTIONS)[number]

const CRM_CURRENCY_SET = new Set<string>(CRM_CURRENCY_OPTIONS)

/**
 * Default CRM currency for a UI locale: `zh-cn` → CNY, `zh-tw` → TWD, others → USD.
 * @param locale - Active i18n locale (e.g. `zh-TW`, `zh-CN`, `en-US`).
 * @returns A member of {@link CRM_CURRENCY_OPTIONS}.
 */
export function defaultCrmCurrencyForLocale(locale: string): CrmCurrencyCode {
  const cur = String(locale || '').toLowerCase()
  if (cur.startsWith('zh-cn')) {
    return 'CNY'
  }
  if (cur.startsWith('zh-tw')) {
    return 'TWD'
  }
  return 'USD'
}

/**
 * Maps selected currency codes to ISO 4217 codes expected by FX APIs (NTD → TWD).
 * @param code - Value from a form field.
 * @returns Uppercase ISO-style code for rate requests.
 */
export function currencyCodeForFx(code: string): string {
  const upper = String(code).toUpperCase()
  if (upper === 'NTD') {
    return 'TWD'
  }
  return upper
}

/**
 * Returns a safe currency code for persistence: must be in {@link CRM_CURRENCY_OPTIONS}.
 * @param code - Raw code from DB or UI.
 * @param fallback - Code to use when unknown (default TWD).
 * @returns A member of {@link CRM_CURRENCY_OPTIONS}.
 */
export function normalizeCrmCurrencyCode(
  code: string | null | undefined,
  fallback: CrmCurrencyCode = 'TWD',
): CrmCurrencyCode {
  const upper = String(code ?? '').trim().toUpperCase()
  if (upper && CRM_CURRENCY_SET.has(upper)) {
    return upper as CrmCurrencyCode
  }
  return fallback
}

/** Attachment metadata row (`opportunity_attachments`). */
export interface OpportunityAttachment {
  id: string
  opportunityId: string
  storagePath: string
  fileName: string
  byteSize: number | null
  mimeType: string | null
  uploadedBy: string | null
  createdAt: string
}

/**
 * Opportunity record (core fields plus exchange rate; list + create/edit).
 * Products and collaborators stay web-only for now.
 */
export interface Opportunity {
  id: string
  name: string
  customerId: string | null
  amount: number | null
  stage: string
  expectedCloseDate: string | null
  ownerId: string
  salesProcess: OpportunitySalesProcess | null
  currencyCode: string
  /** Live FX into the selected quote currency (`opportunities.exchange_rate`). */
  exchangeRate: number
  leadId: string | null
  notes: string | null
  groupId: string | null
  createdAt: string
  updatedAt: string
  /** Denormalized `customers.company_name` join (list display). */
  companyName: string | null
}

/** Editable opportunity fields shared by create and update. */
export interface OpportunityFormInput {
  name: string
  customerId: string | null
  amount: number | null
  stage: string
  expectedCloseDate: string | null
  salesProcess: OpportunitySalesProcess
  currencyCode: string
  exchangeRate: number
  leadId: string | null
  notes: string | null
}

/** Paginated list result. */
export interface OpportunityListResult {
  rows: Opportunity[]
  totalCount: number
}

/** Compact source-lead option scoped to one customer (opportunity form picker). */
export interface OpportunityLeadOption {
  id: string
  displayLabel: string
}
