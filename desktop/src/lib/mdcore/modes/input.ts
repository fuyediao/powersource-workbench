import {
    getTopList,
    hasClosestBlock, hasClosestByAttribute, hasTopClosestByTag,
} from "../util/hasClosest";
import {hasClosestByTag} from "../util/hasClosestByHeadings";
import {flagRender, unwrapFlagImages} from "../render/flagRender";
import {CODE_RENDER_SELECTOR, processCodeRender} from "../render/processCode";
import {setRangeByWbr} from "../util/selection";
import {renderToc} from "./toc";
import {afterRenderEvent} from "./afterRenderEvent";
import {previoueIsEmptyA} from "./inlineTag";
import {matchEmptyHeadingShortcut} from "../util/block-markdown-shortcut";

/**
 * Convert an empty ATX prefix into a real heading when its trigger space is typed.
 * @param aura - Active editor instance.
 * @param blockElement - Current editable block.
 * @param event - Browser input event.
 * @returns True when the paragraph was converted.
 */
const completeHeadingShortcut = (aura: IAura, blockElement: HTMLElement, event?: InputEvent) => {
    if (!event || event.inputType !== "insertText" || blockElement.tagName !== "P" ||
        !blockElement.parentElement?.isEqualNode(aura.wysiwyg.element)) {
        return false;
    }
    const shortcut = matchEmptyHeadingShortcut(blockElement.textContent ?? "");
    if (!shortcut) {
        return false;
    }
    const headingElement = document.createElement(`h${shortcut.level}`);
    headingElement.setAttribute("data-block", "0");
    headingElement.setAttribute("data-marker", "#");
    headingElement.innerHTML = "<wbr><br>";
    blockElement.replaceWith(headingElement);
    setRangeByWbr(aura.wysiwyg.element, new Range());
    renderToc(aura);
    afterRenderEvent(aura, {
        enableAddUndoStack: true,
        enableHint: true,
    });
    return true;
};

export const input = (aura: IAura, range: Range, event?: InputEvent) => {
    let blockElement = hasClosestBlock(range.startContainer);

    if (!blockElement) {
        // Use top-level block element innerHTML
        blockElement = aura.wysiwyg.element;
    }

    if (completeHeadingShortcut(aura, blockElement, event)) {
        return;
    }

    // spinAuraDom must see Unicode emoji, not flag <img> nodes.
    unwrapFlagImages(blockElement);

    if (event && event.inputType !== "formatItalic"
        && event.inputType !== "deleteByDrag"
        && event.inputType !== "insertFromDrop"
        && event.inputType !== "formatBold"
        && event.inputType !== "formatRemove"
        && event.inputType !== "formatStrikeThrough"
        && event.inputType !== "insertUnorderedList"
        && event.inputType !== "insertOrderedList"
        && event.inputType !== "formatOutdent"
        && event.inputType !== "formatIndent"
        && event.inputType !== ""   // document.execCommand('unlink', false)
        || !event
    ) {
        const previousAEmptyElement = previoueIsEmptyA(range.startContainer);
        if (previousAEmptyElement) {
            // Link end Enter should not copy to next line https://github.com/Vanessa219/aura/issues/163
            previousAEmptyElement.remove();
        }

        // Save cursor
        aura.wysiwyg.element.querySelectorAll("wbr").forEach((wbr) => {
            wbr.remove();
        });
        range.insertNode(document.createElement("wbr"));

        // Delete at line start leaves styled elements behind; clear styles
        blockElement.querySelectorAll("[style]").forEach((item) => {
            item.removeAttribute("style");
        });

        let html = "";
        if (blockElement.getAttribute("data-type")! === "link-ref-defs-block") {
            // Update link reference
            blockElement = aura.wysiwyg.element;
        }

        const isWYSIWYGElement = blockElement.isEqualNode(aura.wysiwyg.element);
        const footnoteElement = hasClosestByAttribute(blockElement, "data-type", "footnotes-block");

        if (!isWYSIWYGElement) {
            // List must reach top level
            const topListElement = getTopList(range.startContainer);
            if (topListElement && !footnoteElement) {
                const blockquoteElement = hasClosestByTag(range.startContainer, "BLOCKQUOTE");
                if (blockquoteElement) {
                    // When li contains blockquote, render blockquote only
                    blockElement = hasClosestBlock(range.startContainer) || blockElement;
                } else {
                    blockElement = topListElement;
                }
            }

            // Update footnote
            if (footnoteElement) {
                blockElement = footnoteElement;
            }

            html = blockElement.outerHTML;

            if (blockElement.tagName === "UL" || blockElement.tagName === "OL") {
                // If in list, redraw surrounding list items
                const listPrevElement = blockElement.previousElementSibling!;
                const listNextElement = blockElement.nextElementSibling!;
                if (listPrevElement && (listPrevElement.tagName === "UL" || listPrevElement.tagName === "OL")) {
                    html = listPrevElement.outerHTML + html;
                    listPrevElement.remove();
                }
                if (listNextElement && (listNextElement.tagName === "UL" || listNextElement.tagName === "OL")) {
                    html = html + listNextElement.outerHTML;
                    listNextElement.remove();
                }
                // Firefox list Enter does not create new list item https://github.com/Vanessa219/aura/issues/194
                html = html.replace("<div><wbr><br></div>", "<li><p><wbr><br></p></li>");
            }

            // Keep link-ref defs and footnotes in place (Typora-style): do not scoop
            // them into Spin or move them to the document end.
        } else {
            html = blockElement.innerHTML;
        }

        // Merge multiple em, strong, s to satisfy CommonMark when same elements are adjacent
        html = html.replace(/<\/(strong|b)><strong data-marker="\W{2}">/g, "")
            .replace(/<\/(em|i)><em data-marker="\W{1}">/g, "")
            .replace(/<\/(s|strike)><s data-marker="~{1,2}">/g, "");

        if (html === '<p data-block="0">```<wbr></p>' && aura.hint.recentLanguage) {
            html = '<p data-block="0">```<wbr></p>'.replace("```", "```" + aura.hint.recentLanguage);
        }

        html = aura.markdown.spinAuraDom(html);

        if (isWYSIWYGElement) {
            blockElement.innerHTML = html;
        } else {
            blockElement.outerHTML = html;

            if (footnoteElement) {
                // Update tip in body
                const footnoteItemElement = hasTopClosestByTag(aura.wysiwyg.element.querySelector("wbr")!, "LI");
                if (footnoteItemElement) {
                    const footnoteRefElement = aura.wysiwyg.element.querySelector(`sup[data-type="footnotes-ref"][data-footnotes-label="${footnoteItemElement.getAttribute("data-marker")!}"]`)!;
                    if (footnoteRefElement) {
                        footnoteRefElement.setAttribute("aria-label",
                            footnoteItemElement.textContent!.trim().substr(0, 24));
                    }
                }
            }
        }

        // Set cursor
        setRangeByWbr(aura.wysiwyg.element, range);

        aura.wysiwyg.element.querySelectorAll(CODE_RENDER_SELECTOR)
            .forEach((item: Element) => {
                processCodeRender(item as HTMLElement, aura);
            });
    }
    flagRender(aura.wysiwyg.element);
    renderToc(aura);
    afterRenderEvent(aura, {
        enableAddUndoStack: true,
        enableHint: true,
    });
};
