import { describe, expect, it } from 'vitest'
import {
  buildHarnessToolPrompt,
  parseGeneratedHarnessTool,
} from '@/services/harness-tool-generator'

describe('Harness tool generation', () => {
  it('parses a complete executable definition and removes duplicate grants', () => {
    const result = parseGeneratedHarnessTool(`\`\`\`json
      {
        "name": "Account brief",
        "description": "Builds an evidence-based account brief.",
        "instructions": "Use CRM evidence and report limitations.",
        "allowedTools": ["web_search", "search_records", "search_records", "summarize_records"],
        "requiredConnectors": ["connector_gmail", "connector_gmail"],
        "outputMode": "dashboard"
      }
    \`\`\``)
    expect(result.allowedTools).toEqual(['web_search', 'search_records', 'summarize_records'])
    expect(result.requiredConnectors).toEqual(['connector_gmail'])
    expect(result.outputMode).toBe('dashboard')
  })

  it('rejects definitions without executable capabilities', () => {
    expect(() => parseGeneratedHarnessTool(JSON.stringify({
      name: 'Empty',
      description: 'No capabilities.',
      instructions: 'Do nothing.',
      allowedTools: [],
      requiredConnectors: [],
      outputMode: 'narrative',
    }))).toThrow('incomplete')
  })

  it('keeps prompt scaffolding in English and lists the capability boundary', () => {
    const prompt = buildHarnessToolPrompt('salesBusiness', 'Brief', 'Create account briefs.')
    expect(prompt).toContain('Grant the smallest capability set needed.')
    expect(prompt).toContain('web_search')
    expect(prompt).toContain('delete_record')
  })
})
