export const HEIGHT_MS = 320
const HEIGHT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Clears an inline height lock so the element can size to its content again.
 * @param element - Element to release.
 * @returns Nothing.
 */
export function releaseHeight(element: HTMLElement): void {
  element.style.transition = 'none'
  element.style.height = ''
}

/**
 * Animates an element's height from its current rendered size to a target size.
 * Locks the start height, forces a reflow, then transitions to the end height.
 * @param element - Element whose height should animate.
 * @param toHeight - Target height in pixels.
 * @param animate - When false, snaps without a transition.
 * @returns Nothing.
 */
export function animateHeight(element: HTMLElement, toHeight: number, animate: boolean): void {
  const fromHeight = element.getBoundingClientRect().height

  if (!animate || Math.abs(fromHeight - toHeight) < 1) {
    releaseHeight(element)
    return
  }

  element.style.transition = 'none'
  element.style.height = `${fromHeight}px`
  void element.offsetHeight
  element.style.transition = `height ${HEIGHT_MS}ms ${HEIGHT_EASING}`
  element.style.height = `${toHeight}px`
}
