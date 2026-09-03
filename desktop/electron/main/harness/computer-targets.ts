/** Desktop surface discovery shared by the Harness UI and Computer Use executor. */

import { desktopCapturer, screen as electronScreen } from 'electron'
import { getWindows, type Window } from '@nut-tree-fork/nut-js'
import type { HarnessComputerTarget } from '../../shared/harness'

/** Target ids that pin a native window by OS handle, not by title. */
const WINDOW_HANDLE_PREFIX = 'window:hwnd:'

/**
 * Encodes a native window title into a legacy IPC-safe target id.
 * @param title - Native window title.
 * @returns Target id.
 */
export function windowTargetId(title: string): string {
  return `window:${Buffer.from(title, 'utf8').toString('base64url')}`
}

/**
 * Encodes a native window handle into a stable target id.
 * @param handle - OS window handle (HWND / CGWindowID).
 * @returns Target id.
 */
export function windowHandleTargetId(handle: number): string {
  return `${WINDOW_HANDLE_PREFIX}${handle}`
}

/**
 * Decodes a native window target id created from a title.
 * @param id - Target id created by windowTargetId.
 * @returns Window title, or an empty string for an invalid id.
 */
export function windowTitleFromTargetId(id: string): string {
  if (!id.startsWith('window:') || id.startsWith(WINDOW_HANDLE_PREFIX)) return ''
  try {
    return Buffer.from(id.slice('window:'.length), 'base64url').toString('utf8')
  } catch {
    return ''
  }
}

/**
 * Decodes a handle-backed window target id.
 * @param id - Target id created by windowHandleTargetId.
 * @returns Window handle, or null when the id is a title-backed legacy id.
 */
export function windowHandleFromTargetId(id: string): number | null {
  if (!id.startsWith(WINDOW_HANDLE_PREFIX)) return null
  const handle = Number(id.slice(WINDOW_HANDLE_PREFIX.length))
  return Number.isSafeInteger(handle) && handle > 0 ? handle : null
}

/**
 * Parses Chromium desktopCapturer window ids (`window:<handle>:0`).
 * @param sourceId - `DesktopCapturerSource.id`.
 * @returns Window handle, or null when the id is not numeric.
 */
export function parseCapturerWindowHandle(sourceId: string): number | null {
  const match = /^window:(\d+)/.exec(sourceId)
  if (!match) return null
  const handle = Number(match[1])
  return Number.isSafeInteger(handle) && handle > 0 ? handle : null
}

/**
 * Reads the nut.js window handle. The field is private in the published
 * types, but it is the only Unicode-safe way to match Electron's capturer.
 * @param nativeWindow - nut.js window.
 * @returns Handle, or null when missing.
 */
export function nutWindowHandle(nativeWindow: Window): number | null {
  const handle = (nativeWindow as unknown as { windowHandle?: unknown }).windowHandle
  return typeof handle === 'number' && Number.isSafeInteger(handle) && handle > 0 ? handle : null
}

/**
 * Lists displays and visible titled windows available to Computer Use.
 * Window titles come from Electron (UTF-16), not nut.js, which mangles CJK
 * titles on Windows through an ANSI GetWindowText path.
 * @returns Desktop targets with stable ids.
 */
export async function listComputerTargets(): Promise<HarnessComputerTarget[]> {
  const displays = electronScreen.getAllDisplays().map((display, index) => ({
    id: `display:${display.id}`,
    kind: 'display' as const,
    label: `${index + 1}. ${display.label || `${display.bounds.width} × ${display.bounds.height}`}`,
  }))
  try {
    const [sources, nativeWindows] = await Promise.all([
      desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1, height: 1 },
      }),
      getWindows().catch((): Window[] => []),
    ])
    const nativeByHandle = new Map<number, Window>()
    for (const nativeWindow of nativeWindows) {
      const handle = nutWindowHandle(nativeWindow)
      if (handle != null) nativeByHandle.set(handle, nativeWindow)
    }
    const seen = new Set<string>()
    const windows: HarnessComputerTarget[] = []
    for (const source of sources) {
      const title = source.name.trim()
      if (!title) continue
      const handle = parseCapturerWindowHandle(source.id)
      if (handle != null) {
        const nativeWindow = nativeByHandle.get(handle)
        if (nativeWindow) {
          const region = await nativeWindow.region
          if (region.width < 120 || region.height < 80) continue
        }
      }
      const id = handle != null ? windowHandleTargetId(handle) : windowTargetId(title)
      if (seen.has(id)) continue
      seen.add(id)
      windows.push({ id, kind: 'window', label: title })
    }
    return [...displays, ...windows.slice(0, 80)]
  } catch {
    return displays
  }
}
