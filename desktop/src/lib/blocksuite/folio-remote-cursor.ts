/**
 * Folio remote cursor/selection widget (page-only, no gfx/edgeless dependency).
 * The upstream `@blocksuite/affine-widget-remote-selection` doc widget calls
 * `std.get(GfxControllerIdentifier)`, which is never registered in Folio's page-only
 * view extensions and throws `ServiceNotFoundError`. This is a trimmed reimplementation
 * that renders the same cursor caret + selection highlight + name badge from Yjs awareness,
 * using only page-safe APIs (selection manager, store slots, container scroll/resize).
 */

import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader'
import { getSelectionRectsCommand } from '@blocksuite/affine/shared/commands'
import {
  BlockSelection,
  TextSelection,
  WidgetComponent,
  WidgetViewExtension,
} from '@blocksuite/affine/std'
import type { BaseSelection } from '@blocksuite/affine/store'
import { css, html, nothing } from 'lit'
import { literal, unsafeStatic } from 'lit/static-html.js'
import { styleMap } from 'lit/directives/style-map.js'

const WIDGET_TAG = 'folio-remote-cursor-widget'

/** Small fixed palette; deterministic per awareness client so tabs stay visually distinct. */
const REMOTE_COLOR_VARS = [
  'var(--folio-remote-1)',
  'var(--folio-remote-2)',
  'var(--folio-remote-3)',
  'var(--folio-remote-4)',
  'var(--folio-remote-5)',
  'var(--folio-remote-6)',
]

/**
 * Deterministically pick a palette color for a given awareness seed (client id or user label).
 * @param seed - Stable identifier for the remote participant.
 * @returns CSS color (theme token) to render their cursor/selection.
 */
export function pickFolioRemoteColor(seed: string | number): string {
  const text = String(seed)
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }
  return REMOTE_COLOR_VARS[hash % REMOTE_COLOR_VARS.length]!
}

interface SelectionRect {
  width: number
  height: number
  top: number
  left: number
  transparent?: boolean
}

/**
 * Renders every other collaborator's text/block selection and a caret + name badge.
 * Repaints on selection changes, block updates, container scroll, and window resize.
 */
class FolioRemoteCursorWidget extends WidgetComponent {
  static override styles = css`
    :host {
      pointer-events: none;
      position: absolute;
      inset: 0;
      z-index: 5;
    }
  `

  private selections: Array<{
    id: number
    rects: SelectionRect[]
    cursor: SelectionRect | null
    user?: { name?: string; color?: string }
  }> = []

  private resizeObserver: ResizeObserver | null = null

  /**
   * Same reference frame `getSelectionRectsCommand` uses (`.affine-page-viewport`), so
   * highlight rects and the caret/badge share one coordinate origin.
   */
  private get container(): HTMLElement | null {
    return this.host.closest<HTMLElement>('.affine-page-viewport')
  }

