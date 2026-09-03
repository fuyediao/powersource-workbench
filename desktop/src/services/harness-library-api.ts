/**
 * Harness library against workbench-api `/ai/harness/skills`.
 *
 * Skills are Hermes `SKILL.md` folders on the user's VPS profile. The org
 * library is read-only here; personal skills follow the user between machines
 * and reach colleagues only after an admin publishes them.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Where one skill comes from. */
export type HarnessSkillScope = 'org' | 'personal'

/** One `SKILL.md` entry. */
export interface HarnessSkill {
  name: string
  summary: string
  scope: HarnessSkillScope
  body?: string
  publishRequested?: boolean
}

/** Skill index for the signed-in user. */
export interface HarnessSkillIndex {
  org: HarnessSkill[]
  personal: HarnessSkill[]
}

/** Editable Harness library categories stored in the user's VPS profile. */
export type HarnessLibraryKind = 'commands' | 'rules' | 'hooks' | 'subagents' | 'plugins'

/** One editable non-skill library entry. */
export interface HarnessLibraryEntry {
  name: string
  summary: string
  scope: 'personal'
  body?: string
}

/**
 * Reports whether the Workbench API origin is configured.
 * @returns True when library calls can run.
 */
export function isHarnessLibraryApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Authenticated JSON request to `/ai/harness/skills*`.
 * @param path - Path below `/ai/harness/skills`.
 * @param method - HTTP method.
 * @param body - Optional JSON body.
 * @returns Parsed JSON response.
 */
async function harnessLibraryRequest<T>(
  root: string,
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base || !isSupabaseConfigured || !supabase) {
    throw new Error('The PowerSource Workbench API is not configured.')
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new Error('Sign in required.')
  }

  const response = await fetch(`${base}/ai/harness/${root}${path}`, {
    method,
    mode: 'cors',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    throw new Error(`Harness library request failed (${response.status})`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

/**
 * Lists the org library and this user's personal skills.
 * @returns Skill index.
 */
export function fetchSkillIndex(): Promise<HarnessSkillIndex> {
  return harnessLibraryRequest<HarnessSkillIndex>('skills', '', 'GET')
}

/**
 * Reads one skill body.
 * @param name - Skill folder name.
 * @returns Skill with its markdown body.
 */
export function fetchSkill(name: string): Promise<HarnessSkill> {
  return harnessLibraryRequest<HarnessSkill>('skills', `/${encodeURIComponent(name)}`, 'GET')
}

/**
 * Creates or replaces one personal skill.
 * @param name - Skill folder name.
 * @param body - Markdown body.
 * @returns Stored skill summary.
 */
export function saveSkill(name: string, body: string): Promise<HarnessSkill> {
  return harnessLibraryRequest<HarnessSkill>('skills', `/${encodeURIComponent(name)}`, 'PUT', { name, body })
}

/**
 * Submits one personal skill for admin review.
 * @param name - Skill folder name.
 * @returns Nothing.
 */
export async function requestSkillPublish(name: string): Promise<void> {
  await harnessLibraryRequest<unknown>('skills', `/${encodeURIComponent(name)}/publish`, 'POST', {})
}

/**
 * Deletes one personal skill.
 * @param name - Skill folder name.
 * @returns Nothing.
 */
export async function deleteSkill(name: string): Promise<void> {
  await harnessLibraryRequest<unknown>('skills', `/${encodeURIComponent(name)}`, 'DELETE')
}

/** Lists personal entries for one non-skill library category. */
export async function fetchLibraryEntries(kind: HarnessLibraryKind): Promise<HarnessLibraryEntry[]> {
  const result = await harnessLibraryRequest<{ personal?: HarnessLibraryEntry[] }>(kind, '', 'GET')
  return result.personal ?? []
}

/** Reads one personal non-skill library entry. */
export function fetchLibraryEntry(kind: HarnessLibraryKind, name: string): Promise<HarnessLibraryEntry> {
  return harnessLibraryRequest<HarnessLibraryEntry>(kind, `/${encodeURIComponent(name)}`, 'GET')
}

/** Creates or replaces one personal non-skill library entry. */
export function saveLibraryEntry(
  kind: HarnessLibraryKind,
  name: string,
  body: string,
): Promise<HarnessLibraryEntry> {
  return harnessLibraryRequest<HarnessLibraryEntry>(kind, `/${encodeURIComponent(name)}`, 'PUT', {
    name,
    body,
  })
}

/** Deletes one personal non-skill library entry. */
export async function deleteLibraryEntry(kind: HarnessLibraryKind, name: string): Promise<void> {
  await harnessLibraryRequest<unknown>(kind, `/${encodeURIComponent(name)}`, 'DELETE')
}

/** Loads editable library entries into an English workflow instruction block. */
export async function fetchLibraryInstructions(): Promise<string> {
  const kinds: HarnessLibraryKind[] = ['rules', 'commands', 'hooks', 'subagents', 'plugins']
  const sections: string[] = []
  for (const kind of kinds) {
    const entries = await fetchLibraryEntries(kind)
    if (entries.length === 0) continue
    const bodies = await Promise.all(entries.map((entry) => fetchLibraryEntry(kind, entry.name)))
    sections.push(
      `## ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
      ...bodies.map((entry) => `### ${entry.name}\n${entry.body ?? entry.summary}`),
    )
  }
  if (sections.length === 0) return ''
  return ['# Harness Library', '', ...sections].join('\n\n')
}

/**
 * Renders a skill index as developer-instruction text for one turn.
 * @param index - Org and personal skills.
 * @returns Instruction block, or empty when there are no skills.
 */
export function formatSkillInstructions(index: HarnessSkillIndex): string {
  const lines: string[] = []
  for (const skill of [...index.org, ...index.personal]) {
    lines.push(`- ${skill.name} (${skill.scope}): ${skill.summary}`)
  }
  if (lines.length === 0) {
    return ''
  }
  return [
    '# Skills',
    '',
    'These Workbench skills are available on the VPS profile. Use one by following its body when the task matches.',
    '',
    ...lines,
  ].join('\n')
}
