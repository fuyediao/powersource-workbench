import { listenRendererEvent } from './renderer-events'

export type ClashInvokeArgs = Record<string, unknown>

type WorkbenchClashBridge = {
  invoke: (cmd: string, args?: ClashInvokeArgs) => Promise<unknown>
  listen: (name: string, handler: (payload: unknown) => void) => () => void
}

declare global {
  interface Window {
    workbenchClash?: WorkbenchClashBridge
  }
}

/**
 * Whether this document is hosted inside Workbench Electron.
 * @returns True when the Clash preload bridge is present.
 */
export function isWorkbenchHosted(): boolean {
  return typeof window !== 'undefined' && typeof window.workbenchClash?.invoke === 'function'
}

/**
 * Invokes a Clash command via the Electron host bridge.
 * @param cmd - Command name.
 * @param args - Argument object.
 * @returns Command result.
 */
export async function clashInvoke<T>(
  cmd: string,
  args?: ClashInvokeArgs,
): Promise<T> {
  if (!isWorkbenchHosted()) {
    throw new Error(`Clash host bridge is missing (${cmd})`)
  }
  return window.workbenchClash!.invoke(cmd, args) as Promise<T>
}

/**
 * Subscribes to a Clash event.
 *
 * Renderer `emit` (e.g. Test All → `verge://test-all`) is delivered in-process.
 * Main-process pushes still come through `workbenchClash.listen` when the host is present.
 *
 * @param name - Event name.
 * @param handler - Payload callback (`{ payload }`, matching Tauri listen).
 * @returns Unsubscribe function.
 */
export async function clashListen<T>(
  name: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  const onLocal = (event: { payload: unknown }) => {
    handler({ payload: event.payload as T })
  }
  const unlistenLocal = listenRendererEvent(name, onLocal)

  if (!isWorkbenchHosted()) {
    return unlistenLocal
  }

  const unlistenMain = window.workbenchClash!.listen(name, (payload) => {
    handler({ payload: payload as T })
  })

  return () => {
    unlistenLocal()
    unlistenMain()
  }
}
