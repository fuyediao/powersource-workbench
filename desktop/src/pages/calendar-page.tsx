/**
 * Calendar feature page shell (Aura-style): paint chrome first, defer Schedule-X.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { CalendarMenubar } from '@/components/calendar/calendar-menubar'
import { CalendarNameDialog } from '@/components/calendar/calendar-name-dialog'
import { StatusLoading } from '@/components/common/status-loading'
import { useCalendarScope } from '@/hooks/use-calendar-scope'
import {
  createCalendar,
  deleteCalendar,
  updateCalendar,
  type CalendarListRecord,
} from '@/services/calendar-calendars-api'
import { createGroupCalendarEvent, createPersonalCalendarEvent, listCalendarEvents } from '@/services/calendar-api'
import { downloadBlob, pickBinaryFile } from '@/office/office-file-io'
import { parseIcs, serializeIcs } from '@/utils/calendar/calendar-ics'
import { loadCalendarGridSnapshot } from '@/utils/calendar/calendar-grid-load'
import { loadCalendarDefaultView } from '@/utils/calendar/calendar-prefs'
import {
  patchCalendarMenuHandlers,
  setCalendarMenuView,
  unregisterCalendarMenuHost,
  usesNativeCalendarMenu,
} from '@/utils/calendar/calendar-menu'

const CalendarScheduleHost = lazy(async () => {
  const module = await import('@/components/calendar/calendar-schedule-host')
  return { default: module.CalendarScheduleHost }
})

interface CalendarPageProps {
  userId: string
  user: User
}

/**
 * Calendar page: immediate menubar shell, Schedule-X loads in a deferred chunk.
 * @param props - Signed-in user.
 * @returns Calendar UI.
 */
