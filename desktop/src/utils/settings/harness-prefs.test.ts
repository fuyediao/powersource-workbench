import { describe, expect, it } from 'vitest'
import {
  parseHarnessCommandLine,
  parseHarnessMcpJson,
  serializeHarnessMcpJson,
} from '@/utils/settings/harness-prefs'

describe('Harness MCP command parsing', () => {
  it('preserves quoted paths and arguments', () => {
    expect(parseHarnessCommandLine('"C:\\Program Files\\node.exe" server.mjs --name "Sales CRM"'))
      .toEqual(['C:\\Program Files\\node.exe', 'server.mjs', '--name', 'Sales CRM'])
  })

  it('supports escaped double quotes', () => {
    expect(parseHarnessCommandLine('node tool.mjs --label "A \\"quoted\\" value"'))
      .toEqual(['node', 'tool.mjs', '--label', 'A "quoted" value'])
  })
})

describe('Harness MCP JSON configuration', () => {
  it('imports WorkBuddy-style remote servers without plaintext secrets', () => {
    const servers = parseHarnessMcpJson(JSON.stringify({
      mcpServers: {
        sales: {
          url: 'https://example.com/mcp',
          bearerTokenEnvVar: 'SALES_MCP_TOKEN',
          disabled: false,
        },
      },
    }))

    expect(servers).toMatchObject([{
      name: 'sales',
      transport: 'streamableHttp',
      url: 'https://example.com/mcp',
      bearerTokenEnvVar: 'SALES_MCP_TOKEN',
      enabled: true,
    }])
  })

  it('rejects plaintext bearer tokens in imported headers', () => {
    expect(() => parseHarnessMcpJson(JSON.stringify({
      mcpServers: {
        unsafe: {
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer secret-token' },
        },
      },
    }))).toThrow(/plaintext bearer tokens/i)
  })

  it('round-trips approval and tool policy fields', () => {
    const source = serializeHarnessMcpJson([{
      name: 'docs',
      transport: 'streamableHttp',
      url: 'https://example.com/mcp',
      auth: 'oauth',
      approvalMode: 'writes',
      enabledTools: ['search', 'read'],
      riskAcknowledged: true,
    }])

    expect(parseHarnessMcpJson(source)[0]).toMatchObject({
      name: 'docs',
      auth: 'oauth',
      approvalMode: 'writes',
      enabledTools: ['search', 'read'],
    })
  })
})
