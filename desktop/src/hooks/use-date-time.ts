import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface DateTimeValue {
  time: string
  date: string
}

/**
 * Produces a localized clock that refreshes every second.
 * @returns Formatted time and date strings.
 */
export function useDateTime(): DateTimeValue {
  const { i18n } = useTranslation()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const locale =
    i18n.language === 'zh-CN' ? 'zh-CN' : i18n.language.startsWith('zh') ? 'zh-TW' : 'en'
  const datePart = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const weekdayPart = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
  }).format(now)

  return {
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now),
    date: `${datePart} ${weekdayPart}`,
  }
}
