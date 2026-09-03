/**
 * Parses OAuth tokens from a deep-link URL (query and/or hash fragment).
 * @param rawUrl - Deep-link URL from the system browser.
 * @returns Access/refresh tokens, or null when incomplete.
 */
export function parseAuthDeepLinkTokens(rawUrl: string): {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  error?: string
} | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  const params = new URLSearchParams(url.search)
  if (url.hash.length > 1) {
    const hashParams = new URLSearchParams(url.hash.slice(1))
    hashParams.forEach((value, key) => {
      params.set(key, value)
    })
  }

  const error = params.get('error') ?? params.get('error_description') ?? undefined
  if (error) {
    return {
      accessToken: '',
      refreshToken: '',
      expiresIn: 0,
      tokenType: 'bearer',
      error,
    }
  }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) {
    return null
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: Number(params.get('expires_in') ?? '3600') || 3600,
    tokenType: params.get('token_type') || 'bearer',
  }
}
