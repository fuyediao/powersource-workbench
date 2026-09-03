/**
 * Live elapsed-seconds counter while an AI reply is in flight (Vue `useLoadingTimer` parity).
 */

import { useEffect, useState } from 'react'

/**
 * Returns elapsed seconds while `isLoading` is true; resets to 0 when idle.
 *
 * @param isLoading - Whether a reply is currently being generated
 * @returns Elapsed seconds (one decimal step every 100ms)
 */
export function useLoadingTimer(isLoading: boolean): number {
  const [loadingSeconds, setLoadingSeconds] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      setLoadingSeconds(0)
      return
    }

    setLoadingSeconds(0)
    const startTime = Date.now()
    const interval = window.setInterval(() => {
      setLoadingSeconds((Date.now() - startTime) / 1000)
    }, 100)

    return () => {
      window.clearInterval(interval)
    }
  }, [isLoading])

  return loadingSeconds
}
