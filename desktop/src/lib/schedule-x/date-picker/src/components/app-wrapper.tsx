import DatePickerAppSingleton from '@schedule-x/shared/src/interfaces/date-picker/date-picker-app.singleton'
import { AppContext } from '../utils/stateful/app-context'
import AppInput from './app-input'
import AppPopup from './app-popup'
import { createPortal, useRef } from 'preact/compat'
import { useEffect, useState } from 'preact/hooks'
import { useSignalEffect } from '@preact/signals'

const LEAVE_MS = 180

type props = {
  $app: DatePickerAppSingleton
}

export default function AppWrapper({ $app }: props) {
  const initialClassList = ['sx__date-picker-wrapper']
  const [classList, setClassList] = useState(initialClassList)
  const elementRef = useRef<HTMLDivElement>(null)
  const [popupMounted, setPopupMounted] = useState(false)
  const [popupLeaving, setPopupLeaving] = useState(false)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (elementRef && elementRef.current instanceof HTMLDivElement)
      $app.elements = { DatePickerWrapper: elementRef.current }
  }, [])

  useEffect(() => {
    const list = [...initialClassList]
    if ($app.datePickerState.isDark.value) list.push('is-dark')
    if ($app.config.style?.fullWidth) list.push('has-full-width')
    if ($app.datePickerState.isDisabled.value) list.push('is-disabled')
    setClassList(list)
  }, [$app.datePickerState.isDark.value, $app.datePickerState.isDisabled.value])

  useSignalEffect(() => {
    const open = $app.datePickerState.isOpen.value
    if (open) {
      wasOpenRef.current = true
      setPopupMounted(true)
      setPopupLeaving(false)
      return
    }
    if (!wasOpenRef.current) {
      return
    }
    wasOpenRef.current = false
    setPopupLeaving(true)
    const timer = window.setTimeout(() => {
      setPopupMounted(false)
      setPopupLeaving(false)
    }, LEAVE_MS)
    return () => window.clearTimeout(timer)
  })

  let appPopupJSX = (
    <AppPopup wrapperEl={elementRef.current} isLeaving={popupLeaving} />
  )
  if ($app.config.teleportTo)
    appPopupJSX = createPortal(appPopupJSX, $app.config.teleportTo)

  return (
    <>
      <div ref={elementRef} className={classList.join(' ')}>
        <AppContext.Provider value={$app}>
          <AppInput />

          {popupMounted && appPopupJSX}
        </AppContext.Provider>
      </div>
    </>
  )
}
