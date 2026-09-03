import { Constants } from './util/constants'
import { editorUi } from '@/utils/aura/editor-ui'
import { mathRender } from './render/mathRender'
import { renderDomByMd } from './modes/renderDomByMd'
import { renderToc } from './modes/toc'

/**
 * Resolve the React-owned writing root (`#write`), or create one when the
 * mount was not prepared by the shell (tests / legacy hosts).
 *
 * @param aura - Active editor instance.
 * @returns Writing root element.
 */
function resolveWriteRoot(aura: IAura): HTMLElement {
  const existing = aura.element.querySelector(
    '#write.aura-write, .aura-write, #write',
  ) as HTMLElement | null
  if (existing) {
    return existing
  }

  let content = aura.element.querySelector('.aura-content') as HTMLElement | null
  if (!content) {
    content = document.createElement('div')
    content.className = 'aura-content'
    aura.element.appendChild(content)
  }

  const write = document.createElement('div')
  write.id = 'write'
  write.className = 'aura-write'
  content.appendChild(write)
  return write
}

/**
 * Mount the WYSIWYG surface into the React-owned `#write` shell and render
 * the initial document. Does not rebuild chrome (content / write / theme
 * classes) — that belongs to the React shell.
 *
 * @param aura - Active editor instance.
 */
export const initUI = (aura: IAura) => {
  if (aura.options.rtl) {
    aura.element.setAttribute('dir', 'rtl')
  }
  if (typeof aura.options.height === 'number') {
    aura.element.style.height = `${aura.options.height}px`
  } else if (aura.options.height && aura.options.height !== 'auto') {
    aura.element.style.height = aura.options.height
  }
  if (typeof aura.options.minHeight === 'number') {
    aura.element.style.minHeight = `${aura.options.minHeight}px`
  }
  if (typeof aura.options.width === 'number') {
    aura.element.style.width = `${aura.options.width}px`
  } else if (aura.options.width && aura.options.width !== 'auto') {
    aura.element.style.width = aura.options.width
  }

  const writeElement = resolveWriteRoot(aura)
  writeElement.replaceChildren()
  writeElement.appendChild(aura.wysiwyg.element.parentElement!)

  const contentElement = writeElement.parentElement
  contentElement?.addEventListener('click', () => {
    editorUi.hideHint()
  })

  aura.markdown.setWysiwyg(true)
  setPadding(aura)
  renderDomByMd(aura, afterRender(aura), {
    enableAddUndoStack: true,
    enableHint: false,
  })
  aura.wysiwyg.element
    .querySelectorAll('.aura-toc')
    .forEach((item: Element) => {
      mathRender(item as HTMLElement, {
        math: aura.options.preview.math,
      })
    })
  renderToc(aura)
  setTypewriterPosition(aura)

  document.execCommand('DefaultParagraphSeparator', false, 'p')
}

/**
 * Horizontal padding for a mode column.
 * When `preview.maxWidth` is unset or <= 0, fill the pane (min gutters only).
 * Otherwise center a reading column and keep the scrollbar on the outer edge.
 *
 * @param clientWidth - Mode pane client width in px.
 * @param maxWidth - Optional content max width (0 or less = full width).
 * @param minPadding - Minimum side gutter.
 * @returns Side padding in px.
 */
const sidePaddingForWidth = (
  clientWidth: number,
  maxWidth: number | undefined,
  minPadding: number,
): number => {
  if (!maxWidth || maxWidth <= 0 || maxWidth >= clientWidth) {
    return minPadding
  }
  return Math.max(minPadding, (clientWidth - maxWidth) / 2)
}

/**
 * Apply side / top padding to the WYSIWYG pane, plus a fixed bottom gap so the
 * last line clears the shell status bar. Prefer padding over max-width + margin
 * so the scrollbar stays on the window edge.
 *
 * @param aura - Active editor instance.
 */
export const setPadding = (aura: IAura) => {
  const maxWidth = aura.options.preview.maxWidth
  const themeOwnsColumn = !maxWidth || maxWidth <= 0
  const minPadding =
    window.innerWidth <= Constants.MOBILE_WIDTH
      ? 10
      : themeOwnsColumn
        ? 0
        : 35
  const parent = aura.wysiwyg.element.parentElement
  if (parent && parent.style.display !== 'none') {
    const padding = sidePaddingForWidth(
      parent.clientWidth,
      maxWidth,
      minPadding,
    )
    aura.wysiwyg.element.style.padding = themeOwnsColumn
      ? '0 0 100px'
      : `10px ${padding}px 100px`
  }
}

/**
 * Position typewriter mode spacer via CSS variable.
 *
 * @param aura - Active editor instance.
 */
export const setTypewriterPosition = (aura: IAura) => {
  if (!aura.options.typewriterMode) {
    return
  }
  let height: number = window.innerHeight
  if (typeof aura.options.height === 'number') {
    height = aura.options.height
    if (typeof aura.options.minHeight === 'number') {
      height = Math.max(height, aura.options.minHeight)
    }
    height = Math.min(window.innerHeight, height)
  } else {
    height = aura.element.clientHeight
  }
  aura[aura.currentMode].element.style.setProperty(
    '--editor-bottom',
    `${height / 2}px`,
  )
}

let resizeCb: () => void

/**
 * Remove the window resize listener installed by {@link afterRender}.
 */
export function UIUnbindListener() {
  window.removeEventListener('resize', resizeCb)
}

/**
 * Resolve the initial markdown value and install resize handlers.
 *
 * @param aura - Active editor instance.
 * @returns Markdown to render.
 */
const afterRender = (aura: IAura) => {
  setTypewriterPosition(aura)
  UIUnbindListener()
  window.addEventListener(
    'resize',
    (resizeCb = () => {
      setPadding(aura)
      setTypewriterPosition(aura)
    }),
  )

  return aura.options.value || ''
}
