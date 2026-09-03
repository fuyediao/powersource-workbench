import { describe, expect, it } from 'vitest'
import { parseStoredAuthSession } from '@/utils/workbench-session'

describe('parseStoredAuthSession', () => {
  it('accepts a complete token payload', () => {
    expect(
      parseStoredAuthSession({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1_700_000_000_000,
      }),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 1_700_000_000_000,
    })
  })

  it('rejects missing or empty fields', () => {
    expect(parseStoredAuthSession(null)).toBeNull()
    expect(parseStoredAuthSession({ accessToken: 'a', refreshToken: 'r' })).toBeNull()
    expect(
      parseStoredAuthSession({
        accessToken: '',
        refreshToken: 'refresh',
        expiresAt: 1,
      }),
    ).toBeNull()
    expect(
      parseStoredAuthSession({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 0,
      }),
    ).toBeNull()
  })
})
