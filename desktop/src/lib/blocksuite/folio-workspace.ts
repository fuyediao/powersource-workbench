/**
 * Folio BlockSuite workspace helpers (vendored `@blocksuite/affine` 0.27).
 * Uses TestWorkspace for a single-page doc; Yjs state is the page `spaceDoc`.
 */

import {
  StoreExtensionManager,
  ViewExtensionManager,
} from '@blocksuite/affine/ext-loader'
import { AttachmentStoreExtension } from '@blocksuite/affine/blocks/attachment/store'
import { AttachmentViewExtension } from '@blocksuite/affine/blocks/attachment/view'
import { BookmarkStoreExtension } from '@blocksuite/affine/blocks/bookmark/store'
import { BookmarkViewExtension } from '@blocksuite/affine/blocks/bookmark/view'
import { CalloutStoreExtension } from '@blocksuite/affine/blocks/callout/store'
import { CalloutViewExtension } from '@blocksuite/affine/blocks/callout/view'
import { CodeStoreExtension } from '@blocksuite/affine/blocks/code/store'
import { CodeBlockViewExtension } from '@blocksuite/affine/blocks/code/view'
import { DataViewStoreExtension } from '@blocksuite/affine/blocks/data-view/store'
import { DataViewViewExtension } from '@blocksuite/affine/blocks/data-view/view'
import { DatabaseStoreExtension } from '@blocksuite/affine/blocks/database/store'
import { DatabaseViewExtension } from '@blocksuite/affine/blocks/database/view'
import { DividerStoreExtension } from '@blocksuite/affine/blocks/divider/store'
import { DividerViewExtension } from '@blocksuite/affine/blocks/divider/view'
import { EmbedStoreExtension } from '@blocksuite/affine/blocks/embed/store'
import { EmbedViewExtension } from '@blocksuite/affine/blocks/embed/view'
import { EmbedDocStoreExtension } from '@blocksuite/affine/blocks/embed-doc/store'
import { EmbedDocViewExtension } from '@blocksuite/affine/blocks/embed-doc/view'
import { ImageStoreExtension } from '@blocksuite/affine/blocks/image/store'
import { ImageViewExtension } from '@blocksuite/affine/blocks/image/view'
import { LatexStoreExtension } from '@blocksuite/affine/blocks/latex/store'
import { LatexViewExtension } from '@blocksuite/affine/blocks/latex/view'
import { ListStoreExtension } from '@blocksuite/affine/blocks/list/store'
import { ListViewExtension } from '@blocksuite/affine/blocks/list/view'
import { NoteStoreExtension } from '@blocksuite/affine/blocks/note/store'
import { NoteViewExtension } from '@blocksuite/affine/blocks/note/view'
import { ParagraphStoreExtension } from '@blocksuite/affine/blocks/paragraph/store'
import { ParagraphViewExtension } from '@blocksuite/affine/blocks/paragraph/view'
import { RootStoreExtension } from '@blocksuite/affine/blocks/root/store'
import { RootViewExtension } from '@blocksuite/affine/blocks/root/view'
import { SurfaceRefStoreExtension } from '@blocksuite/affine/blocks/surface-ref/store'
import { SurfaceRefViewExtension } from '@blocksuite/affine/blocks/surface-ref/view'
import { SurfaceViewExtension } from '@blocksuite/affine/blocks/surface/view'
import { TableStoreExtension } from '@blocksuite/affine/blocks/table/store'
import { TableViewExtension } from '@blocksuite/affine/blocks/table/view'
import { FoundationStoreExtension } from '@blocksuite/affine/foundation/store'
import { FoundationViewExtension } from '@blocksuite/affine/foundation/view'
import { FootnoteStoreExtension } from '@blocksuite/affine/inlines/footnote/store'
import { FootnoteViewExtension } from '@blocksuite/affine/inlines/footnote/view'
import { LatexStoreExtension as InlineLatexStoreExtension } from '@blocksuite/affine/inlines/latex/store'
import { LatexViewExtension as InlineLatexViewExtension } from '@blocksuite/affine/inlines/latex/view'
import { LinkStoreExtension } from '@blocksuite/affine/inlines/link/store'
import { LinkViewExtension } from '@blocksuite/affine/inlines/link/view'
import { MentionViewExtension } from '@blocksuite/affine/inlines/mention/view'
import { InlinePresetStoreExtension } from '@blocksuite/affine/inlines/preset/store'
import { InlinePresetViewExtension } from '@blocksuite/affine/inlines/preset/view'
import { InlineCommentViewExtension } from '@blocksuite/affine/inlines/comment'
import { ReferenceStoreExtension } from '@blocksuite/affine/inlines/reference/store'
import { ReferenceViewExtension } from '@blocksuite/affine/inlines/reference/view'
import { Text, type ExtensionType, type Store } from '@blocksuite/affine/store'
import { TestWorkspace } from '@blocksuite/affine/store/test'
import { SlashMenuViewExtension } from '@blocksuite/affine/widgets/slash-menu/view'
import { applyUpdate, encodeStateAsUpdate } from 'yjs'
import type { Awareness } from 'y-protocols/awareness'
import { decodeYjsState } from '@/services/folio-api'
import { FolioRemoteCursorViewExtension } from '@/lib/blocksuite/folio-remote-cursor'
import { SupabaseFolioBlobSource } from '@/lib/blocksuite/folio-blob-source'
import { SurfaceStoreExtension } from '@blocksuite/affine/blocks/surface/store'
import { FrameStoreExtension } from '@blocksuite/affine/blocks/frame/store'
import { EdgelessTextStoreExtension } from '@blocksuite/affine/blocks/edgeless-text/store'
import { BrushStoreExtension } from '@blocksuite/affine/gfx/brush/store'
import { ShapeStoreExtension } from '@blocksuite/affine/gfx/shape/store'
import { ConnectorStoreExtension } from '@blocksuite/affine/gfx/connector/store'
import { GroupStoreExtension } from '@blocksuite/affine/gfx/group/store'
import { TextStoreExtension } from '@blocksuite/affine/gfx/text/store'
import { ViewportElementExtension } from '@blocksuite/affine/shared/services'

