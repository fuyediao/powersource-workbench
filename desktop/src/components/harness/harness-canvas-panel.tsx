/**
 * Editable Canvas workspace for generated HTML pages and Markdown documents.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatMarkdown } from '@/components/chat/chat-markdown'
import { CanvasIcon, RefreshIcon } from '@/icons/AllIcons'
import { HARNESS_CANVAS_FOLDER } from '@/constants/harness-canvas'
import { LinkOpenFallbackProvider } from '@/hooks/link-open-context'
import {
  createHarnessCanvasPreviewDocument,
  harnessCanvasKind,
} from '@/utils/harness/canvas-document'
import type { HarnessWorkspaceEntry, HarnessWorkspaceFile } from '@/types/harness'

interface HarnessCanvasPanelProps {
  /** Active Harness working directory. */
  cwd: string | null
  /** Whether this Canvas tab is currently visible. */
  active: boolean
}

type CanvasView = 'preview' | 'source'
type CanvasSaveState = 'idle' | 'saving' | 'saved' | 'error'
type CanvasConsoleLevel = 'log' | 'info' | 'warn' | 'error'

interface CanvasConsoleEntry {
  id: string
  level: CanvasConsoleLevel
  text: string
}

const CANVAS_POLL_MS = 2000
const CANVAS_AUTOSAVE_MS = 600
const MAX_CONSOLE_ENTRIES = 100

/**
 * Renders generated Canvas HTML and Markdown with direct source editing and auto-save.
 * @param props - Workspace identity.
 * @returns Canvas utility page.
 */
