import { afterRenderEvent } from './afterRenderEvent'
import { setHeading } from './setHeading'
import { toolbarEvent } from './toolbarEvent'

/**
 * Build a temporary toolbar action node for shared format handlers.
 *
 * @param type - Toolbar action name (`bold`, `italic`, …).
 * @returns Detached button element.
 */
function makeActionButton(type: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.setAttribute('data-type', type)
  return button
}

/**
 * Apply a wrap-style format action (bold / italic / strike) in WYSIWYG.
 *
 * @param aura - Active editor instance.
 * @param type - Action name.
 */
export function execFormatWrap(
  aura: IAura,
  type: 'bold' | 'italic' | 'strike',
): void {
  const button = makeActionButton(type)
  const event = new MouseEvent('click')
  toolbarEvent(aura, button, event)
}

/**
 * Apply a heading level in WYSIWYG.
 *
 * @param aura - Active editor instance.
 * @param level - Heading level 1–6.
 */
export function execHeading(
  aura: IAura,
  level: 1 | 2 | 3 | 4 | 5 | 6,
): void {
  setHeading(aura, `H${level}`)
  afterRenderEvent(aura)
}
