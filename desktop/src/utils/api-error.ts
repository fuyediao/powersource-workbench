import axios from 'axios'
import { i18n } from '@/i18n'

/**
 * Converts a stable API error code into localized user-facing text.
 * @param error - Unknown thrown request error.
 * @returns A localized error message.
 */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ code?: number | string; error_code?: string }>(error)) {
    const payload = error.response?.data
    const localizedCode = [payload?.code, payload?.error_code]
      .find((code): code is string => typeof code === 'string' && i18n.exists(`errors.${code}`))
    if (localizedCode) {
      return i18n.t(`errors.${localizedCode}`)
    }
    return i18n.t('errors.network_error')
  }
  if (error instanceof Error && i18n.exists(`errors.${error.message}`)) {
    return i18n.t(`errors.${error.message}`)
  }
  return error instanceof Error ? error.message : i18n.t('errors.internal_error')
}
