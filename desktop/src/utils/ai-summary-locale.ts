/**
 * Locale picker for saved customer AI summary columns.
 */

import type { AppLanguage } from '@/i18n'

interface AiSummaryLocaleFields {
  aiSummary?: string | null
  aiSummaryEnUs?: string | null
  aiSummaryZhCn?: string | null
  aiSummaryZhTw?: string | null
}

/**
 * Picks the saved AI summary string for the active UI language.
 * @param customer - Detail row with optional per-locale columns.
 * @param language - App language (`en` | `zh-TW` | `zh-CN`).
 * @returns Trimmed text or null when nothing is stored.
 */
export function pickAiSummaryForLocale(
  customer: AiSummaryLocaleFields,
  language: AppLanguage,
): string | null {
  let primary: string | null | undefined
  switch (language) {
    case 'en':
      primary = customer.aiSummaryEnUs
      break
    case 'zh-CN':
      primary = customer.aiSummaryZhCn
      break
    case 'zh-TW':
      primary = customer.aiSummaryZhTw
      break
    default:
      primary = customer.aiSummaryZhTw
  }
  if (primary?.trim()) {
    return primary.trim()
  }
  if (customer.aiSummary?.trim()) {
    return customer.aiSummary.trim()
  }
  return null
}

interface TeAiReviewLocaleFields {
  aiReviewEnUs?: string | null
  aiReviewZhCn?: string | null
  aiReviewZhTw?: string | null
}

/**
 * Picks the saved T&E AI review suggestion for the active UI language.
 * @param submission - Submission row, or null while loading.
 * @param language - App language (`en` | `zh-TW` | `zh-CN`).
 * @returns Trimmed Markdown text or null when none stored.
 */
export function pickTeAiReviewForLocale(
  submission: TeAiReviewLocaleFields | null,
  language: AppLanguage,
): string | null {
  if (!submission) {
    return null
  }
  let text: string | null
  switch (language) {
    case 'en':
      text = submission.aiReviewEnUs ?? null
      break
    case 'zh-CN':
      text = submission.aiReviewZhCn ?? null
      break
    case 'zh-TW':
      text = submission.aiReviewZhTw ?? null
      break
    default:
      text = submission.aiReviewZhTw ?? null
  }
  return text?.trim() || null
}

/**
 * Whether the T&E submission has any stored AI review suggestion.
 * @param submission - Submission row, or null while loading.
 * @returns True when any locale column is non-empty.
 */
export function teSubmissionHasAnySavedAiReview(
  submission: TeAiReviewLocaleFields | null,
): boolean {
  if (!submission) {
    return false
  }
  return Boolean(
    submission.aiReviewEnUs?.trim() ||
      submission.aiReviewZhCn?.trim() ||
      submission.aiReviewZhTw?.trim(),
  )
}
