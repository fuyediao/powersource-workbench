/**
 * Competitor product line CRUD (`competitor_lines`).
 * Ported from geocrm-web `useCompetitorLines`.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import type {
  CompetitorLine,
  CompetitorLineInput,
  CompetitorThreatLevel,
} from '@/types/competitor'
import { parseCompetitorPhotoUrls } from '@/utils/competitor-photo-urls'

/** Upper bound for lines loaded per shop (web parity). */
const LINES_LIMIT = 200

const LINE_SELECT =
  'id, shop_id, group_id, competitor_company_name, competitor_product_name, price, sales_quantity, threat_level, remarks, product_photo_urls, created_at, updated_at'

/**
 * Reads an optional string column.
 * @param value - Raw column value.
 * @returns Trimmed string, or null.
 */
function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Reads an optional numeric column.
 * @param value - Raw column value.
 * @returns Number, or null.
 */
function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Maps a raw `competitor_lines` row.
 * @param row - Supabase row.
 * @returns Typed line.
 */
function mapLine(row: Record<string, unknown>): CompetitorLine {
  return {
    id: String(row.id),
    shopId: String(row.shop_id ?? ''),
    groupId: String(row.group_id ?? ''),
    competitorCompanyName: textOrNull(row.competitor_company_name),
    competitorProductName: textOrNull(row.competitor_product_name),
    price: numberOrNull(row.price),
    salesQuantity: numberOrNull(row.sales_quantity),
    threatLevel:
      (textOrNull(row.threat_level) as CompetitorThreatLevel | null) ?? null,
    remarks: textOrNull(row.remarks),
    productPhotoUrls: parseCompetitorPhotoUrls(row.product_photo_urls),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

/**
 * Converts a line form model to a write payload.
 * @param input - Editable fields.
 * @returns snake_case payload.
 */
function formToPayload(input: CompetitorLineInput): Record<string, unknown> {
  return {
    competitor_company_name: input.competitorCompanyName,
    competitor_product_name: input.competitorProductName,
    price: input.price,
    sales_quantity: input.salesQuantity,
    threat_level: input.threatLevel,
    remarks: input.remarks,
    product_photo_urls: input.productPhotoUrls,
  }
}

/**
 * Lists competitor lines for one shop (newest first).
 * @param shopId - Parent shop uuid.
 * @returns Line rows.
 */
export async function listCompetitorLines(
  shopId: string,
): Promise<CompetitorLine[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('competitor_lines')
    .select(LINE_SELECT)
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .limit(LINES_LIMIT)
  if (error) {
    console.error('[competitor-lines-api] listCompetitorLines:', error)
    throw error
  }
  return (data ?? []).map((row) => mapLine(row))
}

/**
 * Loads one competitor line scoped to its shop.
 * @param shopId - Parent shop uuid.
 * @param lineId - Line uuid.
 * @returns Line, or null when missing.
 */
export async function getCompetitorLine(
  shopId: string,
  lineId: string,
): Promise<CompetitorLine | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await fromLoose('competitor_lines')
    .select(LINE_SELECT)
    .eq('id', lineId)
    .eq('shop_id', shopId)
    .maybeSingle()
  if (error) {
    console.error('[competitor-lines-api] getCompetitorLine:', error)
    throw error
  }
  return data ? mapLine(data) : null
}

/**
 * Creates a competitor line under a shop.
 * @param shopId - Parent shop uuid.
 * @param groupId - Workspace group of the parent shop.
 * @param input - Line fields.
 * @returns Created line.
 */
export async function createCompetitorLine(
  shopId: string,
  groupId: string,
  input: CompetitorLineInput,
): Promise<CompetitorLine> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.competitorCompanyName && !input.competitorProductName) {
    throw new Error('competitor_line_product_required')
  }
  const { data, error } = await fromLoose('competitor_lines')
    .insert({
      ...formToPayload(input),
      shop_id: shopId,
      group_id: groupId,
    })
    .select(LINE_SELECT)
    .single()
  if (error) {
    console.error('[competitor-lines-api] createCompetitorLine:', error)
    throw error
  }
  return mapLine(data)
}

/**
 * Updates a competitor line.
 * @param lineId - Line uuid.
 * @param input - Line fields.
 * @returns Updated line.
 */
export async function updateCompetitorLine(
  lineId: string,
  input: CompetitorLineInput,
): Promise<CompetitorLine> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!input.competitorCompanyName && !input.competitorProductName) {
    throw new Error('competitor_line_product_required')
  }
  const { data, error } = await fromLoose('competitor_lines')
    .update(formToPayload(input))
    .eq('id', lineId)
    .select(LINE_SELECT)
    .single()
  if (error) {
    console.error('[competitor-lines-api] updateCompetitorLine:', error)
    throw error
  }
  return mapLine(data)
}

/**
 * Deletes a competitor line.
 * @param lineId - Line uuid.
 * @returns Nothing.
 */
export async function deleteCompetitorLine(lineId: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('competitor_lines').delete().eq('id', lineId)
  if (error) {
    console.error('[competitor-lines-api] deleteCompetitorLine:', error)
    throw error
  }
}
