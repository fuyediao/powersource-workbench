/**
 * ESM facade for CJS-only `bind-event-listener` (used by Atlaskit / BlockSuite DnD).
 * Vite would otherwise serve the CJS build and fail named imports (`bind`).
 */

type Listener = EventListenerOrEventListenerObject

/** One event binding descriptor. */
export interface Binding {
  type: string
  listener: Listener
  options?: boolean | AddEventListenerOptions
}

/** Tear-down function returned by bind helpers. */
export type UnbindFn = () => void

/**
 * Normalize boolean / options bag into AddEventListenerOptions.
 * @param value - Shared or per-binding options.
 * @returns Options object or undefined.
 */
function toOptions(
  value: boolean | AddEventListenerOptions | undefined,
): AddEventListenerOptions | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'boolean') {
    return { capture: value }
  }
  return value
}

/**
 * Bind a DOM listener and return an unbind function.
 * @param target - Event target.
 * @param binding - Event type / listener / options.
 * @returns Unbind callback.
 */
export function bind(target: EventTarget, binding: Binding): UnbindFn {
  const { type, listener, options } = binding
  target.addEventListener(type, listener, options)
  return () => {
    target.removeEventListener(type, listener, options)
  }
}

/**
 * Bind many DOM listeners; returns one unbind-all function.
 * @param target - Event target.
 * @param bindings - Per-event bindings.
 * @param sharedOptions - Options merged into each binding.
 * @returns Unbind-all callback.
 */
export function bindAll(
  target: EventTarget,
  bindings: Binding[],
  sharedOptions?: boolean | AddEventListenerOptions,
): UnbindFn {
  const unbinds = bindings.map((original) => {
    if (sharedOptions == null) {
      return bind(target, original)
    }
    return bind(target, {
      ...original,
      options: {
        ...toOptions(sharedOptions),
        ...toOptions(original.options),
      },
    })
  })
  return () => {
    for (const unbind of unbinds) {
      unbind()
    }
  }
}
