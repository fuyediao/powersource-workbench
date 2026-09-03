import { YEARS_VIEW } from '../constants/test-ids'
import { useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { AppContext } from '../utils/stateful/app-context'
import Chevron from '@schedule-x/shared/src/components/buttons/chevron'

type props = {
  setMonthView: () => void
}

type PanelMode = 'years' | 'months'

/**
 * Floors a year to the start of a 12-year decade block.
 * @param year - Full year.
 * @returns Decade start year.
 */
function decadeStartFor(year: number): number {
  return Math.floor(year / 12) * 12
}

/**
 * Short month label for a compact 3-column grid (no trailing period).
 * @param monthDate - Any date in the target month.
 * @param locale - BCP 47 locale.
 * @returns Localized short month name.
 */
function toShortMonthLabel(
  monthDate: Temporal.PlainDate,
  locale: string
): string {
  return monthDate
    .toLocaleString(locale, { month: 'short' })
    .replace(/\.$/, '')
}

/**
 * Year → month picker (3×4 grids), matching the event dialog date-time field layout.
 */
export default function YearsView({ setMonthView }: props) {
  const $app = useContext(AppContext)
  const minYear = $app.config.min.year
  const maxYear = $app.config.max.year
  const datePickerDate = $app.datePickerState.datePickerDate.value
  const selectedDate = $app.datePickerState.selectedDate.value

  const [panelMode, setPanelMode] = useState<PanelMode>('years')
  const [pickedYear, setPickedYear] = useState(datePickerDate.year)
  const [decadeStart, setDecadeStart] = useState(() =>
    decadeStartFor(datePickerDate.year)
  )
  /** Blocks month cells briefly so the year click cannot land on a newly mounted cell. */
  const [monthPointerBlocked, setMonthPointerBlocked] = useState(false)
  const monthUnblockTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (monthUnblockTimerRef.current !== null) {
        window.clearTimeout(monthUnblockTimerRef.current)
      }
    }
  }, [])

  const yearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => decadeStart + index),
    [decadeStart]
  )

  const monthOptions = useMemo(
    () => $app.timeUnitsImpl.getMonthsFor(pickedYear),
    [$app.timeUnitsImpl, pickedYear]
  )

  const headerTitle =
    panelMode === 'years'
      ? `${decadeStart} – ${decadeStart + 11}`
      : String(pickedYear)

  /**
   * Moves the decade or year depending on panel mode.
   * @param delta - Steps to add (may be negative).
   */
  const shiftView = (delta: number) => {
    if (panelMode === 'years') {
      setDecadeStart((start) => start + delta * 12)
      return
    }
    setPickedYear((year) => {
      const next = year + delta
      if (next < minYear || next > maxYear) {
        return year
      }
      setDecadeStart(decadeStartFor(next))
      return next
    })
  }

  /**
   * Selects a year and opens the month grid (after the current click finishes).
   * @param year - Full year.
   * @param event - Click event to stop from reaching a replacement month cell.
   */
  const selectYear = (year: number, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (year < minYear || year > maxYear) {
      return
    }
    setPickedYear(year)
    setMonthPointerBlocked(true)
    setPanelMode('months')
    if (monthUnblockTimerRef.current !== null) {
      window.clearTimeout(monthUnblockTimerRef.current)
    }
    monthUnblockTimerRef.current = window.setTimeout(() => {
      setMonthPointerBlocked(false)
      monthUnblockTimerRef.current = null
    }, 280)
  }

  /**
   * Selects a month and returns to the month-days view.
   * @param month - 1–12.
   * @param event - Click event.
   */
  const selectMonth = (month: number, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (monthPointerBlocked) {
      return
    }
    $app.datePickerState.datePickerDate.value = Temporal.PlainDate.from({
      year: pickedYear,
      month,
      day: 1,
    })
    setMonthView()
  }

  /**
   * From the month panel title, jump back to the year decade grid.
   */
  const openYearsFromTitle = () => {
    if (panelMode === 'months') {
      setDecadeStart(decadeStartFor(pickedYear))
      setPanelMode('years')
    }
  }

  return (
    <div className="sx__date-picker__years-view" data-testid={YEARS_VIEW}>
      <header className="sx__date-picker__years-view-header">
        <Chevron
          direction="previous"
          onClick={() => shiftView(-1)}
          buttonText={$app.translate('Previous month')}
        />
        <button
          type="button"
          className="sx__button sx__date-picker__month-view-header__month-year"
          onClick={openYearsFromTitle}
          disabled={panelMode === 'years'}
        >
          {headerTitle}
        </button>
        <Chevron
          direction="next"
          onClick={() => shiftView(1)}
          buttonText={$app.translate('Next month')}
        />
      </header>

      {panelMode === 'years' ? (
        <div className="sx__date-picker__years-grid" key={`y-${decadeStart}`}>
          {yearOptions.map((year) => {
            const outOfRange = year < minYear || year > maxYear
            const isSelected = year === selectedDate.year
            const isCurrent = year === Temporal.Now.plainDateISO().year
            return (
              <button
                type="button"
                key={year}
                disabled={outOfRange}
                className={
                  'sx__button sx__date-picker__years-grid__cell' +
                  (isSelected ? ' is-selected' : '') +
                  (isCurrent && !isSelected ? ' is-current' : '')
                }
                onClick={(event) => selectYear(year, event)}
              >
                {year}
              </button>
            )
          })}
        </div>
      ) : (
        <div
          className={
            'sx__date-picker__months-grid' +
            (monthPointerBlocked ? ' is-pointer-blocked' : '')
          }
          key={`m-${pickedYear}`}
        >
          {monthOptions.map((monthDate) => {
            const isSelected =
              selectedDate.year === pickedYear &&
              selectedDate.month === monthDate.month
            const now = Temporal.Now.plainDateISO()
            const isCurrent =
              monthDate.month === now.month && pickedYear === now.year
            return (
              <button
                type="button"
                key={monthDate.month}
                className={
                  'sx__button sx__date-picker__months-grid__cell' +
                  (isSelected ? ' is-selected' : '') +
                  (isCurrent && !isSelected ? ' is-current' : '')
                }
                onClick={(event) => selectMonth(monthDate.month, event)}
              >
                {toShortMonthLabel(monthDate, $app.config.locale.value)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
