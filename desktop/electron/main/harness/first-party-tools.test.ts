import { describe, expect, it } from 'vitest'
import { resolveFirstPartyDynamicTools } from './first-party-tools'

describe('Harness first-party tool policy', () => {
  it('hides web search by default', () => {
    const names = resolveFirstPartyDynamicTools(null, false).map((tool) => tool.name)

    expect(names).not.toContain('web_search')
    expect(names).toContain('search_records')
  })

  it('exposes web search only when both the user and profile allow it', () => {
    expect(resolveFirstPartyDynamicTools(['web_search'], true).map((tool) => tool.name))
      .toEqual(['web_search'])
    expect(resolveFirstPartyDynamicTools(['search_records'], true).map((tool) => tool.name))
      .toEqual(['search_records'])
  })

  it('advertises path-based upload and mail tools without exposing base64 fields', () => {
    const tools = resolveFirstPartyDynamicTools(null, false)
    const names = tools.map((tool) => tool.name)
    expect(names).toContain('list_upload_kinds')
    expect(names).toContain('upload_file')
    expect(names).toContain('delete_file')
    expect(names).toContain('send_mail')
    expect(names).toContain('save_mail_draft')
    expect(names).not.toContain('prepare_upload')
    expect(names).not.toContain('finalize_upload')
    const upload = tools.find((tool) => tool.name === 'upload_file')
    expect(upload?.inputSchema.properties).toHaveProperty('path')
    expect(upload?.inputSchema.properties).not.toHaveProperty('data_base64')
  })
})