  override connectedCallback() {
    super.connectedCallback()

    this.resizeObserver = new ResizeObserver(() => this.refresh())
    if (this.container) {
      this.resizeObserver.observe(this.container)
      this.disposables.addFromEvent(this.container, 'scroll', () => this.refresh())
    }
    this.disposables.addFromEvent(window, 'resize', () => this.refresh())
    this.disposables.add(
      this.std.selection.slots.remoteChanged.subscribe(() => this.refresh()),
    )
    this.disposables.add(
      this.std.store.slots.blockUpdated.subscribe(() => this.refresh()),
    )

    this.refresh()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  private getCursorRect(selections: BaseSelection[]): SelectionRect | null {
    if (!this.block || this.block.model.flavour !== 'affine:page') {
      return null
    }
    const containerRect = this.container?.getBoundingClientRect()
    const textSelection = selections.find(
      (selection) => selection instanceof TextSelection,
    ) as TextSelection | undefined
    if (textSelection) {
      const toBlockId = textSelection.to ? textSelection.to.blockId : textSelection.from.blockId
      const index = textSelection.to
        ? textSelection.to.index + textSelection.to.length
        : textSelection.from.index + textSelection.from.length
      const range = this.std.range.textSelectionToRange(
        this.std.selection.create(TextSelection, {
          from: { blockId: toBlockId, index, length: 0 },
          to: null,
        }),
      )
      const rects = range ? Array.from(range.getClientRects()) : []
      if (rects.length > 0) {
        const rect = rects[rects.length - 1]!
        return {
          width: 2,
          height: rect.height,
          top: rect.top - (containerRect?.top ?? 0) + (this.container?.scrollTop ?? 0),
          left: rect.left - (containerRect?.left ?? 0) + (this.container?.scrollLeft ?? 0),
        }
      }
    }
    const blockSelections = selections.filter((selection) => selection instanceof BlockSelection)
    if (blockSelections.length > 0) {
      const last = blockSelections[blockSelections.length - 1]!
      const block = this.host.view.getBlock(last.blockId)
      if (block) {
        const rect = block.getBoundingClientRect()
        return {
          width: 2,
          height: rect.height,
          top: rect.top - (containerRect?.top ?? 0) + (this.container?.scrollTop ?? 0),
          left:
            rect.left + rect.width - (containerRect?.left ?? 0) + (this.container?.scrollLeft ?? 0),
        }
      }
    }
    return null
  }

  private getSelectionRects(selections: BaseSelection[]): SelectionRect[] {
    if (!this.block || this.block.model.flavour !== 'affine:page') {
      return []
    }
    const textSelection = selections.find(
      (selection) => selection instanceof TextSelection,
    ) as TextSelection | undefined
    const blockSelections = selections.filter((selection) => selection instanceof BlockSelection)
    if (!textSelection && blockSelections.length === 0) {
      return []
    }
    const [, { selectionRects }] = this.std.command.exec(getSelectionRectsCommand, {
      textSelection,
      blockSelections,
    })
    return selectionRects ?? []
  }

  private refresh(): void {
    const states = this.std.store.awarenessStore.getStates()
    const remote = this.std.selection.remoteSelections
    const seen = new Set<number>()
    this.selections = Array.from(remote.entries()).flatMap(([id, selections]) => {
      if (seen.has(id)) {
        return []
      }
      seen.add(id)
      return [
        {
          id,
          rects: this.getSelectionRects(selections),
          cursor: this.getCursorRect(selections),
          user: states.get(id)?.user as { name?: string; color?: string } | undefined,
        },
      ]
    })
    this.requestUpdate()
  }

  override render() {
    if (this.selections.length === 0) {
      return nothing
    }
    return html`<div>
      ${this.selections.map((entry) => {
        const color = entry.user?.color ?? pickFolioRemoteColor(entry.id)
        const highlights = entry.rects.map(
          (rect) => html`<div
            style=${styleMap({
              position: 'absolute',
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              backgroundColor: color,
              opacity: '0.2',
              borderRadius: '3px',
            })}
          ></div>`,
        )
        const caret = entry.cursor
          ? html`<div
              style=${styleMap({
                position: 'absolute',
                width: `${entry.cursor.width}px`,
                height: `${entry.cursor.height}px`,
                top: `${entry.cursor.top}px`,
                left: `${entry.cursor.left}px`,
                backgroundColor: color,
              })}
            >
              <div
                style=${styleMap({
                  position: 'absolute',
                  left: '-4px',
                  bottom: `${entry.cursor.height - 2}px`,
                  backgroundColor: color,
                  color: '#fff',
                  maxWidth: '160px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: '600',
                  lineHeight: '16px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.16)',
                })}
              >
                ${entry.user?.name ?? ''}
              </div>
            </div>`
          : nothing
        return [...highlights, caret]
      })}
    </div>`
  }
}

customElements.define(WIDGET_TAG, FolioRemoteCursorWidget)

const folioRemoteCursorWidget = WidgetViewExtension(
  'affine:page',
  WIDGET_TAG,
  literal`${unsafeStatic(WIDGET_TAG)}`,
)

/** Registers {@link FolioRemoteCursorWidget} on `affine:page` without pulling in gfx/edgeless. */
export class FolioRemoteCursorViewExtension extends ViewExtensionProvider {
  override name = 'folio-remote-cursor-widget'

  override setup(context: ViewExtensionContext): void {
    super.setup(context)
    context.register(folioRemoteCursorWidget)
  }
}
