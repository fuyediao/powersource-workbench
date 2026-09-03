import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { expandMailAttachments, readHarnessLocalFile, uploadHarnessLocalFile } from './local-tool-input'

const temporaryFolders: string[] = []

/** Creates one isolated Harness workspace for a test. */
async function makeWorkspace(): Promise<string> {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-harness-tool-'))
  temporaryFolders.push(folder)
  return folder
}

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })))
})

describe('Harness local tool input', () => {
  it('reads relative files inside the workspace and infers MIME', async () => {
    const workspace = await makeWorkspace()
    await fs.writeFile(path.join(workspace, 'quote.pdf'), 'pdf')
    const file = await readHarnessLocalFile(workspace, 'quote.pdf')
    expect(file.filename).toBe('quote.pdf')
    expect(file.mimeType).toBe('application/pdf')
  })

  it('rejects an absolute path outside the workspace', async () => {
    const workspace = await makeWorkspace()
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.txt`)
    await fs.writeFile(outside, 'secret')
    try {
      await expect(readHarnessLocalFile(workspace, outside)).rejects.toThrow('outside')
    } finally {
      await fs.rm(outside, { force: true })
    }
  })

  it('expands mail attachment paths to bounded base64 payloads', async () => {
    const workspace = await makeWorkspace()
    await fs.writeFile(path.join(workspace, 'note.txt'), 'hello')
    const args = await expandMailAttachments(workspace, {
      attachments: [{ path: 'note.txt', filename: 'renamed.txt' }],
    })
    expect(args.attachments).toEqual([{
      filename: 'renamed.txt',
      contentType: 'text/plain',
      dataBase64: Buffer.from('hello').toString('base64'),
    }])
  })

  it('keeps the model-facing upload path out of the API payload', async () => {
    const workspace = await makeWorkspace()
    await fs.writeFile(path.join(workspace, 'logo.png'), 'png')
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = []
    const result = await uploadHarnessLocalFile(
      workspace,
      { kind: 'customer_logo', parent_id: 'customer-id', path: 'logo.png' },
      async (tool, args) => {
        calls.push({ tool, args })
        return { text: JSON.stringify({ ok: true }), isError: false }
      },
    )
    expect(result.isError).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.tool).toBe('upload_file')
    expect(calls[0]?.args.path).toBeUndefined()
    expect(calls[0]?.args.data_base64).toBe(Buffer.from('png').toString('base64'))
  })
})
