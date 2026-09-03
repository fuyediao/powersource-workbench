import {Constants} from "../util/constants";
import {addScript} from "../util/addScript";
import {addStyle} from "../util/addStyle";
import {isRenderedCodeLanguage} from "@/lib/mdtohtml/rendered-code-languages";

type SelectionOffsets = {
    start: number;
    end: number;
};

/**
 * Capture the active selection as text offsets within an editable code node.
 *
 * @param code - Code node about to have its highlighted HTML replaced.
 * @returns Selection offsets, or null when the selection is outside the node.
 */
const captureSelectionOffsets = (code: Element): SelectionOffsets | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    if (
        !code.contains(range.startContainer) ||
        !code.contains(range.endContainer)
    ) {
        return null;
    }
    const startRange = range.cloneRange();
    startRange.selectNodeContents(code);
    startRange.setEnd(range.startContainer, range.startOffset);
    const endRange = range.cloneRange();
    endRange.selectNodeContents(code);
    endRange.setEnd(range.endContainer, range.endOffset);
    return {
        start: startRange.toString().length,
        end: endRange.toString().length,
    };
};

/**
 * Resolve a text offset to a DOM text node and local offset.
 *
 * @param root - Root whose text nodes should be traversed.
 * @param target - Plain-text offset.
 * @returns DOM point for a Range endpoint.
 */
const resolveTextPoint = (
    root: Element,
    target: number,
): {node: Node; offset: number} => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = target;
    let node = walker.nextNode();
    while (node) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) {
            return {node, offset: remaining};
        }
        remaining -= length;
        node = walker.nextNode();
    }
    return {node: root, offset: root.childNodes.length};
};

/**
 * Restore a text-offset selection after highlight.js rebuilt token spans.
 *
 * @param code - Re-highlighted code node.
 * @param offsets - Previously captured text offsets.
 */
const restoreSelectionOffsets = (
    code: Element,
    offsets: SelectionOffsets | null,
): void => {
    if (!offsets) {
        return;
    }
    const start = resolveTextPoint(code, offsets.start);
    const end = resolveTextPoint(code, offsets.end);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
};

/**
 * Highlight fenced code with the npm-preloaded highlight.js global.
 *
 * @param hljsOption - Highlight options (style must be a bundled theme id).
 * @param element - Root to search for `pre > code`.
 */
export const highlightRender = (hljsOption?: IHljs, element: HTMLElement | Document = document) => {
    let style = hljsOption!.style!;
    if (!Constants.CODE_THEME.includes(style)) {
        style = "github";
    }
    const auraHljsStyle = document.getElementById("auraHljsStyle") as HTMLLinkElement;
    const urls = (window as Window & {
        __AURA_HLJS_STYLE_URLS__?: Record<string, string>;
    }).__AURA_HLJS_STYLE_URLS__;
    const href = urls?.[style] || urls?.github || "";
    if (auraHljsStyle && href && auraHljsStyle.getAttribute("href") !== href) {
        auraHljsStyle.remove();
    }
    addStyle(style, "auraHljsStyle");

    if (hljsOption!.enable === false) {
        return;
    }

    const codes = element.querySelectorAll("pre > code");
    if (codes.length === 0) {
        return;
    }

    addScript("auraHljsScript").then(() => {
        addScript("auraHljsThirdScript").then(() => {
            element.querySelectorAll("pre > code").forEach((block) => {
                if (!block.isConnected) {
                    return;
                }
                // Hidden source panes remain plain text; their visible sibling
                // owns the derived renderer output.
                if (block.parentElement!.classList.contains("aura-wysiwyg__pre")) {
                    return;
                }

                const languageClass = Array.from(block.classList)
                    .find((name) => name.startsWith("language-"));
                const fencedLanguage =
                    languageClass?.slice("language-".length) ?? "";
                const isEditableCode = block.parentElement!.classList
                    .contains("aura-wysiwyg__code");
                if (
                    isRenderedCodeLanguage(fencedLanguage) &&
                    !isEditableCode
                ) {
                    return;
                }

                let language = fencedLanguage;
                if (hljsOption!.defaultLang && block.className.indexOf("language-") === -1) {
                    language = hljsOption!.defaultLang;
                    if (!isEditableCode) {
                        block.classList.add("language-" + language);
                    }
                }

                if (!window.hljs.getLanguage(language)) {
                    language = "plaintext";
                }
                const selectionOffsets = captureSelectionOffsets(block);
                block.innerHTML = window.hljs.highlight(
                    block.textContent!,
                    {
                        language,
                        ignoreIllegals: true
                    }).value;

                block.classList.add("hljs");
                restoreSelectionOffsets(block, selectionOffsets);
                if (isEditableCode) {
                    return;
                }
                if (!hljsOption!.lineNumber) {
                    return;
                }

                block.classList.add("aura-linenumber");
                let linenNumberTemp: HTMLDivElement = block.querySelector(".aura-linenumber__temp")!;
                if (!linenNumberTemp) {
                    linenNumberTemp = document.createElement("div");
                    linenNumberTemp.className = "aura-linenumber__temp";
                    block.insertAdjacentElement("beforeend", linenNumberTemp);
                }
                const whiteSpace = getComputedStyle(block).whiteSpace;
                let isSoftWrap = false;
                if (whiteSpace === "pre-wrap" || whiteSpace === "pre-line") {
                    isSoftWrap = true;
                }
                let lineNumberHTML = "";
                const lineList = block.textContent!.split(/\r\n|\r|\n/g);
                lineList.pop();
                lineList.map((line) => {
                    let lineHeight = "";
                    if (isSoftWrap) {
                        linenNumberTemp.textContent! = line || "\n";
                        lineHeight = ` style="height:${linenNumberTemp.getBoundingClientRect().height}px"`;
                    }
                    lineNumberHTML += `<span${lineHeight}></span>`;
                });

                linenNumberTemp.style.display = "none";
                lineNumberHTML = `<span class="aura-linenumber__rows">${lineNumberHTML}</span>`;
                block.insertAdjacentHTML("beforeend", lineNumberHTML);
            })
        })
    });
};
