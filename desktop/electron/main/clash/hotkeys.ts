import { globalShortcut } from 'electron'

/** Hotkey function ids the Clash UI's hotkey editor can bind (`hotkey-viewer.tsx`). */
export type HotkeyFunction =
  | 'open_or_close_dashboard'
  | 'clash_mode_rule'
  | 'clash_mode_global'
  | 'clash_mode_direct'
  | 'toggle_system_proxy'
  | 'toggle_tun_mode'
  | 'entry_lightweight_mode'
  | 'reactivate_profiles'

const HANDLERS = new Map<HotkeyFunction, () => void>()
let registered: string[] = []

/**
 * Registers the callback each hotkey function id invokes when pressed.
 * @param fn - Hotkey function id.
 * @param handler - Action to run.
 */
export function setHotkeyHandler(fn: HotkeyFunction, handler: () => void): void {
  HANDLERS.set(fn, handler)
}

/**
 * Converts a Clash Verge accelerator (`Control+Shift+A`, `PLUS` for `+`) into an Electron
 * accelerator string.
 * @param combo - Combo as persisted in `verge.hotkeys` (`func,key` pairs, key half).
 * @returns Electron accelerator string.
 */
function toElectronAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      const key = part.trim()
      if (key === 'PLUS') return '+'
      if (key.toUpperCase() === 'CMDORCTRL') return 'CommandOrControl'
      return key
    })
    .join('+')
}

/**
 * Re-registers every global shortcut from `verge.hotkeys` (`["func,key", ...]`), matching
 * Clash Verge's `Hotkey::init` / `update`. Safe to call repeatedly (unregisters first).
 * @param hotkeys - Persisted `func,key` entries.
 * @param enabled - `enable_global_hotkey`; when false, all shortcuts are unregistered.
 */
export function applyHotkeys(hotkeys: string[] | undefined, enabled: boolean): void {
  for (const accelerator of registered) {
    try {
      globalShortcut.unregister(accelerator)
    } catch {
      // Already unregistered.
    }
  }
  registered = []

  if (!enabled || !hotkeys?.length) {
    return
  }

  for (const entry of hotkeys) {
    const [fn, combo] = entry.split(',').map((part) => part.trim())
    if (!fn || !combo) {
      continue
    }
    const handler = HANDLERS.get(fn as HotkeyFunction)
    if (!handler) {
      continue
    }
    const accelerator = toElectronAccelerator(combo)
    try {
      const ok = globalShortcut.register(accelerator, handler)
      if (ok) {
        registered.push(accelerator)
      }
    } catch {
      // Invalid accelerator string; skip.
    }
  }
}

/**
 * Unregisters every hotkey (app quit).
 */
export function teardownHotkeys(): void {
  for (const accelerator of registered) {
    try {
      globalShortcut.unregister(accelerator)
    } catch {
      // Already unregistered.
    }
  }
  registered = []
}
