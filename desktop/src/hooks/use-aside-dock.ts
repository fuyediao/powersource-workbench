import { useEffect, useRef, useState } from 'react'

export const ASIDE_SIDE_QUERY = '(min-width: 1024px)'
export const ASIDE_DOCK_OUT_MS = 380
export const ASIDE_DOCK_IN_MS = 420
const ASIDE_BOOT_IN_MS = 2000

export type AsideDock = 'side' | 'stack'

export type AsideMotion =
  | { phase: 'boot'; dock: AsideDock }
  | { phase: 'idle'; dock: AsideDock }
  | { phase: 'out'; from: AsideDock }
  | { phase: 'in'; to: AsideDock }

export interface AsideDockState {
  /** Dock used for grid placement (stays on the old edge through exit). */
  layoutDock: AsideDock
  /** Desired dock from the viewport; updates immediately. */
  targetDock: AsideDock
  motion: AsideMotion
  motionClass: string
  motionKey: string
}

/**
 * Reads the preferred widgets-aside dock from the lg breakpoint.
 * @returns Side dock on lg+, stacked dock below.
 */
export function readAsideDock(): AsideDock {
  if (typeof window === 'undefined') {
    return 'side'
  }
  return window.matchMedia(ASIDE_SIDE_QUERY).matches ? 'side' : 'stack'
}

/**
 * Resolves the CSS animation class for an aside dock motion phase.
 * @param motion - Current motion state.
 * @returns Animation class name, or empty when idle.
 */
export function asideMotionClass(motion: AsideMotion): string {
  if (motion.phase === 'boot') {
    return motion.dock === 'side'
      ? 'animate-aside-dock-in-right enter-delay-5'
      : 'animate-aside-dock-in-up enter-delay-5'
  }
  if (motion.phase === 'out') {
    return motion.from === 'side' ? 'animate-aside-dock-out-right' : 'animate-aside-dock-out-down'
  }
  if (motion.phase === 'in') {
    return motion.to === 'side' ? 'animate-aside-dock-in-right' : 'animate-aside-dock-in-up'
  }
  return ''
}

/**
 * Layout dock currently shown (kept through exit so the grid does not jump early).
 * @param motion - Current motion state.
 * @returns Dock used for grid placement.
 */
export function layoutDockFromAsideMotion(motion: AsideMotion): AsideDock {
  if (motion.phase === 'out') {
    return motion.from
  }
  if (motion.phase === 'in') {
    return motion.to
  }
  return motion.dock
}

/**
 * Stable remount key so enter→idle does not remount, but exit/enter restart cleanly.
 * @param motion - Current motion state.
 * @returns React key for the animated aside wrapper.
 */
export function asideMotionKey(motion: AsideMotion): string {
  if (motion.phase === 'boot') {
    return `boot-${motion.dock}`
  }
  if (motion.phase === 'out') {
    return `out-${motion.from}`
  }
  const dock = motion.phase === 'in' ? motion.to : motion.dock
  return `dock-${dock}`
}

/**
 * Tracks Markets/News aside placement across the lg breakpoint with staged exit/enter.
 * Boot enter is deferred until the aside is actually shown so async widget prefs
 * do not consume the startup animation while the column is still unmounted.
 * @param visible - Whether the aside column is mounted.
 * @returns Layout dock, target dock, and motion helpers for the widgets aside.
 */
export function useAsideDock(visible = true): AsideDockState {
  const initialDock = readAsideDock()
  const [motion, setMotion] = useState<AsideMotion>(() => ({ phase: 'boot', dock: initialDock }))
  const [targetDock, setTargetDock] = useState<AsideDock>(initialDock)
  const layoutDock = layoutDockFromAsideMotion(motion)
  const desiredDockRef = useRef<AsideDock>(initialDock)
  const displayedDockRef = useRef<AsideDock>(initialDock)
  const cyclingRef = useRef(false)

  useEffect(() => {
    if (!visible) {
      return
    }

    const media = window.matchMedia(ASIDE_SIDE_QUERY)
    let outTimer = 0
    let inTimer = 0
    let bootTimer = 0

    setMotion((current) =>
      current.phase === 'idle' ? { phase: 'boot', dock: current.dock } : current,
    )

    /**
     * Runs exit → reposition → enter when the desired dock differs from the displayed dock.
     * @returns Nothing.
     */
    function runDockCycle(): void {
      if (cyclingRef.current) {
        return
      }
      if (desiredDockRef.current === displayedDockRef.current) {
        return
      }

      cyclingRef.current = true
      const from = displayedDockRef.current
      setMotion({ phase: 'out', from })

      outTimer = window.setTimeout(() => {
        const latest = desiredDockRef.current
        if (latest === from) {
          displayedDockRef.current = from
          setMotion({ phase: 'idle', dock: from })
          cyclingRef.current = false
          return
        }
        displayedDockRef.current = latest
        setMotion({ phase: 'in', to: latest })
        inTimer = window.setTimeout(() => {
          setMotion({ phase: 'idle', dock: latest })
          cyclingRef.current = false
          if (desiredDockRef.current !== displayedDockRef.current) {
            runDockCycle()
          }
        }, ASIDE_DOCK_IN_MS)
      }, ASIDE_DOCK_OUT_MS)
    }

    /**
     * Updates the desired dock from the media query and starts a cycle if needed.
     * @returns Nothing.
     */
    function handleDockMedia(): void {
      const next = media.matches ? 'side' : 'stack'
      desiredDockRef.current = next
      setTargetDock(next)
      runDockCycle()
    }

    bootTimer = window.setTimeout(() => {
      setMotion((current) =>
        current.phase === 'boot' ? { phase: 'idle', dock: current.dock } : current,
      )
    }, ASIDE_BOOT_IN_MS)

    media.addEventListener('change', handleDockMedia)
    return () => {
      media.removeEventListener('change', handleDockMedia)
      window.clearTimeout(outTimer)
      window.clearTimeout(inTimer)
      window.clearTimeout(bootTimer)
      cyclingRef.current = false
    }
  }, [visible])

  return {
    layoutDock,
    targetDock,
    motion,
    motionClass: asideMotionClass(motion),
    motionKey: asideMotionKey(motion),
  }
}
