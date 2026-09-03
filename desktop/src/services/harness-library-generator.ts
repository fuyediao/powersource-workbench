/**
 * AI-assisted draft generation for editable Harness library resources.
 */

import type { ElectronAiModelSelection } from '@/chat/ai-model-catalog'
import { postAiChat } from '@/services/ai-api'
import type { HarnessLibraryKind } from '@/services/harness-library-api'

/** Resource categories that can be drafted by a text model. */
export type HarnessGeneratableKind = 'skills' | HarnessLibraryKind

/** One generated resource draft ready for human review. */
export interface HarnessLibraryDraft {
  name: string
  body: string
}

interface RawHarnessLibraryDraft {
  name?: unknown
  description?: unknown
  body?: unknown
}

/** Maximum resource name length accepted by the Harness profile API. */
const RESOURCE_NAME_MAX_LENGTH = 64

/**
 * Removes an optional Markdown fence around a JSON response.
 * @param raw - Raw model response.
 * @returns JSON text without the fence.
 */
function unwrapJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

/**
 * Converts a model-proposed resource name into a server-safe slug.
 * @param value - Proposed name.
 * @returns Lowercase hyphenated name.
 */
export function normalizeHarnessResourceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, RESOURCE_NAME_MAX_LENGTH)
    .replace(/-+$/g, '')
}

/**
 * Escapes a short value for a single-line YAML string.
 * @param value - Plain text value.
 * @returns Quoted YAML-safe value.
 */
function quoteYamlString(value: string): string {
  return JSON.stringify(value.replace(/\s+/g, ' ').trim())
}

/**
 * Ensures a generated skill has valid, name-aligned YAML frontmatter.
 * @param name - Normalized skill name.
 * @param description - Generated discovery description.
 * @param body - Generated Markdown instructions.
 * @returns Complete SKILL.md body.
 */
function ensureSkillFrontmatter(name: string, description: string, body: string): string {
  const trimmed = body.trim()
  const frontmatter = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
  if (!frontmatter) {
    return [
      '---',
      `name: ${name}`,
      `description: ${quoteYamlString(description)}`,
      '---',
      '',
      trimmed,
    ].join('\n')
  }

  let metadata = frontmatter[1]
  if (/^name\s*:/m.test(metadata)) {
    metadata = metadata.replace(/^name\s*:.*$/m, `name: ${name}`)
  } else {
    metadata = `name: ${name}\n${metadata}`
  }
  if (/^description\s*:/m.test(metadata)) {
    metadata = metadata.replace(
      /^description\s*:.*$/m,
      `description: ${quoteYamlString(description)}`,
    )
  } else {
    metadata = `${metadata}\ndescription: ${quoteYamlString(description)}`
  }
  return `---\n${metadata.trim()}\n---\n\n${trimmed.slice(frontmatter[0].length).trim()}`
}

/**
 * Parses and validates a structured resource draft from a model response.
 * @param raw - Raw assistant response.
 * @param kind - Requested resource category.
 * @returns Normalized draft.
 */
export function parseHarnessLibraryDraft(
  raw: string,
  kind: HarnessGeneratableKind,
): HarnessLibraryDraft {
  const parsed = JSON.parse(unwrapJsonFence(raw)) as RawHarnessLibraryDraft
  const proposedName = typeof parsed.name === 'string' ? parsed.name : ''
  const name = normalizeHarnessResourceName(proposedName)
  const body = typeof parsed.body === 'string' ? parsed.body.trim() : ''
  const description =
    typeof parsed.description === 'string' && parsed.description.trim()
      ? parsed.description.trim()
      : `Use ${name} when the requested work matches this resource.`

  if (!name || !body) {
    throw new Error('The model returned an incomplete Harness resource draft.')
  }

  return {
    name,
    body: kind === 'skills' ? ensureSkillFrontmatter(name, description, body) : body,
  }
}

/**
 * Builds the English generation prompt for one resource category.
 * @param kind - Resource category.
 * @param requirement - User-provided requirement.
 * @returns Prompt sent to the selected model.
 */
function buildHarnessLibraryPrompt(kind: HarnessGeneratableKind, requirement: string): string {
  const categoryGuidance: Record<HarnessGeneratableKind, string> = {
    skills:
      'Create a concise Codex-compatible SKILL.md. The body must begin with YAML frontmatter containing name and description, followed by focused Markdown instructions. Include scripts, references, or assets only as recommendations when they are genuinely necessary.',
    commands:
      'Create a reusable named command prompt that clearly states the intended outcome, required inputs, and completion criteria.',
    rules:
      'Create an always-on rule with precise scope, durable constraints, and clear boundaries. Avoid generic advice.',
    hooks:
      'Create lifecycle hook instructions that define the trigger, checks or actions, failure behavior, and stopping conditions.',
    subagents:
      'Create a reusable subagent role with a bounded objective, inputs, expected output, permissions, and handoff conditions.',
    plugins:
      'Create a concise plugin manifest document describing the bundled resources, dependencies, permissions, and activation behavior.',
  }

  return [
    'You create production-ready resources for the Workbench Harness library.',
    categoryGuidance[kind],
    'Preserve the user intent and do not invent credentials, external authorization, or destructive permissions.',
    'Write all generated instructions and metadata in English.',
    'Return one JSON object with exactly three string keys: "name", "description", and "body".',
    'The name must use lowercase letters, digits, and hyphens only and must be at most 64 characters.',
    'The description must be a short discovery sentence explaining what the resource does and when it applies.',
    'The body must contain the complete editable resource content. Do not wrap the JSON in Markdown fences.',
    '',
    `Resource category: ${kind}`,
    'User requirement:',
    requirement.trim(),
  ].join('\n')
}

/**
 * Generates a reviewable Harness library draft with the selected provider and model.
 * @param kind - Resource category.
 * @param requirement - User description of the desired resource.
 * @param selection - Provider and vendor model chosen in the UI.
 * @param signal - Optional cancellation signal.
 * @returns Normalized draft for the existing editor.
 */
export async function generateHarnessLibraryDraft(
  kind: HarnessGeneratableKind,
  requirement: string,
  selection: ElectronAiModelSelection,
  signal?: AbortSignal,
): Promise<HarnessLibraryDraft> {
  const raw = await postAiChat({
    model: selection.provider,
    modelId: selection.modelId,
    mode: 'think',
    prompt: buildHarnessLibraryPrompt(kind, requirement),
    signal,
  })
  return parseHarnessLibraryDraft(raw.content, kind)
}