/** Cached store extensions for Folio workspaces. */
let storeExtensions: ExtensionType[] | null = null

/** Cached page-mode view extensions (registers Lit custom elements once). */
let pageViewExtensions: ExtensionType[] | null = null

/**
 * Resolve BlockSuite store schema/extensions.
 * @returns Store extension list.
 */
export function getFolioStoreExtensions(): ExtensionType[] {
  if (!storeExtensions) {
    const pageOnlyProviders = [
      FoundationStoreExtension,
      AttachmentStoreExtension,
      BookmarkStoreExtension,
      CalloutStoreExtension,
      CodeStoreExtension,
      DataViewStoreExtension,
      DatabaseStoreExtension,
      DividerStoreExtension,
      EmbedStoreExtension,
      EmbedDocStoreExtension,
      ImageStoreExtension,
      LatexStoreExtension,
      ListStoreExtension,
      NoteStoreExtension,
      ParagraphStoreExtension,
      SurfaceRefStoreExtension,
      TableStoreExtension,
      RootStoreExtension,
      FootnoteStoreExtension,
      LinkStoreExtension,
      ReferenceStoreExtension,
      InlineLatexStoreExtension,
      InlinePresetStoreExtension,
      SurfaceStoreExtension,
      FrameStoreExtension,
      EdgelessTextStoreExtension,
      BrushStoreExtension,
      ShapeStoreExtension,
      ConnectorStoreExtension,
      GroupStoreExtension,
      TextStoreExtension,
    ]
    storeExtensions = new StoreExtensionManager(pageOnlyProviders).get('store')
  }
  return storeExtensions
}

/** Ensure an Edgeless surface exists under the shared page root. */
export function ensureFolioSurface(store: Store): boolean {
  if (!store.root) return false
  if (store.root.children.some((child) => child.flavour === 'affine:surface')) return false
  store.addBlock('affine:surface', {}, store.root.id, 0)
  return true
}

