import { describe, expect, it } from 'vitest'
import {
  SALES_ASSISTANTS,
  resolveSalesAssistantManifest,
  salesAssistantExecutorName,
} from '@/constants/harness-sales-assistants'

describe('Harness built-in tool executors', () => {
  it('gives all 94 tools a unique executable identity and valid manifest', () => {
    expect(SALES_ASSISTANTS).toHaveLength(94)
    const executors = SALES_ASSISTANTS.map((tool) => salesAssistantExecutorName(tool.id))
    expect(new Set(executors).size).toBe(94)
    for (const tool of SALES_ASSISTANTS) {
      expect(salesAssistantExecutorName(tool.id)).toMatch(/^expert_[a-zA-Z0-9_-]+$/)
      expect(resolveSalesAssistantManifest(tool).allowedTools.length).toBeGreaterThan(0)
      expect(resolveSalesAssistantManifest(tool).allowedTools).toContain('web_search')
      expect(tool.instructions.trim().length).toBeGreaterThan(30)
    }
  })
})
