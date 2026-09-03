import { useLayoutEffect, useState } from 'react'

const DEFAULT_DURATION_MS = 280

interface DialogPresence {
  mounted: boolean
  leaving: boolean
}

/**
 * Keeps a dialog mounted through its leave animation after `open` becomes false.
 * Open and leave flags update in `useLayoutEffect` so the first paint already has
 * the correct enter/leave class (avoids a one-frame flash).
 * @param open - Whether the dialog should be shown.
 * @param durationMs - Leave animation duration before unmount.
 * @returns Mounted flag and whether the leave animation is playing.
 */
export function useDialogPresence(
  open: boolean,
  durationMs = DEFAULT_DURATION_MS,
): DialogPresence {
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)

  useLayoutEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return
    }

    if (!mounted) {
      return
    }

    setLeaving(true)
    const timer = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, durationMs)

    return () => window.clearTimeout(timer)
  }, [open, mounted, durationMs])

  return { mounted, leaving }
}
