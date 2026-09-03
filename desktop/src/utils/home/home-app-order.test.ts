import { describe, expect, it } from 'vitest'
import { applySavedHomeAppOrder, migrateHomeAppOrderIds } from '@/utils/home/home-app-order'

describe('migrateHomeAppOrderIds', () => {
  it('moves Harness next to Ask when it still sits beside Clash and Settings', () => {
    expect(
      migrateHomeAppOrderIds([
        'function-ask',
        'function-mail',
        'function-clash',
        'function-harness',
        'function-settings',
      ]),
    ).toEqual([
      'function-ask',
      'function-harness',
      'function-mail',
      'function-clash',
      'function-settings',
    ])
  })

  it('keeps a custom Harness placement', () => {
    expect(
      migrateHomeAppOrderIds([
        'function-ask',
        'function-mail',
        'function-harness',
        'function-calendar',
        'function-settings',
      ]),
    ).toEqual([
      'function-ask',
      'function-mail',
      'function-harness',
      'function-calendar',
      'function-settings',
    ])
  })
})

describe('applySavedHomeAppOrder', () => {
  it('uses catalog order when nothing is saved', () => {
    const catalog = [
      { id: 'function-ask' },
      { id: 'function-harness' },
      { id: 'function-mail' },
    ]
    expect(applySavedHomeAppOrder(catalog, []).map((app) => app.id)).toEqual([
      'function-ask',
      'function-harness',
      'function-mail',
    ])
  })
})
