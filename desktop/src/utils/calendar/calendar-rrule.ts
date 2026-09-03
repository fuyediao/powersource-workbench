/**
 * RRULE helpers for calendar events (expand occurrences for Schedule-X).
 */

import { RRule, rrulestr } from 'rrule'

/** Recurrence preset used by the event dialog. */
export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'monthly'

/** Edit/delete scope for a recurring series. */
export type RecurrenceEditScope = 'this' | 'following' | 'all'

/**
 * Builds an RRULE body from a dialog preset (always bounded with COUNT).
 * @param preset - Dialog recurrence choice.
 * @param count - Occurrence count (default 12).
 * @returns RRULE string without DTSTART, or null for none.
 */
export function buildRruleFromPreset(
  preset: RecurrencePreset,
  count = 12,
): string | null {
  const safeCount = Math.min(Math.max(Math.floor(count), 1), 366)
  switch (preset) {
    case 'daily':
      return `FREQ=DAILY;COUNT=${safeCount}`
    case 'weekly':
      return `FREQ=WEEKLY;COUNT=${safeCount}`
    case 'monthly':
      return `FREQ=MONTHLY;COUNT=${safeCount}`
    default:
      return null
  }
}

/**
 * Maps a stored RRULE to a dialog preset (best-effort).
 * @param rrule - Stored RRULE body.
 * @returns Matching preset or none.
 */
export function presetFromRrule(rrule: string | null | undefined): RecurrencePreset {
  if (!rrule) {
    return 'none'
  }
  const upper = rrule.toUpperCase()
  if (upper.includes('FREQ=DAILY')) {
    return 'daily'
  }
  if (upper.includes('FREQ=WEEKLY')) {
    return 'weekly'
  }
  if (upper.includes('FREQ=MONTHLY')) {
    return 'monthly'
  }
  return 'none'
}

/**
 * Extracts COUNT from an RRULE body when present.
 * @param rrule - Stored RRULE.
 * @returns Count or default 12.
 */
export function countFromRrule(rrule: string | null | undefined): number {
  if (!rrule) {
    return 12
  }
  const match = /COUNT=(\d+)/i.exec(rrule)
  if (!match?.[1]) {
    return 12
  }
  return Math.min(Math.max(Number(match[1]), 1), 366)
}

/**
 * Parses an RRULE body with a DTSTART into an RRule instance.
 * @param rruleBody - RRULE without DTSTART (optional RRULE: prefix).
 * @param dtstart - Series start.
 * @returns Parsed rule, or null on failure.
 */
function parseRule(rruleBody: string, dtstart: Date): RRule | null {
  try {
    const normalized = rruleBody.trim().toUpperCase().startsWith('RRULE:')
      ? rruleBody.trim()
      : `RRULE:${rruleBody.trim()}`
    return rrulestr(normalized, { dtstart }) as RRule
  } catch {
    return null
  }
}

/**
 * Instant key used to compare EXDATE / occurrence starts.
 * @param iso - Instant ISO string.
 * @returns Epoch milliseconds, or NaN.
 */
export function occurrenceInstantMs(iso: string): number {
  return new Date(iso).getTime()
}

/**
 * Returns whether an occurrence start is listed in EXDATE.
 * @param occurrenceStartIso - Occurrence start.
 * @param exdates - Stored exception instants.
 * @returns True when excluded.
 */
export function isOccurrenceExcluded(
  occurrenceStartIso: string,
  exdates: string[] | null | undefined,
): boolean {
  if (!exdates || exdates.length === 0) {
    return false
  }
  const target = occurrenceInstantMs(occurrenceStartIso)
  if (Number.isNaN(target)) {
    return false
  }
  return exdates.some((iso) => occurrenceInstantMs(iso) === target)
}

export interface ExpandedOccurrence {
  startAt: string
  endAt: string
}

/**
 * Expands a master event RRULE into occurrences overlapping a window.
 * @param startAtIso - Master start instant.
 * @param endAtIso - Master end instant.
 * @param rruleBody - RRULE without DTSTART.
 * @param rangeStartIso - Window start.
 * @param rangeEndIso - Window end.
 * @param exdates - Optional excluded occurrence starts.
 * @returns Occurrence start/end ISO pairs.
 */
export function expandRruleOccurrences(
  startAtIso: string,
  endAtIso: string,
  rruleBody: string,
  rangeStartIso: string,
  rangeEndIso: string,
  exdates: string[] | null | undefined = undefined,
): ExpandedOccurrence[] {
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return []
  }
  const durationMs = Math.max(end.getTime() - start.getTime(), 0)
  const rangeStart = new Date(rangeStartIso)
  const rangeEnd = new Date(rangeEndIso)
  try {
    const rule = parseRule(rruleBody, start)
    if (!rule) {
      if (isOccurrenceExcluded(startAtIso, exdates)) {
        return []
      }
      return [{ startAt: startAtIso, endAt: endAtIso }]
    }
    // Cap expansion so pathological RRULEs cannot freeze the calendar UI.
    const dates = rule.between(rangeStart, rangeEnd, true).slice(0, 400)
    return dates
      .map((date) => {
        const occStart = date.toISOString()
        const occEnd = new Date(date.getTime() + durationMs).toISOString()
        return { startAt: occStart, endAt: occEnd }
      })
      .filter((occ) => !isOccurrenceExcluded(occ.startAt, exdates))
  } catch (err) {
    console.error('expandRruleOccurrences failed', err)
    if (isOccurrenceExcluded(startAtIso, exdates)) {
      return []
    }
    return [{ startAt: startAtIso, endAt: endAtIso }]
  }
}

