import { useEffect, useRef, useState } from 'react'

export const DESKTOP_RAIL_QUERY = '(min-width: 768px)'
export const RAIL_DOCK_OUT_MS = 380
export const RAIL_DOCK_IN_MS = 420
const RAIL_BOOT_IN_MS = 2000

export type RailDock = 'side' | 'bottom'

export type RailMotion =
  | { phase: 'boot'; dock: RailDock }
  | { phase: 'idle'; dock: RailDock }
  | { phase: 'out'; from: RailDock }
  | { phase: 'in'; to: RailDock }

export interface RailDockState {
  /** Dock used for rail position (stays on the old edge through exit). */
  layoutDock: RailDock
  /** Desired dock from the viewport; updates immediately for shell padding. */
  targetDock: RailDock
  motion: RailMotion
  motionClass: string
  motionKey: string
}

/**
 * Reads the preferred rail dock from the viewport breakpoint.
 * @returns Side dock on md+, bottom dock below.
 */
export function readRailDock(): RailDock {
  if (typeof window === 'undefined') {
    return 'side'
  }
  return window.matchMedia(DESKTOP_RAIL_QUERY).matches ? 'side' : 'bottom'
}

/**
 * Resolves the CSS animation class for a rail dock motion phase.
 * @param motion - Current motion state.
 * @returns Animation class name, or empty when idle.
 */
export function railMotionClass(motion: RailMotion): string {
  if (motion.phase === 'boot') {
    return motion.dock === 'side'
      ? 'animate-enter-left enter-delay-1'
      : 'animate-enter enter-delay-1'
  }
  if (motion.phase === 'out') {
    return motion.from === 'side' ? 'animate-rail-dock-out-left' : 'animate-rail-dock-out-down'
  }
  if (motion.phase === 'in') {
    return motion.to === 'side' ? 'animate-rail-dock-in-left' : 'animate-rail-dock-in-up'
  }
  return ''
}

/**
 * Layout dock currently shown (kept through exit so position does not jump early).
 * @param motion - Current motion state.
 * @returns Dock used for positioning and orientation.
 */
export function layoutDockFromMotion(motion: RailMotion): RailDock {
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
 * @returns React key for the animated rail wrapper.
 */
export function railMotionKey(motion: RailMotion): string {
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
 * Tracks category-rail dock across the md breakpoint with staged exit/enter motion.
 * `targetDock` flips immediately so page padding can ease with the rail.
 * @returns Layout dock, target dock, and motion helpers for the rail.
 */
export function useRailDock(): RailDockState {
  const initialDock = readRailDock()
  const [motion, setMotion] = useState<RailMotion>(() => ({ phase: 'boot', dock: initialDock }))
  const [targetDock, setTargetDock] = useState<RailDock>(initialDock)
  const layoutDock = layoutDockFromMotion(motion)
  const desiredDockRef = useRef<RailDock>(initialDock)
  const displayedDockRef = useRef<RailDock>(initialDock)
  const cyclingRef = useRef(false)

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_RAIL_QUERY)
    let outTimer = 0
    let inTimer = 0
    let bootTimer = 0

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
        }, RAIL_DOCK_IN_MS)
      }, RAIL_DOCK_OUT_MS)
    }

    /**
     * Updates the desired dock from the media query and starts a cycle if needed.
     * @returns Nothing.
     */
    function handleDockMedia(): void {
      const next = media.matches ? 'side' : 'bottom'
      desiredDockRef.current = next
      setTargetDock(next)
      runDockCycle()
    }

    bootTimer = window.setTimeout(() => {
      setMotion((current) =>
        current.phase === 'boot' ? { phase: 'idle', dock: current.dock } : current,
      )
    }, RAIL_BOOT_IN_MS)

    media.addEventListener('change', handleDockMedia)
    return () => {
      media.removeEventListener('change', handleDockMedia)
      window.clearTimeout(outTimer)
      window.clearTimeout(inTimer)
      window.clearTimeout(bootTimer)
      cyclingRef.current = false
    }
  }, [])

  return {
    layoutDock,
    targetDock,
    motion,
    motionClass: railMotionClass(motion),
    motionKey: railMotionKey(motion),
  }
}
