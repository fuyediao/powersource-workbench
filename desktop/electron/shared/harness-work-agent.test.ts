import { describe, expect, it } from 'vitest'
import {
  WORK_AGENT_DEVELOPER_INSTRUCTIONS,
  WORK_AGENT_INSTRUCTION_HEADING,
  mergeWorkAgentInstructions,
} from './harness-work-agent'

describe('mergeWorkAgentInstructions', () => {
  it('returns the work-agent block when nothing else is present', () => {
    expect(mergeWorkAgentInstructions(null)).toBe(WORK_AGENT_DEVELOPER_INSTRUCTIONS)
    expect(mergeWorkAgentInstructions('   ')).toBe(WORK_AGENT_DEVELOPER_INSTRUCTIONS)
  })

  it('prepends the work-agent block ahead of memory and skills', () => {
    const merged = mergeWorkAgentInstructions('# Skills\n\n- geocrm-office')
    expect(merged.startsWith(WORK_AGENT_INSTRUCTION_HEADING)).toBe(true)
    expect(merged).toContain('# Skills')
    expect(merged).toContain('write real HTML')
  })

  it('does not duplicate the work-agent block', () => {
    const once = mergeWorkAgentInstructions(WORK_AGENT_DEVELOPER_INSTRUCTIONS)
    expect(once).toBe(WORK_AGENT_DEVELOPER_INSTRUCTIONS)
    expect(mergeWorkAgentInstructions(once)).toBe(once)
  })
})
