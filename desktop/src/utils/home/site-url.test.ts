import { describe, expect, it } from 'vitest'
import { normalizeSiteUrl } from '@/utils/home/site-url'

describe('normalizeSiteUrl', () => {
  it('adds https and accepts a host with a dot', () => {
    expect(normalizeSiteUrl('example.com')).toBe('https://example.com/')
  })

  it('rejects an empty value', () => {
    expect(normalizeSiteUrl('   ')).toBeNull()
  })

  it('rejects a host without a dot', () => {
    expect(normalizeSiteUrl('localhost')).toBeNull()
  })
})
