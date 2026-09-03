/** Local screenshot and input executor for the Harness Computer Use tool. */

import { desktopCapturer, nativeImage, screen as electronScreen } from 'electron'
import {
  Button,
  Key,
  Point,
  getWindows,
  keyboard,
  mouse,
  screen,
  straightTo,
} from '@nut-tree-fork/nut-js'
import { planComputerUseAction, type ComputerUseAction } from './harness-api'
import {
  nutWindowHandle,
  parseCapturerWindowHandle,
  windowHandleFromTargetId,
  windowTitleFromTargetId,
} from './computer-targets'
import type {
  HarnessApprovalDecisionWire,
  HarnessComputerTarget,
} from '../../shared/harness'

/** Maximum visual actions in one dynamic tool call. */
const MAX_ACTIONS = 24

/** Bounds used to translate target-relative model coordinates to the desktop. */
interface ComputerTargetBounds {
  x: number
  y: number
  width: number
  height: number
}

/** One model screenshot and a compact transcript preview of the same frame. */
interface ComputerUseCapture {
  screenshotBase64: string
  previewDataUrl: string
  bounds: ComputerTargetBounds
}

/** Progress event emitted for one visual desktop action. */
export interface ComputerUseProgress {
  step: number
  action: string
  reason: string
  status: 'inProgress' | 'completed' | 'failed' | 'declined'
  screenshotDataUrl: string
}

/** Maps model key names onto nut.js keys. */
const KEY_MAP: Readonly<Record<string, Key>> = {
  enter: Key.Enter,
  return: Key.Return,
  escape: Key.Escape,
  tab: Key.Tab,
  backspace: Key.Backspace,
  delete: Key.Delete,
  space: Key.Space,
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right,
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
}

/** Common desktop shortcuts emitted by visual models. */
const HOTKEY_MAP: Readonly<Record<string, readonly Key[]>> = {
  'ctrl+a': [Key.LeftControl, Key.A],
  'ctrl+c': [Key.LeftControl, Key.C],
  'ctrl+v': [Key.LeftControl, Key.V],
  'ctrl+x': [Key.LeftControl, Key.X],
  'ctrl+z': [Key.LeftControl, Key.Z],
  'alt+f4': [Key.LeftAlt, Key.F4],
}

/**
 * Builds full-quality model bytes and a compact JPEG transcript preview.
 * @param png - Captured PNG bytes.
 * @param bounds - Target bounds in desktop coordinates.
 * @returns Capture payload.
 */
function capturePayload(png: Buffer, bounds: ComputerTargetBounds): ComputerUseCapture {
  const image = nativeImage.createFromBuffer(png)
  const size = image.getSize()
  const source = size.width === bounds.width && size.height === bounds.height
    ? image
    : image.resize({ width: bounds.width, height: bounds.height, quality: 'good' })
  const previewWidth = Math.min(720, source.getSize().width)
  const preview = source.resize({ width: previewWidth, quality: 'good' }).toJPEG(62)
  return {
    screenshotBase64: source.toPNG().toString('base64'),
    previewDataUrl: `data:image/jpeg;base64,${preview.toString('base64')}`,
    bounds,
  }
}

/**
 * Captures one Electron display source at target-relative coordinate scale.
 * @param target - Selected display, or null for the primary display.
 * @returns Screenshot payload.
 */
async function captureDisplay(target: HarnessComputerTarget | null): Promise<ComputerUseCapture> {
  const requestedId = target?.id.startsWith('display:') ? Number(target.id.slice(8)) : null
  const display = electronScreen.getAllDisplays().find((row) => row.id === requestedId)
    ?? electronScreen.getPrimaryDisplay()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: display.bounds.width, height: display.bounds.height },
  })
  const source = sources.find((row) => Number(row.display_id) === display.id) ?? sources[0]
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('The selected display could not be captured.')
  }
  return capturePayload(source.thumbnail.toPNG(), display.bounds)
}

/**
 * Resolves and focuses a selected native window.
 * @param target - Selected native window.
 * @returns Matching window and bounds, or null when the window was closed.
 */
async function resolveWindow(target: HarnessComputerTarget): Promise<{
  title: string
  handle: number | null
  bounds: ComputerTargetBounds
} | null> {
  const handle = windowHandleFromTargetId(target.id)
  const title = windowTitleFromTargetId(target.id) || target.label.trim()
  for (const nativeWindow of await getWindows()) {
    const nativeHandle = nutWindowHandle(nativeWindow)
    const titleMatch = title.length > 0 && (await nativeWindow.title).trim() === title
    const handleMatch = handle != null && nativeHandle === handle
    if (!handleMatch && !titleMatch) continue
    await nativeWindow.restore()
    await nativeWindow.focus()
    const region = await nativeWindow.region
    return {
      title: target.label.trim() || title,
      handle: nativeHandle ?? handle,
      bounds: { x: region.left, y: region.top, width: region.width, height: region.height },
    }
  }
  return null
}

/**
 * Captures one selected native window.
 * @param target - Selected window target.
 * @returns Screenshot payload.
 */
