/** Lazy-only BlockSuite Edgeless view allowlist for Folio. */

import { ViewExtensionManager } from '@blocksuite/affine/ext-loader'
import { FoundationViewExtension } from '@blocksuite/affine/foundation/view'
import { RootViewExtension } from '@blocksuite/affine/blocks/root/view'
import { SurfaceViewExtension } from '@blocksuite/affine/blocks/surface/view'
import { NoteViewExtension } from '@blocksuite/affine/blocks/note/view'
import { ParagraphViewExtension } from '@blocksuite/affine/blocks/paragraph/view'
import { FrameViewExtension } from '@blocksuite/affine/blocks/frame/view'
import { EdgelessTextViewExtension } from '@blocksuite/affine/blocks/edgeless-text/view'
import { BrushViewExtension } from '@blocksuite/affine/gfx/brush/view'
import { NoteViewExtension as GfxNoteViewExtension } from '@blocksuite/affine/gfx/note/view'
import { PointerViewExtension } from '@blocksuite/affine/gfx/pointer/view'
import { ShapeViewExtension } from '@blocksuite/affine/gfx/shape/view'
import { ConnectorViewExtension } from '@blocksuite/affine/gfx/connector/view'
import { GroupViewExtension } from '@blocksuite/affine/gfx/group/view'
import { TextViewExtension } from '@blocksuite/affine/gfx/text/view'
import { EdgelessToolbarViewExtension } from '@blocksuite/affine/widgets/edgeless-toolbar/view'
import { EdgelessZoomToolbarViewExtension } from '@blocksuite/affine/widgets/edgeless-zoom-toolbar/view'
import { EdgelessSelectedRectViewExtension } from '@blocksuite/affine/widgets/edgeless-selected-rect/view'
import { InlineCommentViewExtension } from '@blocksuite/affine/inlines/comment'
import { FootnoteViewExtension } from '@blocksuite/affine/inlines/footnote/view'
import { LatexViewExtension as InlineLatexViewExtension } from '@blocksuite/affine/inlines/latex/view'
import { LinkViewExtension } from '@blocksuite/affine/inlines/link/view'
import { MentionViewExtension } from '@blocksuite/affine/inlines/mention/view'
import { InlinePresetViewExtension } from '@blocksuite/affine/inlines/preset/view'
import { ReferenceViewExtension } from '@blocksuite/affine/inlines/reference/view'
import { ViewportElementExtension } from '@blocksuite/affine/shared/services'
import type { ExtensionType } from '@blocksuite/affine/store'

let edgelessExtensions: ExtensionType[] | null = null

/**
 * Resolve the Edgeless view graph only after the Canvas host is requested.
 * @returns Explicit Edgeless view extension allowlist.
 */
export function getFolioEdgelessViewExtensions(): ExtensionType[] {
  if (!edgelessExtensions) {
    edgelessExtensions = new ViewExtensionManager([
      FoundationViewExtension,
      PointerViewExtension,
      GfxNoteViewExtension,
      RootViewExtension,
      SurfaceViewExtension,
      NoteViewExtension,
      ParagraphViewExtension,
      FrameViewExtension,
      EdgelessTextViewExtension,
      BrushViewExtension,
      ShapeViewExtension,
      ConnectorViewExtension,
      GroupViewExtension,
      TextViewExtension,
      EdgelessToolbarViewExtension,
      EdgelessZoomToolbarViewExtension,
      EdgelessSelectedRectViewExtension,
      FootnoteViewExtension,
      InlineLatexViewExtension,
      LinkViewExtension,
      MentionViewExtension,
      InlinePresetViewExtension,
      ReferenceViewExtension,
      InlineCommentViewExtension,
    ]).get('edgeless').concat([ViewportElementExtension('.folio-blocksuite-viewport')])
  }
  return edgelessExtensions
}
