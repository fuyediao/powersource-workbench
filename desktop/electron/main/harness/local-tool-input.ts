/** Local-file expansion for Harness upload and mail tools. */

import fs from 'node:fs/promises'
import path from 'node:path'
import type { HarnessToolCallResult } from './harness-api'

const MAX_INLINE_FILE_BYTES = 6 * 1024 * 1024
const MAX_MAIL_ATTACHMENTS = 10
const MAX_MAIL_ATTACHMENT_BYTES = 7 * 1024 * 1024

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

export interface LocalHarnessFile {
  absolutePath: string
  filename: string
  mimeType: string
  bytes: Buffer
}

/**
 * Resolves a file path while preventing traversal and symlink escape from the Harness workspace.
 * @param workFolder - Authoritative Harness workspace root.
 * @param inputPath - Absolute or workspace-relative path supplied by the model.
 * @returns A verified local file.
 */
export async function readHarnessLocalFile(
  workFolder: string,
  inputPath: string,
): Promise<LocalHarnessFile> {
  const root = await fs.realpath(workFolder)
  const candidate = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath)
  const absolutePath = await fs.realpath(candidate)
  const relative = path.relative(root, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('The selected file is outside the Harness work folder.')
  }
  const stat = await fs.stat(absolutePath)
  if (!stat.isFile()) throw new Error('The selected path is not a file.')
  const filename = path.basename(absolutePath)
  return {
    absolutePath,
    filename,
    mimeType: MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] ?? 'application/octet-stream',
    bytes: await fs.readFile(absolutePath),
  }
}

/**
 * Expands path-only mail attachments into the backend's bounded base64 representation.
 * @param workFolder - Harness workspace root.
 * @param args - Dynamic-tool arguments.
 * @returns Arguments ready for the Harness API.
 */
export async function expandMailAttachments(
  workFolder: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rawAttachments = Array.isArray(args.attachments) ? args.attachments : []
  if (rawAttachments.length > MAX_MAIL_ATTACHMENTS) {
    throw new Error(`Mail supports at most ${MAX_MAIL_ATTACHMENTS} attachments.`)
  }
  let totalBytes = 0
  const attachments: Record<string, unknown>[] = []
  for (const raw of rawAttachments) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Each mail attachment must include a workspace file path.')
    }
    const record = raw as Record<string, unknown>
    const inputPath = typeof record.path === 'string' ? record.path.trim() : ''
    if (!inputPath) throw new Error('Each mail attachment requires a path.')
    const file = await readHarnessLocalFile(workFolder, inputPath)
    totalBytes += file.bytes.byteLength
    if (totalBytes > MAX_MAIL_ATTACHMENT_BYTES) {
      throw new Error('Mail attachments exceed the local 7 MB request limit.')
    }
    attachments.push({
      filename:
        typeof record.filename === 'string' && record.filename.trim()
          ? record.filename.trim()
          : file.filename,
      contentType: file.mimeType,
      dataBase64: file.bytes.toString('base64'),
    })
  }
  return { ...args, attachments }
}

/**
 * Expands a local upload path and uses signed upload URLs for large document kinds.
 * @param workFolder - Harness workspace root.
 * @param args - Public upload tool arguments.
 * @param callTool - Authenticated first-party tool caller.
 * @returns Final upload tool result.
 */
export async function uploadHarnessLocalFile(
  workFolder: string,
  args: Record<string, unknown>,
  callTool: (tool: string, args: Record<string, unknown>) => Promise<HarnessToolCallResult>,
): Promise<HarnessToolCallResult> {
  const inputPath = typeof args.path === 'string' ? args.path.trim() : ''
  if (!inputPath) return { text: JSON.stringify({ error: 'A workspace file path is required.' }), isError: true }
  const file = await readHarnessLocalFile(workFolder, inputPath)
  const filename =
    typeof args.filename === 'string' && args.filename.trim() ? args.filename.trim() : file.filename
  const mimeType =
    typeof args.mime_type === 'string' && args.mime_type.trim() ? args.mime_type.trim() : file.mimeType
  const common = {
    kind: args.kind,
    parent_id: args.parent_id,
    filename,
    mime_type: mimeType,
  }
  if (file.bytes.byteLength <= MAX_INLINE_FILE_BYTES) {
    return callTool('upload_file', { ...common, data_base64: file.bytes.toString('base64') })
  }

  const kinds = await callTool('list_upload_kinds', {})
  if (kinds.isError) return kinds
  let supportsSignedUpload = false
  try {
    const payload = JSON.parse(kinds.text) as { kinds?: unknown }
    supportsSignedUpload = Array.isArray(payload.kinds) && payload.kinds.some((entry) => {
      if (!entry || typeof entry !== 'object') return false
      const kind = entry as Record<string, unknown>
      return kind.kind === args.kind && kind.supports_prepare_finalize === true
    })
  } catch {
    return { text: JSON.stringify({ error: 'Upload kind metadata was invalid.' }), isError: true }
  }
  if (!supportsSignedUpload) {
    return {
      text: JSON.stringify({ error: 'This file is too large for an inline image upload.' }),
      isError: true,
    }
  }
  const prepared = await callTool('prepare_upload', common)
  if (prepared.isError) return prepared
  let uploadUrl = ''
  let objectPath = ''
  try {
    const payload = JSON.parse(prepared.text) as Record<string, unknown>
    uploadUrl = typeof payload.upload_url === 'string' ? payload.upload_url : ''
    objectPath = typeof payload.object_path === 'string' ? payload.object_path : ''
  } catch {
    return { text: JSON.stringify({ error: 'The signed upload response was invalid.' }), isError: true }
  }
  if (!uploadUrl || !objectPath) {
    return { text: JSON.stringify({ error: 'The signed upload response was incomplete.' }), isError: true }
  }
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: file.bytes,
  })
  if (!response.ok) {
    return {
      text: JSON.stringify({ error: `Signed upload failed (${response.status}).` }),
      isError: true,
    }
  }
  return callTool('finalize_upload', {
    ...common,
    object_path: objectPath,
    byte_size: file.bytes.byteLength,
  })
}
