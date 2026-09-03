import { apiGetJson } from './api-client'

export interface NewsBriefingItem {
  title: string
  description: string
  url: string
  source: string
}

/**
 * Loads news briefing items via workbench-api GET /start/news.
 * @param _limit - Unused; API returns one item (kept for call-site compatibility).
 * @returns Briefing items (empty on failure).
 */
export async function fetchNewsBriefing(_limit = 1): Promise<NewsBriefingItem[]> {
  try {
    const data = await apiGetJson<{ items?: NewsBriefingItem[] }>('/start/news')
    return Array.isArray(data.items) ? data.items : []
  } catch {
    return []
  }
}
