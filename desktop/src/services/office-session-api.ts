/**
 * workbench-api `/office/session` — mints a JWT-signed OnlyOffice editorConfig
 * for one `office_files` row. The Document Server never sees a Supabase
 * session; workbench-api re-checks the same ACL the Storage/table RLS enforces.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** OnlyOffice editorConfig document/editorConfig payload, JWT-signed by workbench-api. */
export interface OnlyOfficeSessionConfig {
  docServerUrl: string
  config: {
    documentType: string
    document: Record<string, unknown>
    editorConfig: Record<string, unknown>
    token: string
  }
}

/** Error raised by Office session helpers. */
export class OfficeSessionError extends Error {
  readonly status: number

  /**
   * @param message - Human-readable message.
   * @param status - HTTP status (0 = network or configuration failure).
   */
  constructor(message: string, status: number) {
    super(message)
    this.name = 'OfficeSessionError'
    this.status = status
  }
}

/**
 * Reports whether the OnlyOffice session endpoint can be called.
 * @returns True when the Workbench API origin is configured.
 */
export function isOfficeSessionApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Requests an OnlyOffice editorConfig for one file.
 * @param fileId - `office_files.id`.
 * @param lang - OnlyOffice `editorConfig.lang` (`en` | `zh` | `zh-TW`).
 * @returns Document Server config ready for `DocsAPI.DocEditor`.
 */
export async function fetchOnlyOfficeSession(
  fileId: string,
  lang: string,
): Promise<OnlyOfficeSessionConfig> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new OfficeSessionError('The PowerSource Workbench API is not configured.', 0)
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new OfficeSessionError('Supabase is not configured.', 0)
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new OfficeSessionError('Sign in required.', 401)
  }

  let response: Response
  try {
    response = await fetch(`${base}/office/session`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId, lang }),
    })
  } catch {
    throw new OfficeSessionError('Network error', 0)
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new OfficeSessionError(body?.error ?? 'Failed to open the document', response.status)
  }
  return (await response.json()) as OnlyOfficeSessionConfig
}
