import { describe, expect, it } from 'vitest'
import type { AiCatalogModel } from '@/chat/ai-model-catalog'
import {
  effortAtSliderIndex,
  effortSliderIndex,
  resolveHarnessReasoningEffort,
  showHarnessReasoningPicker,
  snapSliderIndex,
  withCatalogReasoning,
} from '@/utils/harness/reasoning-effort'

function model(id: string, provider: string, extras: Partial<AiCatalogModel> = {}): AiCatalogModel {
  return { id, provider, labelEn: id, ...extras }
}

describe('Harness reasoning effort', () => {
  it('uses GET /ai/models fields when the API sends them', () => {
    const row = withCatalogReasoning(
      model('gpt-5.6-luna', 'chatgpt', {
        reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
        defaultReasoningEffort: 'medium',
      }),
    )
    expect(row.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(showHarnessReasoningPicker(row)).toBe(true)
    expect(resolveHarnessReasoningEffort(row, 'ultra')).toBe('xhigh')
    expect(resolveHarnessReasoningEffort(row, 'max')).toBe('xhigh')
  })

  it('fills offline fallback for catalog ids when the API omits reasoning', () => {
    const sol = withCatalogReasoning(model('gpt-5.6-sol', 'chatgpt'))
    expect(sol.reasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(sol.reasoningEfforts).not.toContain('ultra')
    expect(sol.defaultReasoningEffort).toBe('low')
    const gpt4o = withCatalogReasoning(model('gpt-4o', 'chatgpt'))
    expect(showHarnessReasoningPicker(gpt4o)).toBe(false)
    expect(resolveHarnessReasoningEffort(gpt4o, 'high')).toBe('')
    const grok = withCatalogReasoning(model('grok-4.20-0309-non-reasoning', 'grok'))
    expect(grok.reasoningEfforts).toBeUndefined()
    const pro = withCatalogReasoning(model('gpt-5-pro', 'chatgpt'))
    expect(showHarnessReasoningPicker(pro)).toBe(false)
    const gemini = withCatalogReasoning(model('gemini-3.1-pro-preview', 'gemini'))
    expect(gemini.reasoningEfforts).toEqual(['low', 'medium', 'high'])
    expect(gemini.reasoningEfforts).not.toContain('minimal')
  })

  it('snaps a drag onto the nearest catalog step', () => {
    const levels = ['low', 'medium', 'high', 'xhigh']
    expect(effortSliderIndex(levels, 'medium')).toBe(1)
    expect(effortAtSliderIndex(levels, 3)).toBe('xhigh')
    expect(snapSliderIndex(10, 0, 100, 4)).toBe(0)
    expect(snapSliderIndex(25, 0, 100, 4)).toBe(1)
    expect(snapSliderIndex(100, 0, 100, 4)).toBe(3)
    expect(snapSliderIndex(50, 0, 100, 3)).toBe(1)
  })
})
