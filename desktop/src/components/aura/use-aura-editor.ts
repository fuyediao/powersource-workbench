import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Aura from '@/lib/mdcore/aura'
import i18n from '@/i18n'
import {
  getDocumentSession,
  isAuraMarkdownDrag,
  isAuraMarkdownFileName,
  openMarkdownAtPath,
  resolveStartupDocument,
  saveDraft,
  saveMarkdownDocument,
  setDocumentDirty,
  setOpenDocument,
  subscribeDocumentSession,
  uploadDroppedMarkdownFiles,
} from '@/hooks/aura/document-store'
import { setDocumentStats } from '@/hooks/aura/document-stats-store'
import { getPreferences } from '@/hooks/aura/preferences-store'
import { showToast } from '@/hooks/aura/toast-store'
import {
  consumePendingAuraDocument,
  subscribeAuraDocumentRequest,
} from '@/utils/aura/aura-document-request'
import { useFileDropUpload, type FileDropUploadBind } from '@/hooks/use-file-drop-upload'
import {
  isSourceMode,
  setSourceMode as setShellSourceMode,
  subscribeSourceMode,
  toggleSourceMode as toggleShellSourceMode,
} from '@/hooks/aura/source-mode-store'
import {
  getSourceEditorValue,
  setSourceEditorValue,
} from '@/hooks/aura/source-editor-store'
import { getAuraOptions } from '@/utils/aura/aura-options'
import { setActiveEditor } from '@/utils/aura/active-editor'
import {
  computeDocumentStats,
  type DocumentStats,
} from '@/utils/aura/document-stats'
import { syncEditorChromeFromShellTheme } from '@/utils/aura/content-theme'

const EMPTY_DOC_STATS = computeDocumentStats('')

/** State and handlers the editor layout needs from the lifecycle hook. */
export interface UseAuraEditorResult {
  /** DOM id for the WYSIWYG mount element. */
  editorId: string
  /** Ref for the WYSIWYG mount element. */
  mountRef: React.RefObject<HTMLDivElement | null>
  /** Live Aura instance once booted (drives the sidebar outline). */
  auraInstance: Aura | null
  /** Startup / init error message, if any. */
  loadError: string | null
  /** Current document statistics for the status bar. */
  docStats: DocumentStats
  /** Whether Monaco source mode is active. */
  sourceMode: boolean
  /** Seed value handed to Monaco when entering source mode. */
  sourceSeedRef: React.RefObject<string>
  /** Handle Monaco document changes in source mode. */
  onSourceChange(value: string): void
  /** Open a sidebar file, autosaving the current document first if enabled. */
  openSidebarFile(filePath: string): Promise<void>
  /** Toggle source mode (shared with the View menu). */
  toggleSourceMode(): void
  /** Spread on the editor shell so OS file drops upload to the library. */
  dropBind: FileDropUploadBind
  /** True while a matching Markdown drag is over the editor. */
  isDraggingFiles: boolean
  /** True while a dropped Markdown file is uploading. */
  isUploadingFiles: boolean
}

/**
 * Own the Aura editor lifecycle: startup document load, construct/destroy,
 * status-bar stats, source-mode handoff, autosave, and file drop. Keeps the
 * hosting component free to render layout only.
 *
 * @param documentTitle - Active document title (drives the window title).
 * @returns Editor state and handlers for the layout.
 */
