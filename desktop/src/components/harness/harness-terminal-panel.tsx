/**
 * Interactive OS shell for the Harness utility workspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

interface HarnessTerminalPanelProps {
  /** Stable id for this Terminal tab's PTY session. */
  sessionId: string
  /** Active Harness working directory. */
  cwd: string | null
  /** True when this tab is visible and should fit and focus. */
  active: boolean
}

/** Always-dark palette so leftover xterm cells match the viewport (no light/black frame). */
const TERMINAL_BACKGROUND = '#09090b'

const TERMINAL_THEME = {
  background: TERMINAL_BACKGROUND,
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: TERMINAL_BACKGROUND,
  selectionBackground: '#3f3f46',
} as const

/**
 * Fits the PTY and xterm grid to the host element.
 * @param fitAddon - xterm fit addon.
 * @param sessionId - Tab session id.
 * @returns Nothing.
 */
function syncTerminalSize(fitAddon: FitAddon, sessionId: string): void {
  fitAddon.fit()
  const dimensions = fitAddon.proposeDimensions()
  if (!dimensions || dimensions.cols < 2 || dimensions.rows < 2) return
  void window.workbench?.harness.ptyResize(sessionId, dimensions.cols, dimensions.rows)
}

/**
 * Renders a real system shell (PowerShell / zsh / bash) attached to a PTY.
 * @param props - Session identity, work folder, and visibility.
 * @returns Full-height terminal surface.
 */
export function HarnessTerminalPanel({ sessionId, cwd, active }: HarnessTerminalPanelProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [error, setError] = useState('')

  const spawnShell = useCallback(async (): Promise<void> => {
    const fitAddon = fitRef.current
    const dimensions = fitAddon?.proposeDimensions()
    const cols = dimensions && dimensions.cols >= 2 ? dimensions.cols : 80
    const rows = dimensions && dimensions.rows >= 2 ? dimensions.rows : 24
    const bridge = window.workbench?.harness
    if (!bridge?.ptySpawn) {
      setError(t('harness.utility.unavailable'))
      return
    }
    try {
      await bridge.ptySpawn(sessionId, cwd, cols, rows)
      setError('')
    } catch {
      setError(t('harness.utility.terminalError'))
    }
  }, [cwd, sessionId, t])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
      allowTransparency: false,
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(host)
    try {
      fitAddon.fit()
    } catch {
      // The host may still be 0x0 when the tab is hidden.
    }
    termRef.current = term
    fitRef.current = fitAddon
    let cancelled = false
    let respawnTimer = 0
    const dataSub = term.onData((data) => {
      void window.workbench?.harness.ptyWrite(sessionId, data)
    })
    const ptyDataUnsub = window.workbench?.harness.onPtyData((id, data) => {
      if (id !== sessionId) return
      term.write(data)
    })
    const ptyExitUnsub = window.workbench?.harness.onPtyExit((id) => {
      if (id !== sessionId || cancelled) return
      window.clearTimeout(respawnTimer)
      respawnTimer = window.setTimeout(() => {
        if (!cancelled) void spawnShell()
      }, 40)
    })
    void spawnShell()
    return () => {
      cancelled = true
      window.clearTimeout(respawnTimer)
      dataSub.dispose()
      ptyDataUnsub?.()
      ptyExitUnsub?.()
      void window.workbench?.harness.ptyDispose(sessionId)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [cwd, sessionId, spawnShell])

  useEffect(() => {
    if (!active) return
    const host = hostRef.current
    const fitAddon = fitRef.current
    const term = termRef.current
    if (!host || !fitAddon || !term) return
    const frame = window.requestAnimationFrame(() => {
      syncTerminalSize(fitAddon, sessionId)
      term.focus()
    })
    const observer = new ResizeObserver(() => {
      syncTerminalSize(fitAddon, sessionId)
    })
    observer.observe(host)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [active, sessionId])

  return (
    <div
      className="harness-terminal flex min-h-0 flex-1 flex-col bg-zinc-950"
      data-testid="harness-terminal-page"
    >
      {error ? (
        <p className="shrink-0 px-3 py-2 text-xs font-semibold text-red-400">{error}</p>
      ) : null}
      <div
        ref={hostRef}
        className="min-h-0 flex-1"
        aria-label={t('harness.quickActions.terminal')}
      />
    </div>
  )
}
