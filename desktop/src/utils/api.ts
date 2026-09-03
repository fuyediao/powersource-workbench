import axios from 'axios'

/** Optional configuration for an external JSON POST request. */
export interface JsonPostOptions {
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean>
}

/** Configuration for a centralized JSON API request. */
export interface JsonRequestOptions extends JsonPostOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
}

/** HTTP failure with the provider response preserved for diagnostics. */
export class ApiRequestError extends Error {
  readonly status: number

  /**
   * Creates a normalized API request error.
   * @param message - Provider or network error message.
   * @param status - HTTP status, or zero for a network failure.
   */
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

/**
 * Extracts a useful message from a JSON error body.
 * @param payload - Unknown provider response body.
 * @returns Provider message when present.
 */
function responseErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  if (typeof record.message === 'string') return record.message
  if (typeof record.error === 'string') return record.error
  if (record.error && typeof record.error === 'object') {
    const nestedMessage = (record.error as Record<string, unknown>).message
    if (typeof nestedMessage === 'string') return nestedMessage
  }
  return ''
}

/**
 * Posts JSON through the centralized axios client boundary.
 * @param url - Absolute request URL.
 * @param body - Serializable request payload.
 * @param options - Optional headers and query parameters.
 * @returns Parsed JSON response.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  options: JsonPostOptions = {},
): Promise<T> {
  try {
    const response = await axios.post<T>(url, body, {
      headers: options.headers,
      params: options.params,
    })
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const detail = responseErrorMessage(error.response?.data) || error.message
      throw new ApiRequestError(
        status > 0 ? `API request failed (${status}): ${detail}` : `API request failed: ${detail}`,
        status,
      )
    }
    throw error
  }
}

/** Sends an arbitrary JSON request through the centralized axios boundary. */
export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions = {},
): Promise<T> {
  try {
    const response = await axios.request<T>({
      url,
      method: options.method ?? 'GET',
      data: options.body,
      headers: options.headers,
      params: options.params,
    })
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const detail = responseErrorMessage(error.response?.data) || error.message
      throw new ApiRequestError(
        status > 0 ? `API request failed (${status}): ${detail}` : `API request failed: ${detail}`,
        status,
      )
    }
    throw error
  }
}

/** Sends an arbitrary request and returns the response body as text. */
export async function requestText(
  url: string,
  options: JsonRequestOptions = {},
): Promise<string> {
  try {
    const response = await axios.request<string>({
      url,
      method: options.method ?? 'GET',
      data: options.body,
      headers: options.headers,
      params: options.params,
      responseType: 'text',
    })
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0
      const detail = responseErrorMessage(error.response?.data) || error.message
      throw new ApiRequestError(
        status > 0 ? `API request failed (${status}): ${detail}` : `API request failed: ${detail}`,
        status,
      )
    }
    throw error
  }
}