export function useAuraEditor(documentTitle?: string): UseAuraEditorResult {
  const reactId = useId().replace(/:/g, '')
  const editorId = `aura-${reactId}`
  const mountRef = useRef<HTMLDivElement>(null)
  const auraRef = useRef<Aura | null>(null)
  const [auraInstance, setAuraInstance] = useState<Aura | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [docStats, setDocStats] = useState<DocumentStats>(EMPTY_DOC_STATS)

  /**
   * Update in-page stats and the shared store used by the macOS menu.
   *
   * @param next - Latest document metrics.
   * @returns Nothing.
   */
  function publishDocStats(next: DocumentStats): void {
    setDocStats(next)
    setDocumentStats(next)
  }
  const [sourceMode, setSourceMode] = useState(isSourceMode)
  const [session, setSession] = useState(() => getDocumentSession())
  const sourceModeRef = useRef(sourceMode)
  const sourceSeedRef = useRef('')

  useEffect(() => subscribeSourceMode(() => {
    const next = isSourceMode()
    if (next === sourceModeRef.current) {
      return
    }
    if (next) {
      // Entering source mode: seed Monaco from the document store. Unchanged
      // blocks are verbatim source, so an unedited document equals the file.
      sourceSeedRef.current = auraRef.current?.getValue() ?? ''
    } else {
      // Leaving source mode: read Monaco before React unmounts it and make it
      // the new document (setValue re-seeds the store).
      const value = getSourceEditorValue()
      if (value !== null) {
        auraRef.current?.setValue(value)
        publishDocStats(computeDocumentStats(value))
      }
    }
    sourceModeRef.current = next
    setSourceMode(next)
  }), [])

  useEffect(
    () => subscribeDocumentSession(() => setSession(getDocumentSession())),
    [],
  )

  useEffect(() => {
    return () => {
      setDocumentStats(EMPTY_DOC_STATS)
    }
  }, [])

  useEffect(() => {
    // Workbench owns the desktop window title.
  }, [documentTitle])

  useEffect(() => {
    let cancelled = false

    const initEditor = async () => {
      if (!mountRef.current) {
        return
      }

      let markdown = '# Welcome to Aura\n\nStart writing?\n'
      let title = i18n.t('aura.shell.untitled')
      let filePath: string | null = null
      try {
        const pending = consumePendingAuraDocument()
        if (pending) {
          const opened = await openMarkdownAtPath(pending.fileId)
          if (opened !== null) {
            markdown = opened
            title = getDocumentSession().title
            filePath = pending.fileId
            setOpenDocument({ filePath, title, dirty: false })
          }
        } else {
          const startup = await resolveStartupDocument()
          markdown = startup.markdown
          title = startup.title
          filePath = startup.filePath
          setOpenDocument({ filePath, title, dirty: false })
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load markdown',
          )
        }
      }

      if (cancelled) {
        return
      }

      const prefs = getPreferences()
      const options = getAuraOptions(i18n.language, markdown)
      publishDocStats(computeDocumentStats(markdown))
      if (isSourceMode()) {
        // Remount while source mode is active (e.g. locale change).
        sourceSeedRef.current = markdown
      }
      auraRef.current?.destroy()
      /**
       * Refresh status-bar stats from the live editor value.
       * Only safe after `init()` has assigned `instance.aura`.
       */
      const refreshDocStats = (): void => {
        if (cancelled) {
          return
        }
        const instance = auraRef.current
        if (!instance?.getCurrentMode() || isSourceMode()) {
          return
        }
        const value = instance.getValue()
        publishDocStats(computeDocumentStats(value))
        setDocumentDirty(true)
        saveDraft(value, getDocumentSession().title)
      }
      auraRef.current = new Aura(editorId, {
        ...options,
        counter: {
          enable: true,
          type: 'markdown',
          after: () => {
            refreshDocStats()
          },
        },
        after: () => {
          if (cancelled) {
            return
          }
          const instance = auraRef.current
          setAuraInstance(instance)
          setActiveEditor(instance ?? undefined)
          syncEditorChromeFromShellTheme()
          refreshDocStats()
          setDocumentDirty(false)
          if (prefs.defaultEditorMode === 'sv' && !isSourceMode()) {
            setShellSourceMode(true)
          }
        },
      })
    }

    void initEditor().catch((error: unknown) => {
      console.error(error)
      if (!cancelled) {
        setLoadError(
          error instanceof Error ? error.message : 'Failed to initialize editor',
        )
      }
    })

    return () => {
      cancelled = true
      setActiveEditor(undefined)
      auraRef.current?.destroy()
      auraRef.current = null
    }
  }, [editorId])

  // Autosave when enabled and a disk path exists.
  useEffect(() => {
    const prefs = getPreferences()
    if (!prefs.autoSave || !session.filePath) {
      return
    }
    const timer = window.setInterval(() => {
      const instance = auraRef.current
      if (!instance?.getCurrentMode() || !getDocumentSession().dirty) {
        return
      }
      const value = isSourceMode()
        ? (getSourceEditorValue() ?? instance.getValue())
        : instance.getValue()
      void saveMarkdownDocument(value)
    }, 30_000)
    return () => {
      window.clearInterval(timer)
    }
  }, [session.filePath])

  const applyDroppedMarkdown = useCallback(async (files: File[]): Promise<void> => {
    const result = await uploadDroppedMarkdownFiles(files)
    if (!result) {
      return
    }
    publishDocStats(computeDocumentStats(result.markdown))
    if (!setSourceEditorValue(result.markdown)) {
      auraRef.current?.setValue(result.markdown, true)
    }
  }, [])

  useEffect(() => {
    return subscribeAuraDocumentRequest((ready) => {
      void (async () => {
        const markdown = await openMarkdownAtPath(ready.fileId)
        if (markdown === null) {
          return
        }
        publishDocStats(computeDocumentStats(markdown))
        if (!setSourceEditorValue(markdown)) {
          auraRef.current?.setValue(markdown, true)
        }
      })()
    })
  }, [])

  const { isDragging: isDraggingFiles, isUploading: isUploadingFiles, dropBind } = useFileDropUpload({
    enabled: true,
    isAcceptedDrag: (dataTransfer) =>
      getPreferences().dropMarkdownAction !== 'ignore' && isAuraMarkdownDrag(dataTransfer),
    isAcceptedFile: (file) => isAuraMarkdownFileName(file.name),
    onRejectedFiles: () => {
      showToast(i18n.t('aura.errors.unsupportedType'))
    },
    onFiles: applyDroppedMarkdown,
  })

  /**
   * Handle Monaco document changes in source mode.
   *
   * @param value - Current markdown text.
   */
  function onSourceChange(value: string): void {
    auraRef.current?.setSourceValue(value)
    publishDocStats(computeDocumentStats(value))
    setDocumentDirty(true)
    saveDraft(value, getDocumentSession().title)
  }

  /**
   * Open a sidebar file, optionally autosaving the current document first.
   *
   * @param filePath - Absolute path.
   */
  async function openSidebarFile(filePath: string): Promise<void> {
    const prefs = getPreferences()
    const instance = auraRef.current
    const current = getDocumentSession()
    if (
      prefs.autoSaveOnSwitch &&
      current.dirty &&
      current.filePath &&
      instance?.getCurrentMode()
    ) {
      const value = isSourceMode()
        ? (getSourceEditorValue() ?? instance.getValue())
        : instance.getValue()
      await saveMarkdownDocument(value)
    }
    const markdown = await openMarkdownAtPath(filePath)
    if (markdown !== null && !setSourceEditorValue(markdown)) {
      instance?.setValue(markdown, true)
    }
  }

  /**
   * Toggle source mode (Monaco) vs WYSIWYG (shared with View menu).
   */
  function toggleSourceMode(): void {
    toggleShellSourceMode()
  }

  return {
    editorId,
    mountRef,
    auraInstance,
    loadError,
    docStats,
    sourceMode,
    sourceSeedRef,
    onSourceChange,
    openSidebarFile,
    toggleSourceMode,
    dropBind,
    isDraggingFiles,
    isUploadingFiles,
  }
}
