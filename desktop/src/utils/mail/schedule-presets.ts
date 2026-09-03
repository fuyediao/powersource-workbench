export type MailSchedulePresetId = 'laterToday' | 'tomorrowMorning' | 'tomorrowEvening' | 'nextWeek'

export interface MailSchedulePreset {
  id: MailSchedulePresetId
  labelKey: string
  at: Date
}

/**
 * Builds a Date at local hours:minutes on the given day offset.
 * @param dayOffset - Days from today.
 * @param hours - Hour of day.
 * @param minutes - Minute of hour.
 * @returns Date.
 */
function atLocal(dayOffset: number, hours: number, minutes: number): Date {
  const next = new Date()
  next.setDate(next.getDate() + dayOffset)
  next.setHours(hours, minutes, 0, 0)
  return next
}

/**
 * Snooze / send-later presets used by the calendar menu.
 * @param now - Reference time.
 * @returns Presets in the future.
 */
export function mailSchedulePresets(now = new Date()): MailSchedulePreset[] {
  const laterToday = atLocal(0, 18, 0)
  const tomorrowMorning = atLocal(1, 8, 0)
  const tomorrowEvening = atLocal(1, 18, 0)
  const nextWeek = atLocal(7, 8, 0)
  const rows: MailSchedulePreset[] = [
    { id: 'laterToday', labelKey: 'mail.schedule.laterToday', at: laterToday },
    { id: 'tomorrowMorning', labelKey: 'mail.schedule.tomorrowMorning', at: tomorrowMorning },
    { id: 'tomorrowEvening', labelKey: 'mail.schedule.tomorrowEvening', at: tomorrowEvening },
    { id: 'nextWeek', labelKey: 'mail.schedule.nextWeek', at: nextWeek },
  ]
  return rows.filter((row) => row.at.getTime() > now.getTime() + 60_000)
}

/**
 * Formats a datetime-local input value from a Date.
 * @param date - Date.
 * @returns `YYYY-MM-DDTHH:mm`.
 */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Parses a datetime-local input value.
 * @param value - Input value.
 * @returns Date, or null when invalid / past.
 */
export function parseDatetimeLocalValue(value: string): Date | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now() + 30_000) {
    return null
  }
  return parsed
}
