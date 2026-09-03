import { useEffect, useState } from 'react'
import { CloseIcon } from '@/icons/AllIcons'
import {
  getToast,
  hideToast,
  subscribeToast,
} from '@/hooks/aura/toast-store'

/**
 * Shell toast for boot errors and transient messages.
 *
 * @returns Toast element, or null when hidden.
 */
export function ToastHost() {
  const [toast, setToast] = useState(() => getToast())

  useEffect(() => subscribeToast(() => setToast(getToast())), [])

  useEffect(() => {
    if (!toast || toast.durationMs === 0) {
      return
    }
    const timer = window.setTimeout(() => {
      hideToast()
    }, toast.durationMs)
    return () => {
      window.clearTimeout(timer)
    }
  }, [toast])

  if (!toast) {
    return null
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-12 z-200000 flex justify-center px-4"
      role="status"
    >
      <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-md bg-[#3b3e43] px-3 py-2 text-[13px] text-white shadow-lg">
        <p className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word">
          {toast.message}
        </p>
        {toast.durationMs === 0 ? (
          <button
            type="button"
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-white/80 hover:text-white"
            aria-label="Close"
            onClick={() => hideToast()}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>
    </div>
  )
}
