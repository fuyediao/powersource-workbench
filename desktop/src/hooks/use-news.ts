import { useEffect, useState } from 'react'
import { fetchNewsBriefing, type NewsBriefingDto } from '@/utils/shared/api'

const REFRESH_MS = 5 * 60_000

/**
 * Loads the latest RSS briefing and refreshes it periodically.
 * @returns Briefing item and loading state.
 */
export function useNews(): { item: NewsBriefingDto | null; loading: boolean } {
  const [item, setItem] = useState<NewsBriefingDto | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    /**
     * Fetches the latest briefing from the backend.
     * @returns Nothing.
     */
    function refresh(): void {
      void fetchNewsBriefing()
        .then((items) => {
          if (active) {
            setItem(items[0] ?? null)
          }
        })
        .catch(() => {
          if (active) {
            setItem(null)
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false)
          }
        })
    }

    refresh()
    const intervalId = window.setInterval(refresh, REFRESH_MS)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  return { item, loading }
}
