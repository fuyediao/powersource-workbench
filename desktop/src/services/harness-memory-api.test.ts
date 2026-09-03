import { describe, expect, it } from 'vitest'

import { parseHarnessResponseText } from '@/services/harness-memory-api'

describe('parseHarnessResponseText', () => {
  it('reads assistant output from a Harness event stream', () => {
    const payload = [
      'data: {"type":"response.created","response":{"id":"resp_test"}}',
      '',
      'data: {"type":"response.output_item.done","item":{"type":"message","content":[{"type":"output_text","text":"{\\"memory\\":\\"kept\\",\\"user\\":\\"profile\\"}"}]}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    expect(parseHarnessResponseText(payload)).toBe('{"memory":"kept","user":"profile"}')
  })
})
