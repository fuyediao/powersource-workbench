import { useState } from 'preact/hooks'
import { useSignalEffect } from '@preact/signals'
import { PreactViewComponent } from '@schedule-x/shared/src/types/calendar/preact-view-component'
import { InternalViewName } from '@schedule-x/shared/src/enums/calendar/internal-view.enum'
import { isToday } from '@schedule-x/shared/src/utils/stateless/time/comparison'
import { getDayNameShort } from '@schedule-x/shared/src/utils/stateless/time/date-time-localization/date-time-localization'
import { Month } from '@schedule-x/shared/src/enums/time/month.enum'

/**
 * Builds short weekday labels in firstDayOfWeek order.
 * @param weekStart - Schedule-X WeekDay (1=Mon … 7=Sun).
 * @param locale - BCP 47 locale.
 * @param timezone - IANA timezone.
 * @returns Seven short weekday names.
 */
function weekdayLabelsFor(
  weekStart: number,
  locale: string,
  timezone: string
): string[] {
  return Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = ((weekStart - 1 + index) % 7) + 1
    let d = Temporal.PlainDate.from({ year: 2024, month: 1, day: 1 })
    while (d.dayOfWeek !== dayOfWeek) {
      d = d.add({ days: 1 })
    }
    return getDayNameShort(d.toZonedDateTime(timezone), locale)
  })
}

/**
 * Year overview: 12 mini month grids; clicking a day opens Day view.
 */
export const YearWrapper: PreactViewComponent = ({ $app, id }) => {
  const [selectedYear, setSelectedYear] = useState(
    $app.datePickerState.selectedDate.value.year
  )
  const [selectedKey, setSelectedKey] = useState(
    $app.datePickerState.selectedDate.value.toString()
  )

  useSignalEffect(() => {
    const date = $app.datePickerState.selectedDate.value
    setSelectedYear(date.year)
    setSelectedKey(date.toString())
  })

  const locale = $app.config.locale.value
  const timezone = $app.config.timezone.value
  const weekdayLabels = weekdayLabelsFor(
    $app.config.firstDayOfWeek.value,
    locale,
    timezone
  )
  const months = $app.timeUnitsImpl.getMonthsFor(selectedYear)

  /**
   * Selects a day and switches to Day view.
   * @param date - Plain date clicked.
   * @returns Nothing.
   */
  function openDay(date: Temporal.PlainDate): void {
    $app.datePickerState.selectedDate.value = date
    $app.calendarState.setView(InternalViewName.Day, date)
  }

  return (
    <div className="sx__year-wrapper" id={id}>
      <div className="sx__year-grid">
        {months.map((monthStart) => {
          const weeks = $app.timeUnitsImpl.getMonthWithTrailingAndLeadingDays(
            monthStart.year,
            monthStart.month as Month
          )
          const monthTitle = new Intl.DateTimeFormat(locale, {
            month: 'long',
          }).format(new Date(monthStart.year, monthStart.month - 1, 1))

          return (
            <section
              key={`${monthStart.year}-${monthStart.month}`}
              className="sx__year-month"
            >
              <h3 className="sx__year-month__title">{monthTitle}</h3>
              <div className="sx__year-month__weekdays" aria-hidden="true">
                {weekdayLabels.map((label, i) => (
                  <span
                    key={`${monthStart.month}-wd-${i}`}
                    className="sx__year-month__weekday"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="sx__year-month__days">
                {weeks.flatMap((week) =>
                  week.map((zdt) => {
                    const plain = zdt.toPlainDate()
                    const inMonth = plain.month === monthStart.month
                    const classes = ['sx__year-month__day']
                    if (!inMonth) {
                      classes.push('sx__year-month__day--leading')
                    }
                    if (isToday(zdt, timezone)) {
                      classes.push('sx__year-month__day--today')
                    }
                    if (plain.toString() === selectedKey) {
                      classes.push('sx__year-month__day--selected')
                    }
                    return (
                      <button
                        key={plain.toString()}
                        type="button"
                        className={classes.join(' ')}
                        disabled={!inMonth}
                        onClick={() => {
                          if (inMonth) {
                            openDay(plain)
                          }
                        }}
                      >
                        {plain.day}
                      </button>
                    )
                  })
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
