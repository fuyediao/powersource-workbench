import { clashListen } from '@/services/clash/bridge'
import { useCallback } from 'react'

type EventCallback<T> = (event: { payload: T }) => void

export const useListen = () => {
  const addListener = useCallback(
    async <T>(eventName: string, handler: EventCallback<T>) => {
      return await clashListen(eventName, handler)
    },
    [],
  )

  return {
    addListener,
  }
}
