import { describe, expect, it } from 'vitest'
import { applySavedHomeAppOrder, migrateHomeAppOrderIds } from '@/utils/home/home-app-order'

describe('migrateHomeAppOrderIds', () => {
  it('moves Harness next to Ask when it still sits beside Clash and Settings', () => {
    expect(
      migrateHomeAppOrderIds([
        'function-ask',
        'function-messages',
        'function-clash',
        'function-harness',
        'function-settings',
      ]),
    ).toEqual([
      'function-ask',
      'function-harness',
      'function-messages',
      'function-clash',
      'function-settings',
    ])
  })

  it('keeps a custom Harness placement', () => {
    expect(
      migrateHomeAppOrderIds([
        'function-ask',
        'function-messages',
        'function-harness',
        'function-mail',
        'function-settings',
      ]),
    ).toEqual([
      'function-ask',
      'function-messages',
      'function-harness',
      'function-mail',
      'function-settings',
    ])
  })
})

describe('applySavedHomeAppOrder', () => {
  it('uses catalog order when nothing is saved', () => {
    const catalog = [
      { id: 'function-ask' },
      { id: 'function-harness' },
      { id: 'function-messages' },
    ]
    expect(applySavedHomeAppOrder(catalog, []).map((app) => app.id)).toEqual([
      'function-ask',
      'function-harness',
      'function-messages',
    ])
  })
})
