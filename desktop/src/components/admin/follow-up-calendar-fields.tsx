/**
 * Personal / group calendar scope + named calendar picker for follow-up create.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarSelectField } from '@/components/calendar/calendar-select-field'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { SlidingSegmented } from '@/components/ui/sliding-segmented'
import {
  useCalendarScope,
  type CalendarScopeMode,
} from '@/hooks/use-calendar-scope'
import {
  ensureDefaultCalendar,
  type CalendarListRecord,
} from '@/services/calendar-calendars-api'

/** Active calendar target for creating a follow-up event. */
export interface FollowUpCalendarSelection {
  mode: CalendarScopeMode
  groupId: string | null
  calendarId: string
}

interface FollowUpCalendarFieldsProps {
  /** Signed-in user id. */
  userId: string
  /** When true, disables controls (e.g. while saving). */
  disabled?: boolean
  /** Latest selection for parent validation / submit. */
  onSelectionChange: (selection: FollowUpCalendarSelection) => void
}

/**
 * Picks a default calendar id from a list.
 * @param rows - Calendars in the active scope.
 * @param preferred - Previous id when still present.
 * @returns Calendar id or empty string.
 */
function pickCalendarId(rows: CalendarListRecord[], preferred: string): string {
  if (preferred && rows.some((row) => row.id === preferred)) {
    return preferred
  }
  return rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? ''
}

/**
 * Scope toggle + optional group switcher + calendar list for todo create forms.
 * @param props - User id and selection callback.
 * @returns Form fields.
 */
export function FollowUpCalendarFields({
  userId,
  disabled = false,
  onSelectionChange,
}: FollowUpCalendarFieldsProps) {
  const { t } = useTranslation()
  const scope = useCalendarScope(userId)
  const [calendars, setCalendars] = useState<CalendarListRecord[]>([])
  const [calendarId, setCalendarId] = useState('')
  const [loading, setLoading] = useState(false)

  const canUseGroup = scope.switchableGroups.length > 0
  const mode: CalendarScopeMode =
    scope.mode === 'group' && canUseGroup ? 'group' : 'personal'
  const activeGroupId =
    mode === 'group' ? (scope.selectedGroupId ?? null) : null
  const canWriteScope =
    mode === 'personal' || scope.capabilities.canCreate

  const groupOptions = useMemo(
    () =>
      scope.switchableGroups.map((group) => ({
        value: group.id,
        label: group.name,
      })),
    [scope.switchableGroups],
  )

  /**
   * Reloads named calendars for the active personal/group scope.
   * @returns Nothing.
   */
  const reloadCalendars = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      if (!canWriteScope) {
        setCalendars([])
        setCalendarId('')
        return
      }
      const listScope =
        mode === 'personal'
          ? { ownerUserId: userId }
          : activeGroupId
            ? { groupId: activeGroupId }
            : null
      if (!listScope) {
        setCalendars([])
        setCalendarId('')
        return
      }
      const rows = await ensureDefaultCalendar(
        listScope,
        t('calendar.calendars.defaultName'),
      )
      setCalendars(rows)
      setCalendarId((prev) => pickCalendarId(rows, prev))
    } catch (err) {
      console.error('[FollowUpCalendarFields] load:', err)
      setCalendars([])
      setCalendarId('')
    } finally {
      setLoading(false)
    }
  }, [activeGroupId, canWriteScope, mode, t, userId])

  useEffect(() => {
    void reloadCalendars()
  }, [reloadCalendars])

  useEffect(() => {
    onSelectionChange({
      mode,
      groupId: activeGroupId,
      calendarId,
    })
  }, [activeGroupId, calendarId, mode, onSelectionChange])

  /**
   * Switches personal/group and persists via calendar prefs.
   * @param next - Scope mode.
   * @returns Nothing.
   */
  function handleModeChange(next: CalendarScopeMode): void {
    if (next === 'group' && !canUseGroup) {
      return
    }
    setCalendarId('')
    scope.setMode(next)
  }

  /**
   * Updates the selected group when switching calendars in group scope.
   * @param groupId - Group uuid.
   * @returns Nothing.
   */
  function handleGroupChange(groupId: string): void {
    setCalendarId('')
    scope.setSelectedGroupId(groupId || null)
  }

  const controlsDisabled = disabled || loading || scope.isLoading

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="text-xs font-bold tracking-wide text-muted uppercase">
          {t('calendar.scope.toggle')}{' '}
          <span className="text-rose-500" aria-hidden>
            *
          </span>
        </span>
        <SlidingSegmented
          value={mode}
          options={[
            {
              value: 'personal',
              label: t('calendar.scope.personal'),
            },
            {
              value: 'group',
              label: t('calendar.scope.group'),
            },
          ]}
          onChange={handleModeChange}
          ariaLabel={t('calendar.scope.toggle')}
          className="h-auto min-h-9 w-full [&_button]:py-2"
        />
        {!canUseGroup ? (
          <p className="text-[11px] font-medium text-muted">
            {t('admin.followUps.calendarGroupUnavailable')}
          </p>
        ) : null}
        {mode === 'group' && !canWriteScope ? (
          <p className="text-[11px] font-medium text-rose-600">
            {t('admin.followUps.calendarGroupReadOnly')}
          </p>
        ) : null}
      </div>

      {mode === 'group' && scope.canSwitchGroups && groupOptions.length > 1 ? (
        <div className="space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-muted uppercase">
            {t('calendar.scope.groupSwitcher')}{' '}
            <span className="text-rose-500" aria-hidden>
              *
            </span>
          </span>
          <CrmFilterSelect
            value={activeGroupId ?? ''}
            options={groupOptions}
            onChange={handleGroupChange}
            disabled={controlsDisabled}
            ariaLabel={t('calendar.scope.groupSwitcher')}
            className="w-full"
          />
        </div>
      ) : null}

      <CalendarSelectField
        label={
          <>
            {t('calendar.dialog.calendar')}{' '}
            <span className="text-rose-500" aria-hidden>
              *
            </span>
          </>
        }
        calendars={calendars}
        value={calendarId}
        disabled={controlsDisabled || calendars.length === 0}
        onChange={setCalendarId}
      />
    </div>
  )
}
