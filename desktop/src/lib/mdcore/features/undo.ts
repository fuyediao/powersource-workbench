import { editorUi } from '@/utils/aura/editor-ui';
import {scrollCenter} from "../modes/editorCommonEvent";
import {highlightToolbar} from "../modes/highlightToolbar";
import {renderDomByMd} from "../modes/renderDomByMd";
import {renderToc} from "../modes/toc";

interface SelectionSnapshot {
    blockIndex: number;
    textOffset: number;
}

interface HistoryEntry {
    markdown: string;
    selection: SelectionSnapshot | null;
}

/**
 * Markdown-based undo manager. History stores source snapshots rather than
 * rendered DOM patches, so undo/redo follows the same source of truth as
 * source mode, saving, and export.
 */
class Undo {
    private readonly stackSize = 50;
    private undoStack: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];

    /** Clear all history. */
    public clearStack(_aura: IAura) {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Restore the previous Markdown snapshot.
     *
     * @param aura - Active editor.
     */
    public undo(aura: IAura) {
        if (aura.wysiwyg.element.getAttribute("contenteditable") === "false" ||
            this.undoStack.length < 2) {
            return;
        }
        const current = this.undoStack.pop();
        if (current) {
            this.redoStack.push(current);
        }
        const target = this.undoStack[this.undoStack.length - 1];
        if (target) {
            this.renderEntry(aura, target);
        }
        editorUi.hideHint();
    }

    /**
     * Restore the next Markdown snapshot.
     *
     * @param aura - Active editor.
     */
    public redo(aura: IAura) {
        if (aura.wysiwyg.element.getAttribute("contenteditable") === "false") {
            return;
        }
        const target = this.redoStack.pop();
        if (!target) {
            return;
        }
        this.undoStack.push(target);
        this.renderEntry(aura, target);
    }

    /**
     * Capture the initial caret location before the first edit. The Markdown
     * snapshot already exists; only its selection needs refreshing.
     *
     * @param aura - Active editor.
     * @param _event - Original keyboard event.
     */
    public recordFirstPosition(aura: IAura, _event: KeyboardEvent) {
        if (this.undoStack.length === 1 && this.redoStack.length === 0) {
            this.undoStack[0].selection = captureSelection(aura);
        }
    }

    /**
     * Add the current authoritative Markdown to history.
     *
     * @param aura - Active editor.
     */
    public addToUndoStack(aura: IAura) {
        const markdown = aura.document.getText();
        const last = this.undoStack[this.undoStack.length - 1];
        if (last?.markdown === markdown) {
            last.selection = captureSelection(aura);
            return;
        }
        this.undoStack.push({
            markdown,
            selection: captureSelection(aura),
        });
        if (this.undoStack.length > this.stackSize) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    /**
     * Render a Markdown history entry and restore its approximate caret.
     *
     * @param aura - Active editor.
     * @param entry - History state.
     */
    private renderEntry(aura: IAura, entry: HistoryEntry) {
        renderDomByMd(aura, entry.markdown, {
            enableAddUndoStack: false,
            enableHint: false,
        });
        renderToc(aura);
        restoreSelection(aura, entry.selection);
        scrollCenter(aura);
        highlightToolbar(aura);
    }
}

/**
 * Capture the collapsed selection as top-level block index + visible offset.
 *
 * @param aura - Active editor.
 * @returns Selection snapshot, or null when focus is outside the editor.
 */
function captureSelection(aura: IAura): SelectionSnapshot | null {
    const selection = getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    const root = aura.wysiwyg.element;
    if (!root.contains(range.startContainer)) {
        return null;
    }
    let block = range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer as HTMLElement
        : range.startContainer.parentElement;
    while (block?.parentElement && block.parentElement !== root) {
        block = block.parentElement;
    }
    if (!block || block.parentElement !== root) {
        return null;
    }
    const blockIndex = Array.from(root.children).indexOf(block);
    return {blockIndex, textOffset: textOffsetBeforeRange(block, range)};
}

/**
 * Count editable text before a range while excluding generated previews.
 *
 * @param block - Top-level editor block.
 * @param range - Current selection range.
 * @returns Editable UTF-16 text offset.
 */
function textOffsetBeforeRange(block: HTMLElement, range: Range) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.parentElement?.closest(".aura-wysiwyg__preview")
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
        },
    });
    let offset = 0;
    let node = walker.nextNode() as Text | null;
    while (node) {
        if (node === range.startContainer) {
            return offset + Math.min(range.startOffset, node.data.length);
        }
        const nodeRange = document.createRange();
        nodeRange.selectNodeContents(node);
        if (nodeRange.compareBoundaryPoints(Range.END_TO_START, range) <= 0) {
            offset += node.data.length;
        } else {
            break;
        }
        node = walker.nextNode() as Text | null;
    }
    return offset;
}

/**
 * Restore a selection after Markdown re-render.
 *
 * @param aura - Active editor.
 * @param snapshot - Saved block index / text offset.
 */
function restoreSelection(aura: IAura, snapshot: SelectionSnapshot | null) {
    const root = aura.wysiwyg.element;
    const blocks = Array.from(root.children) as HTMLElement[];
    const block = snapshot
        ? blocks[Math.min(snapshot.blockIndex, blocks.length - 1)]
        : blocks[blocks.length - 1];
    if (!block) {
        root.focus();
        return;
    }
    const targetOffset = snapshot?.textOffset ?? block.textContent!.length;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            return node.parentElement?.closest(".aura-wysiwyg__preview")
                ? NodeFilter.FILTER_REJECT
                : NodeFilter.FILTER_ACCEPT;
        },
    });
    let remaining = targetOffset;
    let node = walker.nextNode() as Text | null;
    while (node) {
        if (remaining <= node.data.length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.collapse(true);
            const selection = getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            root.focus();
            return;
        }
        remaining -= node.data.length;
        node = walker.nextNode() as Text | null;
    }
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    root.focus();
}

export {Undo};
