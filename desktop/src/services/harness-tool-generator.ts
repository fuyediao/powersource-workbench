/** AI generation and validation for executable reusable Harness tools. */

import { postAiChat } from '@/services/ai-api'
import type { ElectronAiModelSelection } from '@/chat/ai-model-catalog'
import type {
  SalesAssistantCategory,
  SalesAssistantOutputMode,
  SalesAssistantToolCapability,
} from '@/constants/harness-sales-assistants'

/** Complete AI-generated tool definition ready for local persistence. */
export interface GeneratedHarnessTool {
  name: string
  description: string
  instructions: string
  allowedTools: SalesAssistantToolCapability[]
  requiredConnectors: string[]
  outputMode: SalesAssistantOutputMode
}

const CAPABILITIES = new Set<SalesAssistantToolCapability>([
  'computer_use',
  'web_search',
  'read_harness_resource',
  'search_harness_sessions',
  'list_my_access',
  'list_entities',
  'search_records',
  'get_record',
  'count_records',
  'summarize_records',
  'create_record',
  'update_record',
  'delete_record',
  'inspect_local_office_file',
  'edit_local_office_file',
  'create_local_office_file',
  'list_office_files',
  'open_office_file',
])

const OUTPUT_MODES = new Set<SalesAssistantOutputMode>([
  'narrative',
  'table',
  'dashboard',
  'document',
])

/**
 * Removes optional Markdown fencing around a model JSON response.
 * @param value - Raw model response.
 * @returns JSON source.
 */
function unwrapJson(value: string): string {
  const trimmed = value.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  return fenced?.[1]?.trim() ?? trimmed
}

/**
 * Parses and validates an AI-generated reusable tool.
 * @param source - Raw model response.
 * @returns Safe executable tool definition.
 */
export function parseGeneratedHarnessTool(source: string): GeneratedHarnessTool {
  const value = JSON.parse(unwrapJson(source)) as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The model did not return a tool object.')
  }
  const row = value as Record<string, unknown>
  const name = typeof row.name === 'string' ? row.name.trim().slice(0, 80) : ''
  const description = typeof row.description === 'string' ? row.description.trim().slice(0, 500) : ''
  const instructions = typeof row.instructions === 'string' ? row.instructions.trim() : ''
  const outputMode = typeof row.outputMode === 'string' && OUTPUT_MODES.has(row.outputMode as SalesAssistantOutputMode)
    ? row.outputMode as SalesAssistantOutputMode
    : 'narrative'
  const allowedTools = Array.isArray(row.allowedTools)
    ? row.allowedTools.filter(
        (tool): tool is SalesAssistantToolCapability =>
          typeof tool === 'string' && CAPABILITIES.has(tool as SalesAssistantToolCapability),
      )
    : []
  const requiredConnectors = Array.isArray(row.requiredConnectors)
    ? row.requiredConnectors.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : []
  if (!name || !description || !instructions || allowedTools.length === 0) {
    throw new Error('The generated tool is incomplete.')
  }
  return {
    name,
    description,
    instructions,
    allowedTools: [...new Set(allowedTools)],
    requiredConnectors: [...new Set(requiredConnectors.map((id) => id.trim()))],
    outputMode,
  }
}

/**
 * Builds the English-only generation scaffold for one reusable tool.
 * @param category - Marketplace category.
 * @param name - User-entered tool name.
 * @param requirement - User-entered capability requirement.
 * @returns Model prompt.
 */
export function buildHarnessToolPrompt(
  category: SalesAssistantCategory,
  name: string,
  requirement: string,
): string {
  return [
    'Create one production-ready reusable tool for the GeoCRM Harness.',
    'Return only one JSON object with exactly these keys: name, description, instructions, allowedTools, requiredConnectors, outputMode.',
    'The instructions must be in English and must define activation guidance, operating steps, evidence rules, safety boundaries, and the expected result.',
    'The visible name and description may follow the language used by the user requirement.',
    'allowedTools must contain only values from: computer_use, web_search, read_harness_resource, search_harness_sessions, list_my_access, list_entities, search_records, get_record, count_records, summarize_records, create_record, update_record, delete_record, inspect_local_office_file, edit_local_office_file, create_local_office_file, list_office_files, open_office_file.',
    'Grant the smallest capability set needed. Do not grant delete_record unless deletion is explicitly required. Grant computer_use only for necessary visual desktop interaction.',
    'requiredConnectors must contain connector ids only when the workflow truly depends on them; otherwise return an empty array.',
    'outputMode must be one of narrative, table, dashboard, or document.',
    '',
    `Category: ${category}`,
    `Requested name: ${name.trim() || 'New tool'}`,
    'User requirement:',
    requirement.trim() || 'Design a useful workflow and ask the user for missing business context at execution time.',
  ].join('\n')
}

/**
 * Generates one executable reusable tool with the selected provider and model.
 * @param category - Marketplace category.
 * @param name - User-entered tool name.
 * @param requirement - User-entered capability requirement.
 * @param selection - Provider and model selected in Harness.
 * @param signal - Optional cancellation signal.
 * @returns Validated tool definition.
 */
export async function generateHarnessTool(
  category: SalesAssistantCategory,
  name: string,
  requirement: string,
  selection: ElectronAiModelSelection,
  signal?: AbortSignal,
): Promise<GeneratedHarnessTool> {
  const raw = await postAiChat({
    model: selection.provider,
    modelId: selection.modelId,
    mode: 'think',
    prompt: buildHarnessToolPrompt(category, name, requirement),
    signal,
  })
  return parseGeneratedHarnessTool(raw.content)
}
