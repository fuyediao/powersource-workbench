import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  SalesAssistantCategory,
  SalesAssistantOutputMode,
  SalesAssistantToolCapability,
} from '@/constants/harness-sales-assistants'
import { requestJson } from '@/utils/api'

/** User-created executable tool synchronized through the Harness cloud profile. */
export interface HarnessCloudExpert {
  id: string
  name: string
  description: string
  category: SalesAssistantCategory
  createdAt: string
  instructions: string
  allowedTools: SalesAssistantToolCapability[]
  requiredConnectors: string[]
  outputMode: SalesAssistantOutputMode
}

/** Returns the authenticated Harness cloud request headers. */
async function authHeaders(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sign in required.')
  const { data, error } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (error || !token) throw new Error('Sign in required.')
  return { Authorization: `Bearer ${token}` }
}

/** Lists user-created tools from the signed-in Harness cloud profile. */
export async function fetchHarnessExperts(): Promise<HarnessCloudExpert[]> {
  const base = resolveApiBaseUrl()
  if (!base) throw new Error('The PowerSource Workbench API is not configured.')
  const result = await requestJson<{ personal?: HarnessCloudExpert[] }>(`${base}/ai/harness/experts`, {
    headers: await authHeaders(),
  })
  return result.personal ?? []
}

/** Creates or replaces one user-created cloud tool. */
export async function saveHarnessExpert(expert: HarnessCloudExpert): Promise<HarnessCloudExpert> {
  const base = resolveApiBaseUrl()
  if (!base) throw new Error('The PowerSource Workbench API is not configured.')
  return requestJson<HarnessCloudExpert>(`${base}/ai/harness/experts/${encodeURIComponent(expert.id)}`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: expert,
  })
}

/** Deletes one user-created cloud tool. */
export async function deleteHarnessExpert(id: string): Promise<void> {
  const base = resolveApiBaseUrl()
  if (!base) throw new Error('The PowerSource Workbench API is not configured.')
  await requestJson<void>(`${base}/ai/harness/experts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
}