export function HarnessCanvasPanel({ cwd, active }: HarnessCanvasPanelProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<HarnessWorkspaceEntry[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [preview, setPreview] = useState<HarnessWorkspaceFile | null>(null)
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [view, setView] = useState<CanvasView>('preview')
  const [saveState, setSaveState] = useState<CanvasSaveState>('idle')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleEntries, setConsoleEntries] = useState<CanvasConsoleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const selectedPathRef = useRef(selectedPath)
  const draftRef = useRef(draft)
  const dirtyRef = useRef(dirty)
  const draftVersionRef = useRef(0)
  const refreshGenerationRef = useRef(0)
  const previewHostRef = useRef<HTMLDivElement>(null)
  selectedPathRef.current = selectedPath
  draftRef.current = draft
  dirtyRef.current = dirty

  const files = useMemo(
    () => entries.filter((entry) => entry.kind === 'file' && harnessCanvasKind(entry.name)),
    [entries],
  )

  /**
   * Saves the current source draft when it has local edits.
   * @returns True when no save is needed or the save succeeds.
   */
  const saveDraft = useCallback(async (): Promise<boolean> => {
    const bridge = window.workbench?.harness
    const path = selectedPathRef.current
    if (!dirtyRef.current || !path) return true
    if (!bridge?.writeCanvasFile) {
      setSaveState('error')
      setError(t('harness.utility.unavailable'))
      return false
    }
    const version = draftVersionRef.current
    const content = draftRef.current
    setSaveState('saving')
    setError('')
    try {
      const saved = await bridge.writeCanvasFile(cwd, path, content)
      if (selectedPathRef.current === path && draftVersionRef.current === version) {
        dirtyRef.current = false
        setDirty(false)
        setPreview(saved)
        setSaveState('saved')
      }
      return true
    } catch (reason) {
      setSaveState('error')
      setError(reason instanceof Error ? reason.message : t('harness.utility.canvasSaveFailed'))
      return false
    }
  }, [cwd, t])

  /**
   * Loads one Canvas file after preserving any current edits.
   * @param path - Workspace-relative file path.
   * @returns Nothing.
   */
  const loadFile = useCallback(async (path: string): Promise<void> => {
    const bridge = window.workbench?.harness
    if (!bridge?.readWorkspaceFile) return
    if (!(await saveDraft())) return
    const generation = ++refreshGenerationRef.current
    selectedPathRef.current = path
    dirtyRef.current = false
    setSelectedPath(path)
    setDirty(false)
    setSaveState('idle')
    setConsoleEntries([])
    setError('')
    try {
      const file = await bridge.readWorkspaceFile(cwd, path)
      if (generation !== refreshGenerationRef.current) return
      setPreview(file)
      setDraft(file.content)
    } catch (reason) {
      if (generation !== refreshGenerationRef.current) return
      setError(reason instanceof Error ? reason.message : t('harness.utility.loadError'))
    }
  }, [cwd, saveDraft, t])

  /** Reloads the Canvas folder and selected file without overwriting unsaved edits. */
  const refresh = useCallback(async (showLoading = false): Promise<void> => {
    const bridge = window.workbench?.harness
    if (!bridge?.listWorkspace || !bridge.readWorkspaceFile) {
      setError(t('harness.utility.unavailable'))
      setLoading(false)
      return
    }
    const generation = ++refreshGenerationRef.current
    if (showLoading) setLoading(true)
    setError('')
    try {
      const listed = await bridge.listWorkspace(cwd, HARNESS_CANVAS_FOLDER)
      if (generation !== refreshGenerationRef.current) return
      const nextFiles = listed.filter(
        (entry) => entry.kind === 'file' && harnessCanvasKind(entry.name),
      )
      setEntries(listed)
      const currentPath = selectedPathRef.current
      const nextPath = nextFiles.some((entry) => entry.relativePath === currentPath)
        ? currentPath
        : (nextFiles[0]?.relativePath ?? '')
      if (!nextPath) {
        selectedPathRef.current = ''
        setSelectedPath('')
        setPreview(null)
        setDraft('')
        return
      }
      if (dirtyRef.current && nextPath === currentPath) return
      const file = await bridge.readWorkspaceFile(cwd, nextPath)
      if (generation !== refreshGenerationRef.current) return
      selectedPathRef.current = nextPath
      setSelectedPath(nextPath)
      setPreview((current) =>
        current !== null &&
        current.relativePath === file.relativePath &&
        current.content === file.content
          ? current
          : file,
      )
      setDraft(file.content)
    } catch (reason) {
      if (generation !== refreshGenerationRef.current) return
      const message = reason instanceof Error ? reason.message : t('harness.utility.loadError')
      if (message.includes('does not exist')) {
        setEntries([])
        setSelectedPath('')
        setPreview(null)
        setDraft('')
        setError('')
      } else {
        setError(message)
      }
    } finally {
      if (generation === refreshGenerationRef.current) setLoading(false)
    }
  }, [cwd, t])

  useEffect(() => {
    void refresh(true)
    const timer = window.setInterval(() => {
      void refresh()
    }, CANVAS_POLL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      void saveDraft()
    }, CANVAS_AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [dirty, draft, saveDraft])

  useEffect(() => {
    const subscribe = window.workbench?.harness?.onCanvasConsole
    if (!subscribe) return
    return subscribe((entry) => {
      const level: CanvasConsoleLevel = entry.level === 'warning' ? 'warn' : entry.level
      setConsoleEntries((current) => [
        ...current.slice(-(MAX_CONSOLE_ENTRIES - 1)),
        { id: crypto.randomUUID(), level, text: entry.message },
      ])
    })
  }, [])

  const kind = preview ? harnessCanvasKind(preview.relativePath) : null
  const activeContent = dirty ? draft : (preview?.content ?? '')

  useEffect(() => {
    const bridge = window.workbench?.harness
    const host = previewHostRef.current
    if (!bridge?.showCanvasPreview || !bridge.hideCanvasPreview || !active || view !== 'preview' || kind !== 'html' || !host) {
      void bridge?.hideCanvasPreview?.()
      return
    }
    const document = createHarnessCanvasPreviewDocument(activeContent)
    let animationFrame = 0
    /** Synchronizes the native view with the renderer placeholder. */
    const synchronize = (): void => {
      const rect = host.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      void bridge.showCanvasPreview(
        { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        document,
      )
    }
    const observer = new ResizeObserver(synchronize)
    observer.observe(host)
    animationFrame = window.requestAnimationFrame(synchronize)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(animationFrame)
      void bridge.hideCanvasPreview()
    }
  }, [active, activeContent, kind, view])

  const saveLabel =
    saveState === 'saving'
      ? t('harness.utility.canvasSaving')
      : saveState === 'saved'
        ? t('harness.utility.canvasSaved')
        : saveState === 'error'
          ? t('harness.utility.canvasSaveFailed')
          : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="harness-canvas-page">
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-950/10 px-3 py-2 dark:border-white/10">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex items-center gap-1">
            {files.map((entry) => (
              <button
                key={entry.relativePath}
                type="button"
                className={`max-w-36 truncate rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                  entry.relativePath === selectedPath
                    ? 'bg-brand/15 text-brand'
                    : 'text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10'
                }`}
                onClick={() => void loadFile(entry.relativePath)}
              >
                {entry.name}
              </button>
            ))}
          </div>
        </div>
        {saveLabel ? (
          <span
            data-testid="harness-canvas-save-state"
            className={`shrink-0 text-[10px] font-semibold ${saveState === 'error' ? 'text-danger' : 'text-muted'}`}
          >
            {saveLabel}
          </span>
        ) : null}
        {preview && !preview.binary ? (
          <div className="flex shrink-0 rounded-lg bg-zinc-950/5 p-0.5 dark:bg-white/5">
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-[11px] font-bold ${view === 'preview' ? 'bg-white text-ink shadow-sm dark:bg-zinc-800' : 'text-muted'}`}
              onClick={() => setView('preview')}
            >
              {t('harness.utility.canvasPreview')}
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-[11px] font-bold ${view === 'source' ? 'bg-white text-ink shadow-sm dark:bg-zinc-800' : 'text-muted'}`}
              onClick={() => setView('source')}
            >
              {t('harness.utility.canvasSource')}
            </button>
          </div>
        ) : null}
        {kind === 'html' ? (
          <button
            type="button"
            className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition ${consoleOpen ? 'bg-brand/15 text-brand' : 'text-muted hover:bg-zinc-950/5 dark:hover:bg-white/10'}`}
            aria-pressed={consoleOpen}
            onClick={() => setConsoleOpen((open) => !open)}
          >
            {t('harness.utility.canvasConsole')}
          </button>
        ) : null}
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-brand/10 hover:text-brand disabled:opacity-40"
          aria-label={t('harness.utility.refresh')}
          disabled={loading}
          onClick={() => void refresh(true)}
        >
          <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          {error && saveState !== 'error' ? (
            <p className="p-4 text-xs font-semibold text-danger">{error}</p>
          ) : loading && !preview && files.length === 0 ? (
            <p className="p-4 text-xs font-medium text-muted">{t('harness.utility.loading')}</p>
          ) : files.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <CanvasIcon className="size-8 text-muted" aria-hidden />
              <p data-testid="harness-canvas-empty" className="text-xs font-medium text-muted">{t('harness.utility.canvasEmpty')}</p>
            </div>
          ) : preview?.binary ? (
            <p className="p-4 text-xs font-medium text-muted">{t('harness.utility.binaryFile')}</p>
          ) : view === 'source' || !kind ? (
            <textarea
              data-testid="harness-canvas-source-editor"
              aria-label={t('harness.utility.canvasEditor')}
              className="h-full w-full resize-none bg-transparent p-4 font-mono text-[11px] leading-5 text-ink outline-none"
              value={draft}
              spellCheck={false}
              onChange={(event) => {
                draftVersionRef.current += 1
                dirtyRef.current = true
                setDraft(event.target.value)
                setDirty(true)
                setSaveState('idle')
              }}
            />
          ) : kind === 'html' ? (
            <div
              ref={previewHostRef}
              data-testid="harness-canvas-html-preview"
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="h-full overflow-auto p-4">
              {preview?.truncated ? (
                <p className="mb-2 text-[11px] font-semibold text-warning">{t('harness.utility.fileTruncated')}</p>
              ) : null}
              <LinkOpenFallbackProvider>
                <ChatMarkdown
                  className="chat-markdown min-w-0 text-sm leading-relaxed wrap-break-word text-ink"
                  content={activeContent}
                  toolbar={{
                    copy: t('chat.codeBlock.copy'),
                    download: t('chat.codeBlock.download'),
                    plain: t('chat.codeBlock.plain'),
                  }}
                />
              </LinkOpenFallbackProvider>
            </div>
          )}
        </div>
        {consoleOpen && kind === 'html' ? (
          <section className="flex h-36 shrink-0 flex-col border-t border-zinc-950/10 bg-zinc-950/[0.03] dark:border-white/10 dark:bg-black/20">
            <header className="flex h-8 shrink-0 items-center justify-between px-3">
              <span className="text-[10px] font-bold text-muted">{t('harness.utility.canvasConsole')}</span>
              <button
                type="button"
                className="text-[10px] font-semibold text-muted hover:text-ink"
                onClick={() => setConsoleEntries([])}
              >
                {t('harness.utility.canvasClearConsole')}
              </button>
            </header>
            <div data-testid="harness-canvas-console" className="min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-[10px] leading-5">
              {consoleEntries.length === 0 ? (
                <p className="text-muted">{t('harness.utility.canvasConsoleEmpty')}</p>
              ) : consoleEntries.map((entry) => (
                <p
                  key={entry.id}
                  className={entry.level === 'error' ? 'text-danger' : entry.level === 'warn' ? 'text-warning' : 'text-ink'}
                >
                  [{entry.level}] {entry.text}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
