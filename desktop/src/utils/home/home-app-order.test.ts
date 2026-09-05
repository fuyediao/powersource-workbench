import { describe, expect, it } from 'vitest'
import { applySavedHomeAppOrder, migrateHomeAppOrderIds } from '@/utils/home/home-app-order'

describe('migrateHomeAppOrderIds', () => {
  it('drops function-agent and function-harness ids', () => {
    expect(
      migrateHomeAppOrderIds([
        'function-ask',
        'function-agent',
        'function-mail',
        'function-harness',
        'function-settings',
      ]),
    ).toEqual(['function-ask', 'function-mail', 'function-settings'])
  })

  it('maps function-ai-chat to Ask and still drops harness ids', () => {
    expect(
      migrateHomeAppOrderIds([
        'function-ai-chat',
        'function-agent',
        'function-mail',
        'function-harness',
      ]),
    ).toEqual(['function-ask', 'function-mail'])
  })
})

describe('applySavedHomeAppOrder', () => {
  it('uses catalog order when nothing is saved', () => {
    const catalog = [{ id: 'function-ask' }, { id: 'function-mail' }]
    expect(applySavedHomeAppOrder(catalog, []).map((app) => app.id)).toEqual([
      'function-ask',
      'function-mail',
    ])
  })

  it('ignores unknown harness ids when applying a saved order', () => {
    const catalog = [{ id: 'function-ask' }, { id: 'function-mail' }]
    expect(
      applySavedHomeAppOrder(catalog, [
        'function-ask',
        'function-harness',
        'function-mail',
        'function-agent',
      ]).map((app) => app.id),
    ).toEqual(['function-ask', 'function-mail'])
  })
})
