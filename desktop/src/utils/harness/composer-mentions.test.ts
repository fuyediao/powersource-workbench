import { describe, expect, it } from 'vitest'
import {
  buildMentionCatalog,
  filterMentionOptions,
  insertMentionToken,
  mentionQueryAt,
  mentionToken,
  mentionsInText,
} from './composer-mentions'

describe('Harness composer @ mentions', () => {
  it('builds a compact token from a display name', () => {
    expect(mentionToken('Google Calendar')).toBe('GoogleCalendar')
    expect(mentionToken('Workbench')).toBe('Workbench')
  })

  it('detects an active @ query at the caret', () => {
    expect(mentionQueryAt('hello @gm', 9)).toEqual({ start: 6, query: 'gm' })
    expect(mentionQueryAt('email@gm', 8)).toBeNull()
    expect(mentionQueryAt('@Gmail please', 13)).toBeNull()
  })

  it('inserts a selected plugin token over the active query', () => {
    expect(insertMentionToken('Use @gm', 7, 'Gmail')).toEqual({
      text: 'Use @Gmail ',
      caret: 11,
    })
  })

  it('filters picker rows and collects mentions still in the text', () => {
    const catalog = buildMentionCatalog(
      [{ name: 'github', transport: 'stdio' }],
      [{ name: 'github', runtimeStatus: 'connected', authStatus: 'unsupported' }],
      [
        {
          id: 'gmail',
          name: 'Gmail',
          description: '',
          iconUrl: '',
          installUrl: '',
          accessible: true,
          enabled: true,
          installed: true,
          callable: true,
          toolNames: [],
        },
      ],
      ['Dropbox'],
    )
    expect(catalog[0]?.name).toBe('Workbench')
    expect(filterMentionOptions(catalog, 'gm').map((item) => item.name)).toEqual(['Gmail'])
    expect(mentionsInText('Read @Gmail and @Workbench', catalog)).toEqual([
      { name: 'Workbench', path: '' },
      { name: 'Gmail', path: 'app://gmail' },
    ])
  })
})