/** Separator between master uuid and occurrence epoch ms (CSS querySelector-safe). */
const OCCURRENCE_ID_SEP = '__'

/**
 * Builds a stable Schedule-X id for an expanded occurrence.
 * @param masterId - Persisted event uuid.
 * @param startAtIso - Occurrence start.
 * @returns Composite id (uuid + `__` + epochMs; tilde is invalid for Schedule-X).
 */
export function occurrenceScheduleId(masterId: string, startAtIso: string): string {
  return `${masterId}${OCCURRENCE_ID_SEP}${new Date(startAtIso).getTime()}`
}

/**
 * Splits a Schedule-X id into master uuid and optional occurrence epoch.
 * @param scheduleId - Grid event id.
 * @returns Master id and epoch ms when present.
 */
function splitScheduleId(scheduleId: string): { masterId: string; epochMs: number | null } {
  // Prefer `__`; still accept legacy `~` from earlier builds.
  const sep = scheduleId.includes(OCCURRENCE_ID_SEP)
    ? OCCURRENCE_ID_SEP
    : scheduleId.includes('~')
      ? '~'
      : null
  if (!sep) {
    return { masterId: scheduleId, epochMs: null }
  }
  const idx = scheduleId.lastIndexOf(sep)
  if (idx <= 0) {
    return { masterId: scheduleId, epochMs: null }
  }
  const epochMs = Number(scheduleId.slice(idx + sep.length))
  if (!Number.isFinite(epochMs)) {
    return { masterId: scheduleId, epochMs: null }
  }
  return { masterId: scheduleId.slice(0, idx), epochMs }
}

/**
 * Parses a Schedule-X event id back to the master uuid.
 * @param scheduleId - Grid event id.
 * @returns Master event id.
 */
export function masterIdFromScheduleId(scheduleId: string): string {
  return splitScheduleId(scheduleId).masterId
}

/**
 * Parses the occurrence start instant from a Schedule-X composite id.
 * @param scheduleId - Grid event id (`uuid` or `uuid__epochMs`).
 * @returns ISO instant, or null when not an occurrence id.
 */
export function occurrenceStartFromScheduleId(scheduleId: string): string | null {
  const { epochMs } = splitScheduleId(scheduleId)
  if (epochMs === null) {
    return null
  }
  return new Date(epochMs).toISOString()
}

/**
 * Counts series occurrences strictly before a cut instant.
 * @param rruleBody - RRULE body.
 * @param seriesStartIso - Master DTSTART.
 * @param cutStartIso - First occurrence to exclude (this and following).
 * @returns Count of prior occurrences.
 */
export function countOccurrencesBefore(
  rruleBody: string,
  seriesStartIso: string,
  cutStartIso: string,
): number {
  const start = new Date(seriesStartIso)
  const cut = new Date(cutStartIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(cut.getTime())) {
    return 0
  }
  const rule = parseRule(rruleBody, start)
  if (!rule) {
    return start.getTime() < cut.getTime() ? 1 : 0
  }
  const dates = rule.between(start, cut, true)
  return dates.filter((date) => date.getTime() < cut.getTime()).length
}

/**
 * Truncates a series RRULE so it only covers occurrences before a cut.
 * @param rruleBody - Original RRULE.
 * @param seriesStartIso - Master DTSTART.
 * @param cutStartIso - First occurrence of the "following" segment.
 * @returns Truncated RRULE with COUNT, or null when nothing remains.
 */
export function truncateRruleBefore(
  rruleBody: string,
  seriesStartIso: string,
  cutStartIso: string,
): string | null {
  const prior = countOccurrencesBefore(rruleBody, seriesStartIso, cutStartIso)
  if (prior <= 0) {
    return null
  }
  const preset = presetFromRrule(rruleBody)
  if (preset === 'none') {
    return null
  }
  return buildRruleFromPreset(preset, prior)
}

/**
 * Shifts a master series start/end by the delta between an old and new occurrence.
 * @param masterStartIso - Current master start.
 * @param masterEndIso - Current master end.
 * @param originalOccurrenceStartIso - Clicked occurrence start before edit.
 * @param newOccurrenceStartIso - Form start after edit.
 * @param newOccurrenceEndIso - Form end after edit.
 * @returns Updated master start/end ISO pair.
 */
export function shiftSeriesByOccurrenceDelta(
  masterStartIso: string,
  masterEndIso: string,
  originalOccurrenceStartIso: string,
  newOccurrenceStartIso: string,
  newOccurrenceEndIso: string,
): { startAt: string; endAt: string } {
  const masterStart = new Date(masterStartIso)
  const masterEnd = new Date(masterEndIso)
  const originalOcc = new Date(originalOccurrenceStartIso)
  const newStart = new Date(newOccurrenceStartIso)
  const newEnd = new Date(newOccurrenceEndIso)
  if (
    [masterStart, masterEnd, originalOcc, newStart, newEnd].some((d) =>
      Number.isNaN(d.getTime()),
    )
  ) {
    return { startAt: masterStartIso, endAt: masterEndIso }
  }
  const startDelta = newStart.getTime() - originalOcc.getTime()
  const durationMs = Math.max(newEnd.getTime() - newStart.getTime(), 0)
  const nextStart = new Date(masterStart.getTime() + startDelta)
  const nextEnd = new Date(nextStart.getTime() + durationMs)
  return { startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() }
}
