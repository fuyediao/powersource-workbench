import { code160to32 } from '@/lib/mdcore/util/misc'
import i18n from '@/i18n'
import { COPY_ICON_PATH } from '@/icons/AllIcons'

/**
 * Copy plain text to the clipboard from the React shell / renderer.
 * Prefers the Clipboard API; falls back to a transient textarea + execCommand.
 *
 * @param text - Text to copy.
 * @returns Resolves when the copy attempt finishes.
 */
async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

/**
 * Read the plain-text payload for a fenced-code `<code>` element.
 *
 * @param codeElement - Highlighted code node.
 * @returns Normalized source text.
 */
function codeBlockPlainText(codeElement: HTMLElement): string {
  let codeText = codeElement.innerText
  if (codeElement.classList.contains('highlight-chroma')) {
    const clone = codeElement.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.highlight-ln').forEach((item) => {
      item.remove()
    })
    codeText = clone.innerText
  } else if (codeText.endsWith('\n')) {
    codeText = codeText.slice(0, -1)
  }
  return code160to32(codeText)
}

/**
 * Wire a copy control that copies `text` and briefly shows a "copied" tooltip.
 *
 * @param button - Clickable copy control.
 * @param text - Source text to place on the clipboard.
 * @param copyLabel - Idle tooltip label.
 * @param copiedLabel - Success tooltip label.
 */
function bindCopyButton(
  button: HTMLElement,
  text: string,
  copyLabel: string,
  copiedLabel: string,
): void {
  button.addEventListener('mouseover', () => {
    button.setAttribute('aria-label', copyLabel)
  })

  /**
   * Run the clipboard write and update the tooltip label.
   */
  const runCopy = (): void => {
    void copyTextToClipboard(text)
      .then(() => {
        button.setAttribute('aria-label', copiedLabel)
      })
      .catch(() => {
        button.setAttribute('aria-label', copyLabel)
      })
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation()
    event.preventDefault()
    runCopy()
  })
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.stopPropagation()
    event.preventDefault()
    runCopy()
  })
}

/**
 * Shell-owned code-block copy control for `preview.hljs.renderMenu`.
 * Core only creates the empty `.aura-copy` slot; this fills it.
 *
 * @param codeElement - The `pre > code` being decorated.
 * @param menuElement - Empty `.aura-copy` container from `codeRender`.
 */
export function renderCodeBlockCopyMenu(
  codeElement: HTMLElement,
  menuElement: HTMLElement,
): void {
  const copyLabel = i18n.t('aura.menu.copy')
  const copiedLabel = i18n.t('aura.shell.copied')
  const text = codeBlockPlainText(codeElement)

  const button = document.createElement('span')
  button.className = 'aura-tooltipped aura-tooltipped__w'
  button.setAttribute('aria-label', copyLabel)
  button.setAttribute('role', 'button')
  button.setAttribute('tabindex', '0')
  button.innerHTML =
    `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="${COPY_ICON_PATH}"></path></svg>`
  bindCopyButton(button, text, copyLabel, copiedLabel)

  menuElement.replaceChildren(button)
}
