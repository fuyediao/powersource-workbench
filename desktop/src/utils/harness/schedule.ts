/**
 * Schedule helpers shared by the Harness Scheduled view and the cron proxy.
 * Cron expressions match the Hermes `cronjob` runtime on the VPS.
 */

import type {
  HarnessSchedule,
  HarnessScheduleTemplate,
  HarnessWeekday,
} from '@/types/harness'

/** Weekday keys in display order (Monday first). */
export const HARNESS_WEEKDAYS: readonly HarnessWeekday[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]

/** Weekday key to cron day-of-week number (Sunday is 0). */
const CRON_DAY: Record<HarnessWeekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

/** Built-in office templates offered in the create form. */
export const HARNESS_SCHEDULE_TEMPLATES: readonly HarnessScheduleTemplate[] = [
  { id: 'dailyBrief', schedule: { kind: 'weekdays', time: '08:00', days: [] }, target: 'vps' },
  { id: 'weeklyReview', schedule: { kind: 'weekly', time: '16:00', days: ['fri'] }, target: 'vps' },
  {
    id: 'followUpMonitor',
    schedule: { kind: 'weekdays', time: '09:00', days: [] },
    target: 'vps',
  },
]

/**
 * Splits `HH:MM` into numeric parts, falling back to 09:00.
 * @param time - 24h time string.
 * @returns Hour and minute.
 */
function parseTime(time: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  const hour = Number(match?.[1] ?? '9')
  const minute = Number(match?.[2] ?? '0')
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return { hour: 9, minute: 0 }
  }
  return { hour, minute }
}

/**
 * Returns whether a value is a valid 24h `HH:MM` string.
 * @param time - Candidate value.
 * @returns True when the string is a usable time.
 */
export function isValidScheduleTime(time: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) {
    return false
  }
  return Number(match[1]) <= 23 && Number(match[2]) <= 59
}

/**
 * Converts a schedule to a Hermes cron expression.
 * @param schedule - Recurrence chosen in the UI.
 * @returns Five-field cron string.
 */
export function scheduleToCron(schedule: HarnessSchedule): string {
  const { hour, minute } = parseTime(schedule.time)
  if (schedule.kind === 'daily') {
    return `${minute} ${hour} * * *`
  }
  if (schedule.kind === 'weekdays') {
    return `${minute} ${hour} * * 1-5`
  }
  const days = schedule.days.length > 0 ? schedule.days : (['mon'] as HarnessWeekday[])
  const sorted = [...new Set(days)].map((day) => CRON_DAY[day]).sort((a, b) => a - b)
  return `${minute} ${hour} * * ${sorted.join(',')}`
}

/**
 * Whether a schedule fires on the given weekday.
 * @param schedule - Recurrence to test.
 * @param jsDay - `Date.getDay()` value (Sunday is 0).
 * @returns True when the day is included.
 */
function firesOnDay(schedule: HarnessSchedule, jsDay: number): boolean {
  if (schedule.kind === 'daily') {
    return true
  }
  if (schedule.kind === 'weekdays') {
    return jsDay >= 1 && jsDay <= 5
  }
  const days = schedule.days.length > 0 ? schedule.days : (['mon'] as HarnessWeekday[])
  return days.some((day) => CRON_DAY[day] === jsDay)
}

/**
 * Computes the next local fire time for a schedule.
 * @param schedule - Recurrence to evaluate.
 * @param fromMs - Reference timestamp; defaults to now.
 * @returns Epoch milliseconds of the next run, or null when unreachable.
 */
export function nextRunAtMs(schedule: HarnessSchedule, fromMs: number = Date.now()): number | null {
  const { hour, minute } = parseTime(schedule.time)
  const cursor = new Date(fromMs)
  cursor.setSeconds(0, 0)

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(cursor)
    candidate.setDate(cursor.getDate() + offset)
    candidate.setHours(hour, minute, 0, 0)
    if (candidate.getTime() > fromMs && firesOnDay(schedule, candidate.getDay())) {
      return candidate.getTime()
    }
  }
  return null
}
