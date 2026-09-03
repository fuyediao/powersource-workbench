import { getCurrentWindow } from '@tauri-apps/api/window'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { isGeocrmHosted } from '@/services/clash/bridge'
import debounce from '@/utils/clash/debounce'

import { WindowContext } from './window-context'

const noopAsync = async (): Promise<void> => {}

/**
 * Tauri window stand-in when Clash Verge is hosted in GeoCRM Electron.
 * @returns Object matching the methods WindowProvider uses.
 */
function hostedWindowStub(): ReturnType<typeof getCurrentWindow> {
  const unlisten = async () => () => {}
  return {
    close: noopAsync,
    minimize: noopAsync,
    maximize: noopAsync,
    unmaximize: noopAsync,
    isMaximized: async () => false,
    isFullscreen: async () => false,
    setFullscreen: noopAsync,
    isDecorated: async () => true,
    setDecorations: noopAsync,
    setMinimizable: () => undefined,
    isVisible: async () => document.visibilityState === 'visible',
    isMinimized: async () => false,
    onResized: unlisten,
    onFocusChanged: async (handler: (event: { payload: boolean }) => void) => {
      const onFocus = () => handler({ payload: true })
      const onBlur = () => handler({ payload: false })
      window.addEventListener('focus', onFocus)
      window.addEventListener('blur', onBlur)
      return () => {
        window.removeEventListener('focus', onFocus)
        window.removeEventListener('blur', onBlur)
      }
    },
    listen: unlisten,
  } as ReturnType<typeof getCurrentWindow>
}

export const WindowProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const hosted = isGeocrmHosted()
  const currentWindow = useMemo(
    () => (hosted ? hostedWindowStub() : getCurrentWindow()),
    [hosted],
  )
  const [decorated, setDecorated] = useState<boolean | null>(hosted ? true : null)
  const [maximized, setMaximized] = useState<boolean | null>(hosted ? false : null)

  const close = useCallback(async () => {
    // Delay one frame so the UI can clear :hover before the window hides.
    await new Promise((resolve) => setTimeout(resolve, 20))
    await currentWindow.close()
  }, [currentWindow])
  const minimize = useCallback(async () => {
    // Delay one frame so the UI can clear :hover before the window hides.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await currentWindow.minimize()
  }, [currentWindow])

  useEffect(() => {
    let isUnmounted = false
    let lastWidth = -1
    let lastHeight = -1

    const checkMaximized = debounce(
      async (event: { payload: { width: number; height: number } }) => {
        if (isUnmounted) return
        const { width, height } = event.payload
        if (width === lastWidth && height === lastHeight) return
        lastWidth = width
        lastHeight = height
        const value = await currentWindow.isMaximized()
        setMaximized(value)
      },
      300,
    )

    const unlistenPromise = hosted
      ? Promise.resolve(() => {})
      : currentWindow.onResized(checkMaximized)

    return () => {
      isUnmounted = true
      unlistenPromise
        .then((unlisten) => unlisten())
        .catch((err) => console.warn('[WindowProvider] failed to clean listeners:', err))
    }
  }, [currentWindow, hosted])

  const toggleMaximize = useCallback(async () => {
    if (await currentWindow.isMaximized()) {
      await currentWindow.unmaximize()
      setMaximized(false)
    } else {
      await currentWindow.maximize()
      setMaximized(true)
    }
  }, [currentWindow])

  const toggleFullscreen = useCallback(async () => {
    await currentWindow.setFullscreen(!(await currentWindow.isFullscreen()))
  }, [currentWindow])

  const refreshDecorated = useCallback(async () => {
    const val = await currentWindow.isDecorated()
    setDecorated(val)
    return val
  }, [currentWindow])

  const toggleDecorations = useCallback(async () => {
    const currentVal = await currentWindow.isDecorated()
    await currentWindow.setDecorations(!currentVal)
    setDecorated(!currentVal)
  }, [currentWindow])

  useEffect(() => {
    if (hosted) {
      setDecorated(true)
      return
    }
    void refreshDecorated()
    currentWindow.setMinimizable?.(true)
  }, [currentWindow, hosted, refreshDecorated])

  const contextValue = useMemo(
    () => ({
      decorated,
      maximized,
      toggleDecorations,
      refreshDecorated,
      minimize,
      close,
      toggleMaximize,
      toggleFullscreen,
      currentWindow,
    }),
    [
      decorated,
      maximized,
      toggleDecorations,
      refreshDecorated,
      minimize,
      close,
      toggleMaximize,
      toggleFullscreen,
      currentWindow,
    ],
  )

  return <WindowContext value={contextValue}>{children}</WindowContext>
}
