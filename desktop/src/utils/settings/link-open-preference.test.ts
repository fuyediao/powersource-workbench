import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isLinkOpenMode,
  LINK_OPEN_PREFERENCE_KEY,
  loadLinkOpenMode,
  saveLinkOpenMode,
} from '@/utils/settings/link-open-preference'

describe('isLinkOpenMode', () => {
  it('accepts stored modes', () => {
    expect(isLinkOpenMode('inApp')).toBe(true)
    expect(isLinkOpenMode('external')).toBe(true)
  })

  it('rejects other values', () => {
    expect(isLinkOpenMode('1')).toBe(false)
    expect(isLinkOpenMode(null)).toBe(false)
  })
})

describe('link-open localStorage cache', () => {
  const memory = new Map<string, string>()

  afterEach(() => {
    memory.clear()
    vi.unstubAllGlobals()
  })

  /**
   * Installs an in-memory localStorage for this suite.
   * @returns Nothing.
   */
  function stubStorage(): void {
    vi.stubGlobal('localStorage', {
      getItem: (key: string): string | null => memory.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        memory.set(key, value)
      },
      removeItem: (key: string): void => {
        memory.delete(key)
      },
    })
  }

  it('defaults to in-app when unset', () => {
    stubStorage()
    expect(loadLinkOpenMode()).toBe('inApp')
  })

  it('round-trips the system-browser choice', () => {
    stubStorage()
    saveLinkOpenMode('external')
    expect(memory.get(LINK_OPEN_PREFERENCE_KEY)).toBe('0')
    expect(loadLinkOpenMode()).toBe('external')
  })
})
