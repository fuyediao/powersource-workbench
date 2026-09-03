import type Aura from '@/lib/mdcore/aura'

/**
 * Module-level registry for the mounted Aura editor instance.
 *
 * Non-React modules (menu actions, shell theme sync, find/replace) need
 * imperative access to the live editor without reaching through a global
 * `window.aura`. The React shell registers the instance on mount and clears
 * it on unmount via {@link setActiveEditor}.
 */
let activeEditor: Aura | undefined

/**
 * Register (or clear) the mounted Aura editor instance.
 *
 * @param instance - The live Aura instance, or undefined on unmount.
 */
export function setActiveEditor(instance: Aura | undefined): void {
  activeEditor = instance
}

/**
 * Resolve the mounted Aura editor instance.
 *
 * @returns The live Aura instance, or undefined when none is mounted.
 */
export function getActiveEditor(): Aura | undefined {
  return activeEditor
}