/**
 * Resolve BlockSuite page view extensions (side-effect: CE registration).
 * @returns Page view extension list for {@link BlockStdScope}.
 */
export function getFolioPageViewExtensions(): ExtensionType[] {
  if (!pageViewExtensions) {
    const pageOnlyProviders = [
      FoundationViewExtension,
      AttachmentViewExtension,
      BookmarkViewExtension,
      CalloutViewExtension,
      CodeBlockViewExtension,
      DataViewViewExtension,
      DatabaseViewExtension,
      DividerViewExtension,
      EmbedViewExtension,
      EmbedDocViewExtension,
      ImageViewExtension,
      LatexViewExtension,
      ListViewExtension,
      NoteViewExtension,
      ParagraphViewExtension,
      SurfaceViewExtension,
      SurfaceRefViewExtension,
      TableViewExtension,
      RootViewExtension,
      FootnoteViewExtension,
      LinkViewExtension,
      ReferenceViewExtension,
      InlineLatexViewExtension,
      MentionViewExtension,
      InlinePresetViewExtension,
      InlineCommentViewExtension,
      SlashMenuViewExtension,
      FolioRemoteCursorViewExtension,
    ]
    pageViewExtensions = new ViewExtensionManager(pageOnlyProviders)
      .get('page')
      .concat([ViewportElementExtension('.folio-blocksuite-viewport')])
  }
  return pageViewExtensions
}

/** Live Folio BlockSuite session for one `folio_pages` row. */
export interface FolioBlocksuiteSession {
  workspace: TestWorkspace
  store: Store
  awareness: Awareness
  /** Encode the page spaceDoc for persistence. */
  encodeState: () => Uint8Array
  dispose: () => void
}

/**
 * Seed an empty page + note + paragraph (+ optional database) when the store has no root.
 * @param store - BlockSuite store.
 * @param withDatabase - Whether to insert an inline database block.
 */
function seedEmptyPage(store: Store, withDatabase: boolean): void {
  const rootId = store.addBlock('affine:page', {
    title: new Text(''),
  })
  const noteId = store.addBlock('affine:note', {}, rootId)
  store.addBlock('affine:paragraph', { text: new Text('') }, noteId)
  if (withDatabase) {
    store.addBlock(
      'affine:database',
      {
        columns: [],
        titleColumn: 'Title',
      },
      noteId,
    )
  }
}

/**
 * Create a Folio BlockSuite session for one page id.
 * @param pageId - Folio page uuid (also BlockSuite doc id).
 * @param initialYjsState - Raw `yjs_state` from Supabase (hex/base64) or null.
 * @param options - Readonly and seed flags.
 * @returns Session with store, awareness, and dispose.
 */
export function createFolioBlocksuiteSession(
  pageId: string,
  initialYjsState: string | null,
  options: { readonly: boolean; seedDatabase?: boolean } = { readonly: false },
): FolioBlocksuiteSession {
  const extensions = getFolioStoreExtensions()
  const workspace = new TestWorkspace({
    id: `folio-${pageId}`,
    // Persist attachments/images to Supabase Storage instead of the default
    // in-memory blob source, which drops every blob on reload.
    blobSources: { main: new SupabaseFolioBlobSource(pageId, options.readonly) },
  })
  workspace.storeExtensions = extensions
  workspace.meta.initialize()

  const doc = workspace.createDoc(pageId)
  doc.load()

  const bytes = decodeYjsState(initialYjsState)
  if (bytes && bytes.length > 0) {
    applyUpdate(doc.spaceDoc, bytes)
  }

  const store = doc.getStore({
    readonly: options.readonly,
  })

  if (!store.root) {
    seedEmptyPage(store, Boolean(options.seedDatabase))
  }

  return {
    workspace,
    store,
    awareness: workspace.awarenessStore.awareness,
    encodeState: () => encodeStateAsUpdate(doc.spaceDoc),
    dispose: () => {
      workspace.forceStop()
      workspace.dispose()
    },
  }
}
