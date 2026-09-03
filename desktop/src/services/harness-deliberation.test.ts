import { beforeEach, describe, expect, it, vi } from 'vitest'
import { postAiChat } from '@/services/ai-api'
import { runHarnessDeliberation } from '@/services/harness-deliberation'
import type { HarnessDeliberationConfig } from '@/types/harness'

vi.mock('@/services/ai-api', () => ({ postAiChat: vi.fn() }))

const config: HarnessDeliberationConfig = {
  participants: [
    { provider: 'gemini', modelId: 'gemini-test', label: 'Gemini', effort: 'high' },
    { provider: 'chatgpt', modelId: 'gpt-test', label: 'ChatGPT', effort: 'medium' },
  ],
  finalizer: { provider: 'gemini', modelId: 'gemini-test', label: 'Gemini', effort: 'high' },
}

describe('Harness model deliberation', () => {
  beforeEach(() => vi.mocked(postAiChat).mockReset())

  it('keeps proposals independent, cross-reviews only peers, and emits one synthesis', async () => {
    vi.mocked(postAiChat)
      .mockResolvedValueOnce({ content: 'Proposal A', locations: [], locationSetId: null })
      .mockResolvedValueOnce({ content: 'Proposal B', locations: [], locationSetId: null })
      .mockResolvedValueOnce({ content: 'Review B', locations: [], locationSetId: null })
      .mockResolvedValueOnce({ content: 'Review A', locations: [], locationSetId: null })
      .mockResolvedValueOnce({ content: 'Unique final answer', locations: [], locationSetId: null })

    const result = await runHarnessDeliberation('Solve this.', [], config)

    expect(result.answer).toBe('Unique final answer')
    expect(result.contributions).toHaveLength(2)
    expect(postAiChat).toHaveBeenCalledTimes(5)
    const calls = vi.mocked(postAiChat).mock.calls.map(([request]) => request)
    expect(calls[0].prompt).not.toContain('DRAFT')
    expect(calls[1].prompt).not.toContain('DRAFT')
    expect(calls[2].prompt).toContain('Proposal B')
    expect(calls[2].prompt).not.toContain('Proposal A')
    expect(calls[3].prompt).toContain('Proposal A')
    expect(calls[3].prompt).not.toContain('Proposal B')
    expect(calls[4].prompt).toContain('Proposal A')
    expect(calls[4].prompt).toContain('Proposal B')
  })
})
