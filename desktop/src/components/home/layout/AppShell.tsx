import { useEffect, useState, type ReactNode } from 'react'
import type { RailDock } from '@/hooks/use-rail-dock'

interface AppShellProps {
  children: ReactNode
  headerActions?: ReactNode
  /**
   * Category rail dock; drives animated page padding with the rail transition.
   * Use `hidden` when the rail is not shown so reserved gutters collapse.
   */
  railDock?: RailDock | 'hidden'
}

/**
 * Provides the atmospheric page shell and header actions.
 * Wallpaper is rendered by {@link WallpaperBackdrop} at the signed-in shell level.
 * @param props - Page content, optional header actions, and rail dock.
 * @returns Application shell.
 */
export function AppShell({ children, headerActions, railDock = 'hidden' }: AppShellProps) {
  const [paddingReady, setPaddingReady] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPaddingReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={`app-shell relative min-h-full overflow-hidden${paddingReady ? ' app-shell-ready' : ''}`}
      data-rail-dock={railDock}
    >
      <div className="app-shell-brand-glow pointer-events-none fixed top-[-8rem] right-[-8rem] z-0 size-[30rem] rounded-full bg-brand/8 blur-3xl transition-opacity duration-[450ms]" />
      {headerActions ? (
        <header className="relative z-10 flex items-start justify-end gap-4">{headerActions}</header>
      ) : null}
      <main className="relative z-10 mx-auto w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[min(112rem,calc(100vw-8rem))]">
        {children}
      </main>
    </div>
  )
}
