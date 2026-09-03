import { useEffect, useState } from 'react'
import { AppMenubar } from '@/components/aura/app-menubar'
import { EditorSidebar } from '@/components/aura/editor-sidebar'
import { SourceEditor } from '@/components/aura/source-editor'
import { SidebarErrorBoundary } from '@/components/aura/sidebar-error-boundary'
import { useTranslation } from 'react-i18next'
import {
  getPreferences,
  subscribePreferences,
} from '@/hooks/aura/preferences-store'
import {
  getSidebarCollapsed,
  subscribeSidebarCollapsed,
  toggleSidebarCollapsed,
} from '@/hooks/aura/sidebar-store'
import { FindReplaceBar } from '@/components/aura/find-replace'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import {
  getEditorChromeDark,
  subscribeEditorChromeDark,
} from '@/hooks/aura/editor-chrome-theme-store'
import { useAuraEditor } from '@/components/aura/use-aura-editor'

interface AuraEditorProps {
  documentTitle?: string
}

/**
 * GeoCRM Markdown editor shell: menubar, sidebar, and document surface.
 *
 * @param props - Editor props.
 * @returns Editor shell element.
 */
export function AuraEditor({ documentTitle }: AuraEditorProps) {
  const { t } = useTranslation()
  const {
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
  } = useAuraEditor(documentTitle)

  const [collapsed, setCollapsed] = useState(getSidebarCollapsed())
  const [outlineCollapsible, setOutlineCollapsible] = useState(
    () => getPreferences().outlineCollapsible,
  )
  const [editorDark, setEditorDark] = useState(getEditorChromeDark)

  useEffect(() => subscribeSidebarCollapsed(() => setCollapsed(getSidebarCollapsed())), [])
  useEffect(
    () => subscribeEditorChromeDark(() => setEditorDark(getEditorChromeDark())),
    [],
  )
  useEffect(
    () =>
      subscribePreferences(() => {
        setOutlineCollapsible(getPreferences().outlineCollapsible)
      }),
    [],
  )

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden sm:gap-4"
      {...dropBind}
    >
      <AppMenubar
        docStats={docStats}
        sourceMode={sourceMode}
        sidebarCollapsed={collapsed}
        outlineCollapsible={outlineCollapsible}
        onToggleSidebar={toggleSidebarCollapsed}
        onToggleSource={toggleSourceMode}
      />
      {loadError ? (
        <p className="aura-chrome-panel shrink-0 rounded-2xl border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-100">
          {loadError}
        </p>
      ) : null}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <SidebarErrorBoundary
          fallback={
            <div className="aura-chrome-panel box-border mr-3 flex h-full w-60 shrink-0 items-center rounded-2xl px-3 text-[13px] text-(--text-color)/55 sm:mr-4">
              {t('aura.shell.outlineUnavailable')}
            </div>
          }
        >
          <EditorSidebar
            aura={auraInstance}
            documentTitle={documentTitle ?? t('aura.shell.untitled')}
            collapsed={sourceMode || collapsed}
            onOpenFile={(filePath) => {
              void openSidebarFile(filePath)
            }}
          />
        </SidebarErrorBoundary>
        <div className="aura-chrome-panel relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
          {sourceMode ? null : <FindReplaceBar />}
          <div
            id={editorId}
            ref={mountRef}
            className={`aura aura-mount min-h-0 min-w-0 flex-1 overflow-hidden ${editorDark ? 'aura--dark' : ''} ${sourceMode ? 'hidden!' : ''}`}
          >
            <div className="aura-content aura-scroll">
              <div id="write" className="aura-write" />
            </div>
          </div>
          {sourceMode ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <SourceEditor
                initialValue={sourceSeedRef.current}
                onChange={onSourceChange}
              />
            </div>
          ) : null}
        </div>
      </div>
      <FileDropOverlay
        active={isDraggingFiles}
        uploading={isUploadingFiles}
        label={
          isUploadingFiles ? t('aura.shell.dropUploading') : t('aura.shell.dropRelease')
        }
      />
    </div>
  )
}
