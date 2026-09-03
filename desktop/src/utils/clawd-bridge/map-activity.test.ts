import { describe, expect, it } from 'vitest'
import { mapAskClawdActivity } from '@/utils/clawd-bridge/map-activity'

describe('mapAskClawdActivity', () => {
  it('reports thinking while a think-mode reply is in flight', () => {
    expect(mapAskClawdActivity({ loading: true, thinkMode: true, error: false }, false)).toEqual({
      event: 'UserPromptSubmit',
      state: 'thinking',
    })
  })

  it('reports working while a quick reply is in flight', () => {
    expect(mapAskClawdActivity({ loading: true, thinkMode: false, error: false }, false)).toEqual({
      event: 'PreToolUse',
      state: 'working',
    })
  })

  it('reports attention when loading ends without an error', () => {
    expect(mapAskClawdActivity({ loading: false, thinkMode: false, error: false }, true)).toEqual({
      event: 'Stop',
      state: 'attention',
    })
  })

  it('reports error when send failed', () => {
    expect(mapAskClawdActivity({ loading: false, thinkMode: false, error: true }, true)).toEqual({
      event: 'StopFailure',
      state: 'error',
    })
  })

  it('skips idle frames after the opening SessionStart', () => {
    expect(mapAskClawdActivity({ loading: false, thinkMode: false, error: false }, false)).toBeNull()
  })
})
