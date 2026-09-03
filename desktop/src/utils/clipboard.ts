/**
 * Clipboard helpers for the Electron renderer.
 */

/**
 * Copies plain text to the system clipboard.
 * Prefers the Clipboard API; falls back to a transient textarea when the
 * async API is missing or rejected (common in Electron without focus grants).
 *
 * @param text - Text to place on the clipboard.
 * @returns Resolves when the copy succeeds.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (text.length === 0) {
    throw new Error('Nothing to copy')
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the legacy path.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
  }
  if (!copied) {
    throw new Error('Clipboard write failed')
  }
}
