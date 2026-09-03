import { addScript } from '../util/addScript'

/** Fence language classes that should render as PlantUML. */
const PLANTUML_SELECTOR = '.language-plantuml, .language-puml'

const plantumlRenderAdapter = {
  /**
   * Read diagram source from a fenced preview element.
   *
   * @param el - Preview element.
   * @returns Raw PlantUML text.
   */
  getCode: (el: Element) => el.textContent ?? '',
  /**
   * Find PlantUML preview blocks under a root.
   *
   * @param el - Root to search.
   * @returns Matching elements.
   */
  getElements: (el: HTMLElement | Document) =>
    el.querySelectorAll(PLANTUML_SELECTOR),
}

type AuraPlantuml = {
  /**
   * Render PlantUML source to an SVG string (serialized; local TeaVM engine).
   *
   * @param source - Diagram text.
   * @param options - Render options.
   * @returns SVG markup.
   */
  renderToSvg: (
    source: string,
    options?: { dark?: boolean },
  ) => Promise<string>
}

/**
 * Escape text for safe insertion into an error message HTML fragment.
 *
 * @param value - Raw text.
 * @returns Escaped HTML text.
 */
function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Ensure the source has a `@start…` / `@end…` wrapper PlantUML expects.
 *
 * @param text - Diagram body.
 * @returns Wrapped source when needed.
 */
function ensurePlantumlWrapper(text: string): string {
  if (/@start\w+/i.test(text)) {
    return text
  }
  return `@startuml\n${text}\n@enduml`
}

/**
 * Render PlantUML fenced blocks with the local `@plantuml/core` TeaVM engine
 * (no plantuml.com round-trip).
 *
 * @param element - Root to search.
 * @param theme - Editor chrome theme (`dark` enables PlantUML dark SVG).
 */
export const plantumlRender = (
  element: HTMLElement | Document = document,
  theme = 'classic',
): void => {
  const plantumlElements = plantumlRenderAdapter.getElements(element)
  if (plantumlElements.length === 0) {
    return
  }

  void addScript('auraPlantumlScript').then(() => {
    const plantuml = (
      window as Window & { __AURA_PLANTUML__?: AuraPlantuml }
    ).__AURA_PLANTUML__
    if (!plantuml?.renderToSvg) {
      return
    }

    const dark = theme === 'dark'
    plantumlElements.forEach((item) => {
      const e = item as HTMLDivElement
      if (e.parentElement?.classList.contains('aura-wysiwyg__pre')) {
        return
      }
      const text = plantumlRenderAdapter.getCode(e).trim()
      if (!text || e.getAttribute('data-processed') === 'true') {
        return
      }
      e.setAttribute('data-processed', 'true')

      void plantuml
        .renderToSvg(ensurePlantumlWrapper(text), { dark })
        .then((svg) => {
          e.innerHTML = svg
          e.style.overflowX = 'auto'
          e.style.textAlign = 'center'
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error
              ? (error.message || error.name || 'Unknown error')
              : String(error ?? 'Unknown error')
          e.className = 'aura-reset--error'
          e.innerHTML = `plantuml render error:<br>${escapeHtml(message)}`
        })
    })
  })
}
