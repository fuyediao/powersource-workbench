import axios, { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { isInvalidSessionError } from '@/utils/session-error'

/**
 * Builds an Axios error with an optional HTTP status and JSON body.
 * @param status - HTTP status, or undefined for a network failure.
 * @param data - Response payload.
 * @returns Axios error instance.
 */
function axiosError(status: number | undefined, data?: { error?: string }): AxiosError {
  const error = new AxiosError('request failed')
  if (status !== undefined) {
    error.response = {
      status,
      statusText: 'Error',
      headers: {},
      config: {} as never,
      data,
    }
  }
  return error
}

describe('isInvalidSessionError', () => {
  it('treats invalid_session and 401 as terminal', () => {
    expect(isInvalidSessionError(new Error('invalid_session'))).toBe(true)
    expect(isInvalidSessionError(axiosError(401, { error: 'invalid_session' }))).toBe(true)
    expect(isInvalidSessionError(axiosError(401))).toBe(true)
  })

  it('keeps the cache on network and server failures', () => {
    expect(isInvalidSessionError(axiosError(undefined))).toBe(false)
    expect(isInvalidSessionError(axiosError(500, { error: 'internal_error' }))).toBe(false)
    expect(isInvalidSessionError(new Error('network_error'))).toBe(false)
    expect(axios.isAxiosError(axiosError(undefined))).toBe(true)
  })
})
