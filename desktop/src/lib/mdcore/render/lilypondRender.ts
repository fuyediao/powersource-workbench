/**
 * Render LilyPond fenced blocks.
 *
 * GeoCRM does not ship a LilyPond IPC bridge; show a clear unavailable message.
 *
 * @param element - Root to search for LilyPond blocks.
 */
export const lilypondRender = (
  element: HTMLElement | Document = document,
): void => {
  const blocks = element.querySelectorAll(
    '.language-lilypond, .language-lily',
  )
  if (blocks.length === 0) {
    return
  }

  blocks.forEach((item) => {
    const el = item as HTMLElement
    if (el.parentElement?.classList.contains('aura-wysiwyg__pre')) {
      return
    }
    if (el.getAttribute('data-processed') === 'true') {
      return
    }
    const code = (el.textContent ?? '').trim()
    if (!code) {
      return
    }
    el.setAttribute('data-processed', 'true')
    el.className = 'aura-reset--error'
    el.innerHTML =
      'LilyPond preview is not available in PowerSource Workbench. Export the block and render with LilyPond locally.'
  })
}
