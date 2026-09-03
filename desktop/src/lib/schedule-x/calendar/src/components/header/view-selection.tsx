import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import { AppContext } from '../../utils/stateful/app-context'
import { ViewName } from '@schedule-x/shared/src/types/calendar/view-name'
import { View } from '@schedule-x/shared/src/types/calendar/view'
import { isKeyEnterOrSpace } from '@schedule-x/shared/src/utils/stateless/dom/events'
import { useSignalEffect } from '@preact/signals'
import chevronIcon from '@schedule-x/shared/src/assets/chevron-input.svg'
import { randomStringId } from '@schedule-x/shared/src/utils/stateless/strings/random'

export default function ViewSelection() {
  const $app = useContext(AppContext)
  const viewSelectId = randomStringId()
  const viewLabelId = randomStringId()

  const [availableViews, setAvailableViews] = useState<View[]>([])

  useSignalEffect(() => {
    if ($app.calendarState.isCalendarSmall.value) {
      setAvailableViews(
        $app.config.views.value.filter((view) => view.hasSmallScreenCompat)
      )
    } else {
      setAvailableViews(
        $app.config.views.value.filter((view) => view.hasWideScreenCompat)
      )
    }
  })

  // Get initial selected view label to prevent layout shift
  const getInitialSelectedViewLabel = () => {
    const selectedView = $app.config.views.value.find(
      (view) => view.name === $app.calendarState.view.value
    )
    return selectedView ? $app.translate(selectedView.label) : ''
  }
  const [selectedViewLabel, setSelectedViewLabel] = useState(
    getInitialSelectedViewLabel()
  )
  useSignalEffect(() => {
    const selectedView = $app.config.views.value.find(
      (view) => view.name === $app.calendarState.view.value
    )
    if (!selectedView) return

    setSelectedViewLabel($app.translate(selectedView.label))
  })

  const [isOpen, setIsOpen] = useState(false)
  const [menuMounted, setMenuMounted] = useState(false)
  const [menuLeaving, setMenuLeaving] = useState(false)
  const wasMenuOpenRef = useRef(false)
  const leaveTimerRef = useRef<number | null>(null)

  /**
   * Opens or closes the view menu, keeping the panel mounted through the leave animation.
   * @param next - Whether the menu should be open
   */
  const setMenuOpen = (next: boolean) => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    setIsOpen(next)
    if (next) {
      wasMenuOpenRef.current = true
      setMenuMounted(true)
      setMenuLeaving(false)
      return
    }
    if (!wasMenuOpenRef.current && !menuMounted) {
      return
    }
    wasMenuOpenRef.current = false
    setMenuLeaving(true)
    leaveTimerRef.current = window.setTimeout(() => {
      setMenuMounted(false)
      setMenuLeaving(false)
      leaveTimerRef.current = null
    }, 180)
  }

  const clickOutsideListener = (event: MouseEvent) => {
    const target = event.target
    if (
      target instanceof HTMLElement &&
      !target.closest('.sx__view-selection')
    ) {
      setMenuOpen(false)
    }
  }

  useEffect(() => {
    document.addEventListener('click', clickOutsideListener)
    return () => {
      document.removeEventListener('click', clickOutsideListener)
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current)
      }
    }
  }, [])

  const handleClickOnSelectionItem = (viewName: ViewName) => {
    setMenuOpen(false)
    $app.calendarState.setView(
      viewName,
      $app.datePickerState.selectedDate.value
    )
  }

  const [viewSelectionItems, setViewSelectionItems] =
    useState<NodeListOf<Element>>()
  const [focusedViewIndex, setFocusedViewIndex] = useState(0)

  const handleSelectedViewKeyDown = (keyboardEvent: KeyboardEvent) => {
    if (isKeyEnterOrSpace(keyboardEvent)) {
      setMenuOpen(!isOpen)
    }

    setTimeout(() => {
      const allOptions = $app.elements.calendarWrapper?.querySelectorAll(
        '.sx__view-selection-item'
      )
      if (!allOptions) return
      setViewSelectionItems(allOptions as NodeListOf<Element>)
      const firstOption = allOptions[0]
      if (firstOption instanceof HTMLElement) {
        setFocusedViewIndex(0)
        firstOption.focus()
      }
    }, 50)
  }

  const navigateUpOrDown = (keyboardEvent: KeyboardEvent, viewName: string) => {
    if (!viewSelectionItems) return

    if (keyboardEvent.key === 'ArrowDown') {
      const nextOption = viewSelectionItems[focusedViewIndex + 1]
      if (nextOption instanceof HTMLElement) {
        setFocusedViewIndex(focusedViewIndex + 1)
        nextOption.focus()
      }
    } else if (keyboardEvent.key === 'ArrowUp') {
      const prevOption = viewSelectionItems[focusedViewIndex - 1]
      if (prevOption instanceof HTMLElement) {
        setFocusedViewIndex(focusedViewIndex - 1)
        prevOption.focus()
      }
    } else if (isKeyEnterOrSpace(keyboardEvent)) {
      handleClickOnSelectionItem(viewName)
    }
  }

  return (
    <div className={`sx__view-selection ${isOpen || menuLeaving ? 'is-open' : ''}`}>
      <label
        for={viewSelectId}
        id={viewLabelId}
        className="sx__view-selection-label"
      >
        {$app.translate('View')}
      </label>
      <div
        id={viewSelectId}
        tabIndex={0}
        role="button"
        aria-describedby={viewLabelId}
        aria-label={$app.translate('Select View')}
        className="sx__view-selection-selected-item sx__ripple"
        onClick={() => setMenuOpen(!isOpen)}
        onKeyDown={handleSelectedViewKeyDown}
      >
        {selectedViewLabel}
        <img className="sx__view-selection-chevron" src={chevronIcon} alt="" />
      </div>
      {menuMounted && (
        <ul
          data-testid="view-selection-items"
          className={
            'sx__view-selection-items' + (menuLeaving ? ' is-leaving' : '')
          }
        >
          {availableViews.map((view) => (
            <li
              aria-label={
                $app.translate('Select View') + ' ' + $app.translate(view.label)
              }
              tabIndex={-1}
              role="button"
              onKeyDown={(keyboardEvent) =>
                navigateUpOrDown(keyboardEvent, view.name)
              }
              onClick={() => handleClickOnSelectionItem(view.name)}
              className={
                'sx__view-selection-item' +
                (view.name === $app.calendarState.view.value
                  ? ' is-selected'
                  : '')
              }
            >
              {$app.translate(view.label)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
