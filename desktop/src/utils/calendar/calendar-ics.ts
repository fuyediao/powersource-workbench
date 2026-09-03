/**
 * Minimal iCalendar (ICS) import/export for GeoCRM calendar events.
 * Supports VEVENT SUMMARY, DESCRIPTION, DTSTART/DTEND (date or date-time),
 * RRULE, and EXDATE. Attendees and time zones beyond UTC/Z are best-effort.
 */

/** One event extracted from or written to an ICS file. */
export interface IcsEventDraft {
  title: string
  description: string
  startAt: string
  endAt: string
  allDay: boolean
  rrule: string | null
  exdate: string[]
}

/**
 * Unfolds ICS line folding (CRLF + space/tab continuation).
 * @param raw - Raw ICS text.
 * @returns Unfolded text with LF newlines.
 */
function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
}

/**
 * Unescapes ICS TEXT property values.
 * @param value - Escaped text.
 * @returns Plain text.
 */
function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/**
 * Escapes ICS TEXT property values.
 * @param value - Plain text.
 * @returns Escaped text.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Parses a CONTENT-LINE into name, params, and value.
 * @param line - Unfolded content line.
 * @returns Parts, or null when invalid.
 */
function parseContentLine(
  line: string,
): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':')
  if (colon <= 0) {
    return null
  }
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const semi = left.indexOf(';')
  if (semi === -1) {
    return { name: left.toUpperCase(), params: '', value }
  }
  return {
    name: left.slice(0, semi).toUpperCase(),
    params: left.slice(semi + 1).toUpperCase(),
    value,
  }
}

/**
 * Parses DTSTART/DTEND into ISO start/end and all-day flag.
 * Google-style DATE end is exclusive; we convert to inclusive for GeoCRM.
 * @param value - Property value.
 * @param params - Property parameters.
 * @returns Instant ISO, allDay, and optional exclusive-date marker.
 */
function parseIcsDateTime(
  value: string,
  params: string,
): { iso: string; allDay: boolean; exclusiveDate: boolean } | null {
  const trimmed = value.trim()
  const isDate = params.includes('VALUE=DATE') || (/^\d{8}$/.test(trimmed) && !trimmed.includes('T'))
  if (isDate) {
    const compact = trimmed.replace(/-/g, '').slice(0, 8)
    if (!/^\d{8}$/.test(compact)) {
      return null
    }
    const y = compact.slice(0, 4)
    const m = compact.slice(4, 6)
    const d = compact.slice(6, 8)
    return {
      iso: `${y}-${m}-${d}T00:00:00.000Z`,
      allDay: true,
      exclusiveDate: true,
    }
  }
  const normalized = trimmed.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/i,
    '$1-$2-$3T$4:$5:$6Z',
  )
  const ms = Date.parse(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
  if (Number.isNaN(ms)) {
    const fallback = Date.parse(trimmed)
    if (Number.isNaN(fallback)) {
      return null
    }
    return { iso: new Date(fallback).toISOString(), allDay: false, exclusiveDate: false }
  }
  return { iso: new Date(ms).toISOString(), allDay: false, exclusiveDate: false }
}

/**
 * Parses EXDATE values (comma-separated) into ISO instants.
 * @param value - EXDATE value.
 * @param params - Parameters (VALUE=DATE or not).
 * @returns ISO strings.
 */
function parseExdates(value: string, params: string): string[] {
  const out: string[] = []
  for (const part of value.split(',')) {
    const parsed = parseIcsDateTime(part.trim(), params)
    if (parsed) {
      out.push(parsed.iso)
    }
  }
  return out
}

/**
 * Subtracts one calendar day from an all-day UTC midnight ISO (inclusive end).
 * @param iso - Exclusive end date as ISO.
 * @returns Inclusive end ISO.
 */
function allDayExclusiveToInclusive(iso: string): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString()
}

/**
 * Adds one calendar day for Google/ICS exclusive all-day end.
 * @param iso - Inclusive end date as ISO.
 * @returns Exclusive end date YYYYMMDD.
 */
function allDayInclusiveToExclusiveCompact(iso: string): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + 1)
  return formatCompactDate(d)
}

/**
 * Formats a Date as YYYYMMDD (UTC).
 * @param d - Date.
 * @returns Compact date.
 */
function formatCompactDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * Formats a Date as YYYYMMDDTHHMMSSZ (UTC).
 * @param d - Date.
 * @returns Compact UTC date-time.
 */
function formatCompactDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Parses an ICS document into event drafts.
 * @param raw - File contents.
 * @returns Parsed events (may be empty).
 */
export function parseIcs(raw: string): IcsEventDraft[] {
  const text = unfoldIcs(raw)
  const lines = text.split('\n').map((line) => line.trimEnd())
  const events: IcsEventDraft[] = []
  let inEvent = false
  let title = ''
  let description = ''
  let start: ReturnType<typeof parseIcsDateTime> = null
  let end: ReturnType<typeof parseIcsDateTime> = null
  let rrule: string | null = null
  let exdate: string[] = []

  /**
   * Flushes the current VEVENT into the result list.
   * @returns Nothing.
   */
  function flush(): void {
    if (!start) {
      return
    }
    let endIso = end?.iso ?? start.iso
    const allDay = start.allDay || Boolean(end?.allDay)
    if (allDay && end?.exclusiveDate) {
      endIso = allDayExclusiveToInclusive(endIso)
      if (new Date(endIso).getTime() < new Date(start.iso).getTime()) {
        endIso = start.iso
      }
    }
    if (new Date(endIso).getTime() < new Date(start.iso).getTime()) {
      endIso = start.iso
    }
    events.push({
      title: title.trim() || '(No title)',
      description: description.trim(),
      startAt: start.iso,
      endAt: endIso,
      allDay,
      rrule,
      exdate,
    })
  }

  for (const line of lines) {
    if (!line) {
      continue
    }
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      title = ''
      description = ''
      start = null
      end = null
      rrule = null
      exdate = []
      continue
    }
    if (upper === 'END:VEVENT') {
      if (inEvent) {
        flush()
      }
      inEvent = false
      continue
    }
    if (!inEvent) {
      continue
    }
    const parsed = parseContentLine(line)
    if (!parsed) {
      continue
    }
    switch (parsed.name) {
      case 'SUMMARY':
        title = unescapeIcsText(parsed.value)
        break
      case 'DESCRIPTION':
        description = unescapeIcsText(parsed.value)
        break
      case 'DTSTART':
        start = parseIcsDateTime(parsed.value, parsed.params)
        break
      case 'DTEND':
        end = parseIcsDateTime(parsed.value, parsed.params)
        break
      case 'RRULE':
        rrule = parsed.value.trim().replace(/^RRULE:/i, '')
        break
      case 'EXDATE':
        exdate = [...exdate, ...parseExdates(parsed.value, parsed.params)]
        break
      default:
        break
    }
  }
  return events
}

/**
 * Serializes event drafts to an ICS calendar document.
 * @param events - Events to export.
 * @param calendarName - Optional X-WR-CALNAME.
 * @returns ICS text (CRLF).
 */
export function serializeIcs(events: IcsEventDraft[], calendarName?: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GeoCRM//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  if (calendarName?.trim()) {
    lines.push(`X-WR-CALNAME:${escapeIcsText(calendarName.trim())}`)
  }
  for (const event of events) {
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@geocrm`
    const start = new Date(event.startAt)
    const end = new Date(event.endAt)
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${formatCompactDateTime(new Date())}`)
    lines.push(`SUMMARY:${escapeIcsText(event.title || '(No title)')}`)
    if (event.description.trim()) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
    }
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatCompactDate(start)}`)
      lines.push(`DTEND;VALUE=DATE:${allDayInclusiveToExclusiveCompact(event.endAt)}`)
    } else {
      lines.push(`DTSTART:${formatCompactDateTime(start)}`)
      lines.push(`DTEND:${formatCompactDateTime(end)}`)
    }
    if (event.rrule?.trim()) {
      const body = event.rrule.trim().replace(/^RRULE:/i, '')
      lines.push(`RRULE:${body}`)
    }
    for (const iso of event.exdate) {
      const d = new Date(iso)
      if (event.allDay) {
        lines.push(`EXDATE;VALUE=DATE:${formatCompactDate(d)}`)
      } else {
        lines.push(`EXDATE:${formatCompactDateTime(d)}`)
      }
    }
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}
