import { useDateTime } from '@/hooks/use-date-time'

/**
 * Renders the live clock and localized date.
 * @returns Date and time header.
 */
export function DateTimeDisplay() {
  const { time, date } = useDateTime()

  return (
    <div className="animate-enter enter-delay-2 text-center">
      <p className="font-sans text-[clamp(2.8rem,8vw,5.75rem)] font-extrabold leading-none tracking-[0.04em] text-clock tabular-nums xl:text-[clamp(3.25rem,6.5vw,6.75rem)] 2xl:text-[clamp(4rem,6.5vw,8.5rem)]">
        {time}
      </p>
      <p className="mt-3 text-xs font-semibold tracking-[0.18em] text-muted uppercase sm:text-sm xl:mt-4 xl:text-sm 2xl:mt-5 2xl:text-lg">
        {date}
      </p>
    </div>
  )
}
