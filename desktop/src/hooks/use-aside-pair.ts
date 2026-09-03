import { useEffect, useRef, useState } from 'react'

export const ASIDE_PAIR_QUERY = '(min-width: 640px)'
export const ASIDE_PAIR_OUT_MS = 320
export const ASIDE_PAIR_IN_MS = 380

export type AsidePair = 'pair' | 'column'

export type AsidePairMotion =
  | { phase: 'idle'; pair: AsidePair }
  | { phase: 'out'; from: AsidePair }
  | { phase: 'in'; to: AsidePair }

export interface AsidePairState {
  /** Pair layout used for the Markets/News grid (kept through exit). */
  layoutPair: AsidePair
  motion: AsidePairMotion
  motionClass: string
}

/**
 * Reads whether Markets/News should sit side-by-side (sm+) or stacked.
 * @returns Pair layout on sm+, column layout below.
 */
export function readAsidePair(): AsidePair {
  if (typeof window === 'undefined') {
    return 'pair'
  }
  return window.matchMedia(ASIDE_PAIR_QUERY).matches ? 'pair' : 'column'
}

/**
 * Resolves the CSS animation class for an aside pair motion phase.
 * @param motion - Current motion state.
 * @returns Animation class name, or empty when idle.
 */
export function asidePairMotionClass(motion: AsidePairMotion): string {
  if (motion.phase === 'out') {
    return motion.from === 'pair' ? 'animate-aside-pair-out' : 'animate-aside-pair-out-down'
  }
  if (motion.phase === 'in') {
    return motion.to === 'pair' ? 'animate-aside-pair-in' : 'animate-aside-pair-in-up'
  }
  return ''
}

/**
 * Pair layout currently shown (kept through exit so columns do not jump early).
 * @param motion - Current motion state.
 * @returns Pair layout for the widgets grid.
 */
export function layoutPairFromMotion(motion: AsidePairMotion): AsidePair {
  if (motion.phase === 'out') {
    return motion.from
  }
  if (motion.phase === 'in') {
    return motion.to
  }
  return motion.pair
}

/**
 * Tracks Markets/News row vs column layout across the sm breakpoint.
 * Only animates while `enabled` (widgets are already under the apps panel).
 * @param enabled - When false, syncs to the media query without exit/enter motion.
 * @returns Pair layout and motion helpers for the widgets grid.
 */
export function useAsidePair(enabled: boolean): AsidePairState {
  const initialPair = readAsidePair()
  const [motion, setMotion] = useState<AsidePairMotion>(() => ({
    phase: 'idle',
    pair: initialPair,
  }))
  const layoutPair = layoutPairFromMotion(motion)
  const desiredPairRef = useRef<AsidePair>(initialPair)
  const displayedPairRef = useRef<AsidePair>(initialPair)
  const cyclingRef = useRef(false)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    const media = window.matchMedia(ASIDE_PAIR_QUERY)
    let outTimer = 0
    let inTimer = 0

    /**
     * Snaps pair layout to the media query without animation.
     * @returns Nothing.
     */
    function snapToMedia(): void {
      window.clearTimeout(outTimer)
      window.clearTimeout(inTimer)
      cyclingRef.current = false
      const next = media.matches ? 'pair' : 'column'
      desiredPairRef.current = next
      displayedPairRef.current = next
      setMotion({ phase: 'idle', pair: next })
    }

    /**
     * Runs exit → reposition → enter when the desired pair differs from the displayed pair.
     * @returns Nothing.
     */
    function runPairCycle(): void {
      if (!enabledRef.current || cyclingRef.current) {
        return
      }
      if (desiredPairRef.current === displayedPairRef.current) {
        return
      }

      cyclingRef.current = true
      const from = displayedPairRef.current
      setMotion({ phase: 'out', from })

      outTimer = window.setTimeout(() => {
        const latest = desiredPairRef.current
        if (latest === from) {
          displayedPairRef.current = from
          setMotion({ phase: 'idle', pair: from })
          cyclingRef.current = false
          return
        }
        displayedPairRef.current = latest
        setMotion({ phase: 'in', to: latest })
        inTimer = window.setTimeout(() => {
          setMotion({ phase: 'idle', pair: latest })
          cyclingRef.current = false
          if (desiredPairRef.current !== displayedPairRef.current) {
            runPairCycle()
          }
        }, ASIDE_PAIR_IN_MS)
      }, ASIDE_PAIR_OUT_MS)
    }

    /**
     * Updates the desired pair from the media query.
     * @returns Nothing.
     */
    function handlePairMedia(): void {
      const next = media.matches ? 'pair' : 'column'
      desiredPairRef.current = next
      if (!enabledRef.current) {
        snapToMedia()
        return
      }
      runPairCycle()
    }

    if (!enabled) {
      snapToMedia()
    }

    media.addEventListener('change', handlePairMedia)
    return () => {
      media.removeEventListener('change', handlePairMedia)
      window.clearTimeout(outTimer)
      window.clearTimeout(inTimer)
      cyclingRef.current = false
    }
  }, [enabled])

  return {
    layoutPair,
    motion,
    motionClass: asidePairMotionClass(motion),
  }
}
