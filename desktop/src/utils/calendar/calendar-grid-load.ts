import 'temporal-polyfill/global'
import {
  ensureDefaultCalendar,
  type CalendarListRecord,
  type CalendarListScope,
} from '@/services/calendar-calendars-api'
import {
  listCalendarEvents,
  type CalendarEventRecord,
  type CalendarEventScope,
} from '@/services/calendar-api'
import {
  loadCalendarDefaultView,
  type CalendarViewPref,
} from '@/utils/calendar/calendar-prefs'

/** Snapshot of named calendars + events for one Calendar scope/range. */
export interface CalendarGridSnapshot {
  scopeKey: string
  calendars: CalendarListRecord[]
  records: CalendarEventRecord[]
  rangeStart: string
  rangeEnd: string
}

const snapshotCache = new Map<string, Promise<CalendarGridSnapshot>>()

/**
 * Cache key for a personal or group calendar scope.
 * @param scope - Owner or group.
 * @returns Stable key.
 */
export function calendarGridScopeKey(scope: CalendarEventScope): string {
  return 'ownerUserId' in scope ? `personal:${scope.ownerUserId}` : `group:${scope.groupId}`
}

/**
 * Whether a Schedule-X view needs the wide (multi-year) event window.
 * @param view - Active or preferred view id.
 * @returns True for year and list.
 */
export function isWideCalendarGridView(view: string): boolean {
  return view === 'year' || view === 'list'
}

/**
 * Inclusive ISO window used to query `calendar_events`.
 * @param view - View that determines range width.
 * @returns Range instants.
 */
export function calendarGridRange(view: CalendarViewPref | string): {
  rangeStart: string
  rangeEnd: string
} {
  const now = Temporal.Now.zonedDateTimeISO()
  if (isWideCalendarGridView(view)) {
    const y = now.toPlainDate().year
    return {
      rangeStart: Temporal.PlainDate.from({ year: y - 1, month: 1, day: 1 })
        .toZonedDateTime(now.timeZoneId)
        .toInstant()
        .toString(),
      rangeEnd: Temporal.PlainDate.from({ year: y + 1, month: 12, day: 31 })
        .toZonedDateTime({
          timeZone: now.timeZoneId,
          plainTime: Temporal.PlainTime.from('23:59:59'),
        })
        .toInstant()
        .toString(),
    }
  }
  return {
    rangeStart: now.subtract({ months: 2 }).toInstant().toString(),
    rangeEnd: now.add({ months: 4 }).toInstant().toString(),
  }
}

/**
 * Cache key including range width so week/month prefetch is not reused for year.
 * @param scope - Owner or group.
 * @param view - View that determines range width.
 * @returns Cache key.
 */
function snapshotCacheKey(scope: CalendarEventScope, view: string): string {
  const width = isWideCalendarGridView(view) ? 'wide' : 'near'
  return `${calendarGridScopeKey(scope)}:${width}`
}

/**
 * Drops cached grid snapshots so the next load hits the network.
 * @param scopeKey - Optional scope prefix; omit to clear all.
 * @returns Nothing.
 */
export function invalidateCalendarGridCache(scopeKey?: string): void {
  if (!scopeKey) {
    snapshotCache.clear()
    return
  }
  for (const key of snapshotCache.keys()) {
    if (key.startsWith(`${scopeKey}:`)) {
      snapshotCache.delete(key)
    }
  }
}

/**
 * Loads named calendars and events, sharing in-flight / fresh results across
 * CalendarPage (menubar) and Schedule-X host so the first open is one query.
 * @param scope - Owner or group.
 * @param defaultCalendarName - Label for a newly created default calendar.
 * @param view - View used to pick the query window.
 * @param options - Pass `refresh` after mutations so the cache is skipped.
 * @returns Grid snapshot.
 */
export function loadCalendarGridSnapshot(
  scope: CalendarListScope,
  defaultCalendarName: string,
  view: CalendarViewPref | string = loadCalendarDefaultView(),
  options?: { refresh?: boolean },
): Promise<CalendarGridSnapshot> {
  const key = snapshotCacheKey(scope, view)
  if (options?.refresh) {
    snapshotCache.delete(key)
  } else {
    const hit = snapshotCache.get(key)
    if (hit) {
      return hit
    }
  }
  const promise = (async (): Promise<CalendarGridSnapshot> => {
    const calendars = await ensureDefaultCalendar(scope, defaultCalendarName)
    const { rangeStart, rangeEnd } = calendarGridRange(view)
    const records = await listCalendarEvents(scope, rangeStart, rangeEnd)
    return {
      scopeKey: calendarGridScopeKey(scope),
      calendars,
      records,
      rangeStart,
      rangeEnd,
    }
  })()
  snapshotCache.set(key, promise)
  return promise
}
