/** Ask-mode chat variants supported in the Electron desktop client. */
export type ChatModeType = 'quick' | 'think' | 'customerInsight' | 'kolInsight'

const SYSTEM_INSTRUCTION_CHAT = `You are a helpful, thoughtful assistant. Answer the user's questions in depth: explain reasoning where useful, give context and examples when appropriate, and structure longer answers clearly (e.g. with bullet points or short sections).`

const SYSTEM_INSTRUCTION_QUICK = `You are a helpful assistant. Give short, direct answers. Be concise and to the point.`

/**
 * Returns the system instruction string for the given chat mode.
 * Insight modes are not supported in Electron; the server owns Ask prompts for quick/think.
 *
 * @param mode - Chat mode identifier
 * @returns System instruction text
 */
export function getSystemInstructionForMode(mode: ChatModeType): string {
  switch (mode) {
    case 'think':
      return SYSTEM_INSTRUCTION_CHAT
    case 'quick':
      return SYSTEM_INSTRUCTION_QUICK
    case 'customerInsight':
    case 'kolInsight':
      throw new Error('Customer and KOL insight modes are not supported in the Electron chat client.')
    default:
      return SYSTEM_INSTRUCTION_CHAT
  }
}