export function CalendarPage({ userId }: CalendarPageProps) {
  const { t } = useTranslation()
  const scope = useCalendarScope(userId)
  const [newEventRequestId, setNewEventRequestId] = useState(0)
  const [reloadRequestId, setReloadRequestId] = useState(0)
  const [calendars, setCalendars] = useState<CalendarListRecord[]>([])
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<Set<string>>(new Set())
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameDialogMounted, setNameDialogMounted] = useState(false)
  const [nameDialogMode, setNameDialogMode] = useState<'create' | 'rename'>('create')
  const [renamingCalendar, setRenamingCalendar] = useState<CalendarListRecord | null>(null)
  const [savingCalendarName, setSavingCalendarName] = useState(false)

  useEffect(() => {
    setCalendars([])
    setVisibleCalendarIds(new Set())
  }, [scope.mode, scope.selectedGroupId])

  useEffect(() => {
    const scopeKey =
      scope.mode === 'personal'
        ? { ownerUserId: userId }
        : scope.selectedGroupId
          ? { groupId: scope.selectedGroupId }
          : null
    if (!scopeKey) {
      return
    }
    let cancelled = false
    void loadCalendarGridSnapshot(
      scopeKey,
      t('calendar.calendars.defaultName'),
      loadCalendarDefaultView(),
    )
      .then((snapshot) => {
        if (!cancelled) {
          setCalendars(snapshot.calendars)
        }
      })
      .catch((err: unknown) => {
        console.error(err)
      })
    return () => {
      cancelled = true
    }
  }, [scope.mode, scope.selectedGroupId, t, userId])

  /**
   * Toggles a named calendar in the visibility filter.
   * @param calendarId - Calendar uuid.
   * @returns Nothing.
   */
  const handleToggleCalendarVisibility = useCallback((calendarId: string) => {
    setVisibleCalendarIds((prev) => {
      const allIds = new Set(calendars.map((calendar) => calendar.id))
      const next = new Set(prev.size === 0 ? allIds : prev)
      if (next.has(calendarId)) {
        next.delete(calendarId)
      } else {
        next.add(calendarId)
      }
      if (next.size === allIds.size || next.size === 0) {
        return new Set()
      }
      return next
    })
  }, [calendars])

  /**
   * Opens the add-calendar name dialog (Electron does not support window.prompt).
   * @returns Nothing.
   */
  const handleAddCalendar = useCallback(() => {
    if (!scope.capabilities.canCreate) {
      return
    }
    setNameDialogMode('create')
    setRenamingCalendar(null)
    setNameDialogMounted(true)
    setNameDialogOpen(true)
  }, [scope.capabilities.canCreate])

  /**
   * Opens the rename dialog for a named calendar.
   * @param calendar - Calendar to rename.
   * @returns Nothing.
   */
  const handleRenameCalendar = useCallback(
    (calendar: CalendarListRecord) => {
      if (scope.capabilities.readOnly) {
        return
      }
      setNameDialogMode('rename')
      setRenamingCalendar(calendar)
      setNameDialogMounted(true)
      setNameDialogOpen(true)
    },
    [scope.capabilities.readOnly],
  )

  /**
   * Creates or renames a named calendar from the dialog submission.
   * @param payload - Name and color (color ignored when renaming).
   * @returns Nothing.
   */
  const handleCalendarNameSubmit = useCallback(
    (payload: { name: string; color: string }) => {
      void (async () => {
        if (nameDialogMode === 'rename') {
          if (!renamingCalendar || renamingCalendar.name === payload.name) {
            setNameDialogOpen(false)
            return
          }
          setSavingCalendarName(true)
          try {
            const updated = await updateCalendar(renamingCalendar.id, { name: payload.name })
            setCalendars((prev) =>
              prev.map((row) => (row.id === updated.id ? updated : row)),
            )
            setReloadRequestId((id) => id + 1)
            setNameDialogOpen(false)
          } catch (err) {
            console.error(err)
          } finally {
            setSavingCalendarName(false)
          }
          return
        }

        const scopeKey =
          scope.mode === 'personal'
            ? { ownerUserId: userId }
            : scope.selectedGroupId
              ? { groupId: scope.selectedGroupId }
              : null
        if (!scopeKey) {
          return
        }
        setSavingCalendarName(true)
        try {
          const created = await createCalendar(scopeKey, payload.name, payload.color)
          setCalendars((prev) => [...prev, created])
          setReloadRequestId((id) => id + 1)
          setNameDialogOpen(false)
        } catch (err) {
          console.error(err)
        } finally {
          setSavingCalendarName(false)
        }
      })()
    },
    [nameDialogMode, renamingCalendar, scope.mode, scope.selectedGroupId, userId],
  )

  /**
   * Deletes a named calendar after confirm (promotes a sibling when removing the default).
   * @param calendar - Calendar to remove.
   * @returns Nothing.
   */
  const handleDeleteCalendar = useCallback(
    (calendar: CalendarListRecord) => {
      if (calendars.length <= 1) {
        return
      }
      if (!window.confirm(t('calendar.calendars.confirmDelete', { name: calendar.name }))) {
        return
      }
      void (async () => {
        try {
          await deleteCalendar(calendar, calendars)
          let nextList = calendars.filter((row) => row.id !== calendar.id)
          if (calendar.isDefault && nextList.length > 0) {
            const promoteId = [...nextList].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            )[0]?.id
            nextList = nextList.map((row) => ({
              ...row,
              isDefault: row.id === promoteId,
            }))
          }
          setCalendars(nextList)
          setVisibleCalendarIds((prev) => {
            if (!prev.has(calendar.id)) {
              return prev
            }
            const next = new Set(prev)
            next.delete(calendar.id)
            return next
          })
          setReloadRequestId((id) => id + 1)
        } catch (err) {
          console.error(err)
        }
      })()
    },
    [calendars, t],
  )

  /**
   * Updates a named calendar color from the palette.
   * @param calendar - Target calendar.
   * @param color - Hex color.
   * @returns Nothing.
   */
  const handleChangeCalendarColor = useCallback(
    (calendar: CalendarListRecord, color: string) => {
      if (calendar.color === color) {
        return
      }
      void (async () => {
        try {
          const updated = await updateCalendar(calendar.id, { color })
          setCalendars((prev) =>
            prev.map((row) => (row.id === updated.id ? updated : row)),
          )
          setReloadRequestId((id) => id + 1)
        } catch (err) {
          console.error(err)
        }
      })()
    },
    [],
  )

  /**
   * Imports VEVENT rows from a local .ics file into the default named calendar.
   * @returns Nothing.
   */
  const handleImportIcs = useCallback(() => {
    if (!scope.capabilities.canCreate) {
      return
    }
    void (async () => {
      const picked = await pickBinaryFile('.ics,text/calendar')
      if (!picked) {
        return
      }
      const text = new TextDecoder('utf-8').decode(picked.buffer)
      const drafts = parseIcs(text)
      if (drafts.length === 0) {
        window.alert(t('calendar.ics.importEmpty'))
        return
      }
      const target =
        calendars.find((calendar) => calendar.isDefault) ?? calendars[0] ?? null
      if (!target) {
        window.alert(t('calendar.ics.importNoCalendar'))
        return
      }
      let created = 0
      try {
        for (const draft of drafts) {
          const write = {
            title: draft.title,
            description: draft.description,
            startAt: draft.startAt,
            endAt: draft.endAt,
            allDay: draft.allDay,
            calendarId: target.id,
            rrule: draft.rrule,
            exdates: draft.exdate,
          }
          if (scope.mode === 'personal') {
            await createPersonalCalendarEvent(userId, write)
          } else if (scope.selectedGroupId) {
            await createGroupCalendarEvent(scope.selectedGroupId, userId, write)
          } else {
            return
          }
          created += 1
        }
        setReloadRequestId((id) => id + 1)
        window.alert(t('calendar.ics.importDone', { count: created }))
      } catch (err) {
        console.error(err)
        window.alert(t('calendar.ics.importFailed'))
      }
    })()
  }, [
    calendars,
    scope.capabilities.canCreate,
    scope.mode,
    scope.selectedGroupId,
    t,
    userId,
  ])

  /**
   * Exports events from visible named calendars as a downloadable .ics file.
   * @returns Nothing.
   */
  const handleExportIcs = useCallback(() => {
    void (async () => {
      const scopeKey =
        scope.mode === 'personal'
          ? { ownerUserId: userId }
          : scope.selectedGroupId
            ? { groupId: scope.selectedGroupId }
            : null
      if (!scopeKey) {
        return
      }
      const now = Date.now()
      const rangeStart = new Date(now)
      rangeStart.setMonth(rangeStart.getMonth() - 12)
      const rangeEnd = new Date(now)
      rangeEnd.setMonth(rangeEnd.getMonth() + 12)
      try {
        const records = await listCalendarEvents(
          scopeKey,
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
        )
        const visibleIds =
          visibleCalendarIds.size === 0
            ? null
            : visibleCalendarIds
        const known = new Set(calendars.map((calendar) => calendar.id))
        const drafts = records
          .filter((record) => {
            if (record.calendarId && !known.has(record.calendarId)) {
              return false
            }
            if (visibleIds && record.calendarId && !visibleIds.has(record.calendarId)) {
              return false
            }
            return true
          })
          .map((record) => ({
            title: record.title,
            description: record.description ?? '',
            startAt: record.startAt,
            endAt: record.endAt,
            allDay: record.allDay,
            rrule: record.rrule,
            exdate: record.exdates,
          }))
        if (drafts.length === 0) {
          window.alert(t('calendar.ics.exportEmpty'))
          return
        }
        const ics = serializeIcs(drafts, t('calendar.ics.exportName'))
        downloadBlob(
          `workbench-calendar-${new Date().toISOString().slice(0, 10)}.ics`,
          new Blob([ics], { type: 'text/calendar;charset=utf-8' }),
        )
      } catch (err) {
        console.error(err)
        window.alert(t('calendar.ics.exportFailed'))
      }
    })()
  }, [
    calendars,
    scope.mode,
    scope.selectedGroupId,
    t,
    userId,
    visibleCalendarIds,
  ])

  useEffect(() => {
    return () => unregisterCalendarMenuHost()
  }, [])

  useEffect(() => {
    patchCalendarMenuHandlers({
      setMode: scope.setMode,
      selectGroup: scope.setSelectedGroupId,
      newEvent: () => {
        setNewEventRequestId((id) => id + 1)
      },
      addCalendar: handleAddCalendar,
      importIcs: handleImportIcs,
      exportIcs: handleExportIcs,
      toggleCalendar: handleToggleCalendarVisibility,
      renameCalendar: (calendarId) => {
        const calendar = calendars.find((row) => row.id === calendarId)
        if (calendar) {
          handleRenameCalendar(calendar)
        }
      },
      deleteCalendar: (calendarId) => {
        const calendar = calendars.find((row) => row.id === calendarId)
        if (calendar) {
          handleDeleteCalendar(calendar)
        }
      },
    })
  }, [
    calendars,
    handleAddCalendar,
    handleDeleteCalendar,
    handleExportIcs,
    handleImportIcs,
    handleRenameCalendar,
    handleToggleCalendarVisibility,
    scope.setMode,
    scope.setSelectedGroupId,
  ])

  useEffect(() => {
    const allVisible = visibleCalendarIds.size === 0
    setCalendarMenuView({
      mode: scope.mode,
      groups: scope.switchableGroups.map((group) => ({
        id: group.id,
        label: group.name,
      })),
      selectedGroupId: scope.selectedGroupId,
      canSwitchGroups: scope.canSwitchGroups,
      canCreate: scope.capabilities.canCreate,
      calendars: calendars.map((calendar) => ({
        id: calendar.id,
        label: calendar.name,
        visible: allVisible || visibleCalendarIds.has(calendar.id),
        canRename: !scope.capabilities.readOnly,
        canDelete: scope.capabilities.canDelete && calendars.length > 1,
      })),
    })
  }, [
    calendars,
    scope.canSwitchGroups,
    scope.capabilities.canCreate,
    scope.capabilities.canDelete,
    scope.capabilities.readOnly,
    scope.mode,
    scope.selectedGroupId,
    scope.switchableGroups,
    visibleCalendarIds,
  ])

  const nativeCalendarMenu = usesNativeCalendarMenu()

  return (
    <div
      className={[
        'calendar-page feature-page flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden text-ink',
        scope.capabilities.readOnly ? 'is-readonly' : '',
        nativeCalendarMenu ? 'is-native-menu' : '',
      ].join(' ')}
    >
      <CalendarMenubar
        mode={scope.mode}
        onModeChange={scope.setMode}
        canSwitchGroups={scope.canSwitchGroups}
        switchableGroups={scope.switchableGroups}
        selectedGroupId={scope.selectedGroupId}
        onGroupChange={scope.setSelectedGroupId}
        capabilities={scope.capabilities}
        onNewEvent={() => setNewEventRequestId((id) => id + 1)}
        calendars={calendars}
        visibleCalendarIds={visibleCalendarIds}
        onToggleCalendarVisibility={handleToggleCalendarVisibility}
        onAddCalendar={handleAddCalendar}
        onRenameCalendar={handleRenameCalendar}
        onDeleteCalendar={handleDeleteCalendar}
        onChangeCalendarColor={handleChangeCalendarColor}
        onImportIcs={handleImportIcs}
        onExportIcs={handleExportIcs}
      />
      <Suspense
        fallback={<StatusLoading />}
      >
        <CalendarScheduleHost
          userId={userId}
          mode={scope.mode}
          selectedGroupId={scope.selectedGroupId}
          capabilities={scope.capabilities}
          newEventRequestId={newEventRequestId}
          reloadRequestId={reloadRequestId}
          calendars={calendars}
          visibleCalendarIds={visibleCalendarIds}
          onCalendarsChange={setCalendars}
        />
      </Suspense>
      {nameDialogMounted ? (
        <CalendarNameDialog
          open={nameDialogOpen}
          saving={savingCalendarName}
          mode={nameDialogMode}
          initialName={
            nameDialogMode === 'rename'
              ? renamingCalendar?.name
              : undefined
          }
          initialColor={
            nameDialogMode === 'rename'
              ? renamingCalendar?.color
              : undefined
          }
          onClose={() => setNameDialogOpen(false)}
          onExited={() => {
            setNameDialogMounted(false)
            setRenamingCalendar(null)
            setNameDialogMode('create')
          }}
          onSubmit={handleCalendarNameSubmit}
        />
      ) : null}
    </div>
  )
}
