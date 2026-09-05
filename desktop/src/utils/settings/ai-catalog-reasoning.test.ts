import { describe, expect, it } from 'vitest'
import type { AiCatalogModel } from '@/chat/ai-model-catalog'
import { withCatalogReasoning } from '@/utils/settings/ai-catalog-reasoning'

/**
 * Builds a catalog row for tests.
 * @param id - Vendor model id
 * @param provider - Catalog provider
 * @param extras - Optional field overrides
 * @returns Catalog row
 */
function model(id: string, provider: string, extras: Partial<AiCatalogModel> = {}): AiCatalogModel {
  return { id, provider, labelEn: id, ...extras }
}

describe('catalog reasoning effort', () => {
  it('uses GET /ai/models fields when the API sends them', () => {
    const row = withCatalogReasoning(
      model('gpt-5.6-luna', 'chatgpt', {
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
      }),
    )
    expect(row.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(row.defaultReasoningEffort).toBe('medium')
  })

  it('fills offline fallback for catalog ids when the API omits reasoning', () => {
    const sol = withCatalogReasoning(model('gpt-5.6-sol', 'chatgpt'))
    expect(sol.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(sol.defaultReasoningEffort).toBe('low')
    const gpt4o = withCatalogReasoning(model('gpt-4o', 'chatgpt'))
    expect(gpt4o.reasoningEfforts).toBeUndefined()
    const grok = withCatalogReasoning(model('grok-4.20-0309-non-reasoning', 'grok'))
    expect(grok.reasoningEfforts).toBeUndefined()
    const gemini = withCatalogReasoning(model('gemini-3.1-pro-preview', 'gemini'))
    expect(gemini.reasoningEfforts).toEqual(['low', 'medium', 'high'])
  })
})