async function captureWindow(target: HarnessComputerTarget): Promise<ComputerUseCapture> {
  const resolved = await resolveWindow(target)
  if (!resolved) throw new Error('The selected window is no longer available.')
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: resolved.bounds.width, height: resolved.bounds.height },
  })
  const source = sources.find((row) => {
    const sourceHandle = parseCapturerWindowHandle(row.id)
    if (resolved.handle != null && sourceHandle === resolved.handle) return true
    return row.name.trim() === resolved.title
  })
  if (source && !source.thumbnail.isEmpty()) {
    return capturePayload(source.thumbnail.toPNG(), resolved.bounds)
  }
  const path = await screen.captureRegion(`geocrm-harness-window-${Date.now()}`, {
    left: resolved.bounds.x,
    top: resolved.bounds.y,
    width: resolved.bounds.width,
    height: resolved.bounds.height,
  })
  const image = nativeImage.createFromPath(path)
  if (image.isEmpty()) throw new Error('The selected window could not be captured.')
  return capturePayload(image.toPNG(), resolved.bounds)
}

/**
 * Captures the selected Computer Use target.
 * @param target - Display or native window, or null for the primary display.
 * @returns Screenshot payload.
 */
async function captureTarget(target: HarnessComputerTarget | null): Promise<ComputerUseCapture> {
  return target?.kind === 'window' ? captureWindow(target) : captureDisplay(target)
}

/**
 * Clamps a target-relative model coordinate and translates it to the desktop.
 * @param x - Horizontal target coordinate.
 * @param y - Vertical target coordinate.
 * @param bounds - Target desktop bounds.
 * @returns Safe desktop point.
 */
function point(x: number | undefined, y: number | undefined, bounds: ComputerTargetBounds): Point {
  const relativeX = Math.max(0, Math.min(bounds.width - 1, x ?? 0))
  const relativeY = Math.max(0, Math.min(bounds.height - 1, y ?? 0))
  return new Point(bounds.x + relativeX, bounds.y + relativeY)
}

/**
 * Executes one approved, normalized desktop action.
 * @param action - Visual model action.
 * @param bounds - Selected target bounds.
 * @returns Nothing.
 */
async function executeAction(
  action: ComputerUseAction,
  bounds: ComputerTargetBounds,
): Promise<void> {
  if (action.action === 'wait') {
    await new Promise<void>((resolve) => setTimeout(
      resolve,
      Math.min(5000, Math.max(250, action.amount ?? 1000)),
    ))
    return
  }
  if (action.action === 'type') {
    await keyboard.type(action.text ?? '')
    return
  }
  if (action.action === 'press_key') {
    const keyName = (action.key ?? '').replaceAll('_', '').toLowerCase()
    const hotkey = HOTKEY_MAP[keyName]
    if (hotkey) {
      await keyboard.pressKey(...hotkey)
      await keyboard.releaseKey(...[...hotkey].reverse())
      return
    }
    const key = KEY_MAP[keyName]
    if (key === undefined) throw new Error(`Unsupported key: ${action.key ?? ''}`)
    await keyboard.pressKey(key)
    await keyboard.releaseKey(key)
    return
  }
  if (action.action === 'scroll') {
    await mouse.move(straightTo(point(action.x, action.y, bounds)))
    const amount = Math.max(1, Math.min(20, action.amount ?? 3))
    if (action.direction === 'up') await mouse.scrollUp(amount)
    else if (action.direction === 'left') await mouse.scrollLeft(amount)
    else if (action.direction === 'right') await mouse.scrollRight(amount)
    else await mouse.scrollDown(amount)
    return
  }
  await mouse.move(straightTo(point(action.x, action.y, bounds)))
  if (action.action === 'click') await mouse.leftClick()
  else if (action.action === 'double_click') await mouse.doubleClick(Button.LEFT)
  else if (action.action === 'right_click') await mouse.rightClick()
  else if (action.action === 'drag') {
    await mouse.drag(straightTo(point(action.endX, action.endY, bounds)))
  }
}

/**
 * Runs a bounded visual desktop loop using the selected backend model.
 * @param options - Provider, target, authorization, approval, and progress callbacks.
 * @returns Final Computer Use result summary.
 */
export async function runComputerUse(options: {
  apiBaseUrl: string
  accessToken: string
  provider: string
  model: string
  task: string
  target: HarnessComputerTarget | null
  onSensitiveAction?: (
    action: ComputerUseAction,
    screenshotDataUrl: string,
  ) => Promise<HarnessApprovalDecisionWire>
  onProgress?: (progress: ComputerUseProgress) => void
}): Promise<string> {
  const history: string[] = []
  for (let index = 0; index < MAX_ACTIONS; index += 1) {
    const capture = await captureTarget(options.target)
    const action = await planComputerUseAction(
      options.apiBaseUrl,
      options.accessToken,
      options.provider,
      options.model,
      options.task,
      capture.screenshotBase64,
      history,
    )
    const progress = {
      step: index + 1,
      action: action.action,
      reason: action.reason?.trim() || '',
      screenshotDataUrl: capture.previewDataUrl,
    }
    options.onProgress?.({ ...progress, status: 'inProgress' })
    if (action.action === 'done') {
      options.onProgress?.({ ...progress, status: 'completed' })
      return action.result?.trim() || 'Desktop task completed.'
    }
    if (action.sensitive) {
      const decision = await options.onSensitiveAction?.(action, capture.previewDataUrl)
        ?? 'decline'
      if (decision === 'decline') {
        options.onProgress?.({ ...progress, status: 'declined' })
        return `Computer Use stopped before a declined sensitive action: ${action.reason ?? action.action}`
      }
    }
    try {
      await executeAction(action, capture.bounds)
      options.onProgress?.({ ...progress, status: 'completed' })
    } catch (error) {
      options.onProgress?.({ ...progress, status: 'failed' })
      throw error
    }
    history.push(`${action.action}: ${action.reason ?? ''}`)
  }
  return 'Computer Use stopped after reaching the action limit.'
}
