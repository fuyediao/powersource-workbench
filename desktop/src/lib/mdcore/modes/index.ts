import {Constants} from "../util/constants";
import { editorUi } from '@/utils/aura/editor-ui';
import {isCtrl, isFirefox} from "../util/compatibility";
import {
    blurEvent,
    copyEvent, cutEvent, dblclickEvent,
    dropEvent,
    focusEvent,
    hotkeyEvent,
    scrollCenter,
    selectEvent,
} from "./editorCommonEvent";
import {isHeadingMD, isHrMD, paste} from "./fixBrowserBehavior";
import {
    hasClosestBlock, hasClosestByAttribute,
    hasClosestByClassName, hasClosestByMatchTag,
} from "../util/hasClosest";
import {hasClosestByHeadings} from "../util/hasClosestByHeadings";
import {
    getEditorRange,
    getSelectPosition,
    setRangeByWbr, setSelectionFocus,
} from "../util/selection"
import {clickToc, renderToc} from "./toc";
import {afterRenderEvent} from "./afterRenderEvent";
import {highlightToolbar} from "./highlightToolbar";
import {getRenderElementNextNode, modifyPre} from "./inlineTag";
import {input} from "./input";
import {showCode} from "./showCode";
import {unwrapFlagImages} from "../render/flagRender";
import {matchCodeFenceShortcut} from "../util/block-markdown-shortcut";

class WYSIWYG {
    public range!: Range;
    public element: HTMLPreElement;
    public afterRenderTimeoutId!: number;
    public hlToolbarTimeoutId!: number;
    public preventInput!: boolean;
    public composingLock = false;
    private scrollListener!: () => void;

    constructor(aura: IAura) {
        const divElement = document.createElement("div");
        divElement.className = "aura-wysiwyg";

        divElement.innerHTML = `<pre class="aura-reset" placeholder="${aura.options.placeholder}"
 contenteditable="true" spellcheck="false"></pre>`;

        this.element = divElement.firstElementChild! as HTMLPreElement;

        this.bindEvent(aura);

        focusEvent(aura, this.element);
        dblclickEvent(aura, this.element);
        blurEvent(aura, this.element);
        hotkeyEvent(aura, this.element);
        selectEvent(aura, this.element);
        dropEvent(aura, this.element);
        copyEvent(aura, this.element, this.copy);
        cutEvent(aura, this.element, this.copy);
    }

    public unbindListener() {
        window.removeEventListener("scroll", this.scrollListener);
    }

    private copy(event: ClipboardEvent, aura: IAura) {
        const range = getSelection()!.getRangeAt(0);
        if (range.toString() === "") {
            return;
        }
        event.stopPropagation();
        event.preventDefault();

        const codeElement = hasClosestByMatchTag(range.startContainer, "CODE");
        const codeEndElement = hasClosestByMatchTag(range.endContainer, "CODE");
        if (codeElement && codeEndElement && codeEndElement.isSameNode(codeElement)) {
            let codeText = "";
            if (codeElement.parentElement!.tagName === "PRE") {
                codeText = range.toString();
            } else {
                codeText = "`" + range.toString() + "`";
            }
            event.clipboardData!.setData("text/plain", codeText);
            event.clipboardData!.setData("text/html", "");
            return;
        }

        const aElement = hasClosestByMatchTag(range.startContainer, "A");
        const aEndElement = hasClosestByMatchTag(range.endContainer, "A");
        if (aElement && aEndElement && aEndElement.isSameNode(aElement)) {
            let aTitle = aElement.getAttribute("title")! || "";
            if (aTitle) {
                aTitle = ` "${aTitle}"`;
            }
            event.clipboardData!.setData("text/plain",
                `[${range.toString()}](${aElement.getAttribute("href")!}${aTitle})`);
            event.clipboardData!.setData("text/html", "");
            return;
        }

        const tempElement = document.createElement("div");
        tempElement.appendChild(range.cloneContents());
        // Flags must copy as Unicode emoji, not ![CN](/flags/cn.svg).
        unwrapFlagImages(tempElement);

        event.clipboardData!.setData("text/plain", aura.markdown.auraDomToMarkdown(tempElement.innerHTML).trim());
        event.clipboardData!.setData("text/html", "");
    }

    private bindEvent(aura: IAura) {
        this.unbindListener();
        window.addEventListener("scroll", this.scrollListener = () => {
            editorUi.hideHint();
        });

        this.element.addEventListener("scroll", () => {
            editorUi.hideHint();
        });

        this.element.addEventListener("paste", (event) => {
            paste(aura, event as ClipboardEvent & { target: HTMLElement }, {
                pasteCode: (code: string) => {
                    const range = getEditorRange(aura);
                    const node = document.createElement("template");
                    node.innerHTML = code;
                    range.insertNode(node.content.cloneNode(true));
                    const blockElement = hasClosestByAttribute(range.startContainer, "data-block", "0");
                    if (blockElement) {
                        blockElement.outerHTML = aura.markdown.spinAuraDom(blockElement.outerHTML);
                    } else {
                        aura.wysiwyg.element.innerHTML = aura.markdown.spinAuraDom(aura.wysiwyg.element.innerHTML);
                    }
                    setRangeByWbr(aura.wysiwyg.element, range);
                },
            });
        });

        // CJK input handling
        this.element.addEventListener("compositionstart", () => {
            this.composingLock = true;
        });

        this.element.addEventListener("compositionend", (event) => {
            const headingElement = hasClosestByHeadings(getSelection()!.getRangeAt(0).startContainer);
            this.composingLock = false;
            if (headingElement && headingElement.textContent! === "") {
                // Delete empty heading https://github.com/Vanessa219/aura/issues/150
                renderToc(aura);
                afterRenderEvent(aura);
                return;
            }
            if (!isFirefox()) {
                input(aura, getSelection()!.getRangeAt(0).cloneRange(), event as unknown as InputEvent);
            } else {
                afterRenderEvent(aura);
            }
        });

        this.element.addEventListener("input", (event: InputEvent) => {
            if (event.inputType === "deleteByDrag" || event.inputType === "insertFromDrop") {
                // https://github.com/Vanessa219/aura/issues/801 Editor content drag-and-drop issue
                return;
            }
            if (this.preventInput) {
                this.preventInput = false;
                afterRenderEvent(aura);
                return;
            }
            if (this.composingLock || event.data === "‘" || event.data === "“" || event.data === "《") {
                afterRenderEvent(aura);
                return;
            }
            const range = getSelection()!.getRangeAt(0);
            let blockElement = hasClosestBlock(range.startContainer);
            if (!blockElement) {
                // Not wrapped in a block element
                modifyPre(aura, range);
                blockElement = hasClosestBlock(range.startContainer);
            }
            if (!blockElement) {
                return;
            }

            // Leading/trailing space handling
            const startOffset = getSelectPosition(blockElement, aura.wysiwyg.element, range).start;

            // Allow leading spaces
            let startSpace = true;
            for (let i = startOffset - 1; i > blockElement.textContent!.substr(0, startOffset).lastIndexOf("\n"); i--) {
                if (blockElement.textContent!.charAt(i) !== " " &&
                    // Multiple tabs before delete must not form code block https://github.com/Vanessa219/aura/issues/162 1
                    blockElement.textContent!.charAt(i) !== "\t") {
                    startSpace = false;
                    break;
                }
            }
            if (startOffset === 0) {
                startSpace = false;
            }

            // Allow trailing spaces
            let endSpace = true;
            for (let i = startOffset - 1; i < blockElement.textContent!.length; i++) {
                if (blockElement.textContent!.charAt(i) !== " " && blockElement.textContent!.charAt(i) !== "\n") {
                    endSpace = false;
                    break;
                }
            }

            // https://github.com/Vanessa219/aura/issues/729
            if (endSpace && /^#{1,6} $/.test(blockElement.textContent!)) {
                endSpace = false;
            }

            const headingElement = hasClosestByHeadings(getSelection()!.getRangeAt(0).startContainer);
            if (headingElement && headingElement.textContent! === "") {
                // Delete empty heading https://github.com/Vanessa219/aura/issues/150
                renderToc(aura);
                headingElement.remove();
            }

            if ((startSpace && blockElement.getAttribute("data-type")! !== "code-block")
                || endSpace || isHeadingMD(blockElement.innerHTML) ||
                matchCodeFenceShortcut(blockElement.textContent ?? "") ||
                (isHrMD(blockElement.innerHTML) && blockElement.previousElementSibling!)) {
                return;
            }
            // https://github.com/Vanessa219/aura/issues/1565
            if (event.inputType === "insertParagraph" && this.element.innerHTML === '<p><br></p><p><br></p>') {
                blockElement.previousElementSibling!.remove();
            }

            input(aura, range, event);
        });

        this.element.addEventListener("click", (rawEvent) => {
            const event = rawEvent as unknown as MouseEvent & { target: HTMLElement };
            if (event.target.tagName === "INPUT") {
                const checkElement = event.target as HTMLInputElement;
                if (checkElement.checked) {
                    checkElement.setAttribute("checked", "checked");
                } else {
                    checkElement.removeAttribute("checked");
                }
                this.preventInput = true;
                if (getSelection()!.rangeCount > 0) {
                    setSelectionFocus(getSelection()!.getRangeAt(0));
                }
                afterRenderEvent(aura);
                return;
            }

            // Discord-style spoiler: click to reveal / hide.
            const spoiler = hasClosestByAttribute(event.target, "data-type", "spoiler");
            if (spoiler) {
                const open = spoiler.getAttribute("data-open") === "true";
                if (open) {
                    spoiler.removeAttribute("data-open");
                } else {
                    spoiler.setAttribute("data-open", "true");
                }
                event.preventDefault();
                return;
            }

            // Open link
            const a = hasClosestByMatchTag(event.target, "A");
            if (a) {
                if (aura.options.link.click) {
                    aura.options.link.click(a);
                } else if (aura.options.link.isOpen) {
                    window.open(a.getAttribute("href")!);
                }
                event.preventDefault();
                return;
            }

            const range = getEditorRange(aura);
            if (event.target.isEqualNode(this.element) && this.element.lastElementChild! && range.collapsed) {
                const lastRect = this.element.lastElementChild!.getBoundingClientRect();
                if (event.y > lastRect.top + lastRect.height) {
                    if (this.element.lastElementChild!.tagName === "P" &&
                        this.element.lastElementChild!.textContent!.trim().replace(Constants.ZWSP, "") === "") {
                        range.selectNodeContents(this.element.lastElementChild!);
                        range.collapse(false);
                    } else {
                        this.element.insertAdjacentHTML("beforeend",
                            `<p data-block="0">${Constants.ZWSP}<wbr></p>`);
                        setRangeByWbr(this.element, range);
                    }
                }
            }

            highlightToolbar(aura);

            // After click cursor in preview; expand code block
            let previewElement = hasClosestByClassName(event.target, "aura-wysiwyg__preview");
            if (!previewElement) {
                previewElement =
                    hasClosestByClassName(getEditorRange(aura).startContainer, "aura-wysiwyg__preview");
            }
            if (previewElement) {
                showCode(previewElement, aura);
            }

            clickToc(event, aura);
        });

        this.element.addEventListener("keyup", (rawEvent) => {
            const event = rawEvent as KeyboardEvent & { target: HTMLElement };
            if (event.isComposing || isCtrl(event)) {
                return;
            }
            // Except md handling, cell newline, table add row/column, code language switch, block render newline, blockquote exit/layer exit, h6 newline,
            // task list newline, soft newline — adjust document position on other newlines
            if (event.key === "Enter") {
                scrollCenter(aura);
            }
            if ((event.key === "Backspace" || event.key === "Delete") &&
                aura.wysiwyg.element.innerHTML !== "" && aura.wysiwyg.element.childNodes.length === 1 &&
                aura.wysiwyg.element.firstElementChild! && aura.wysiwyg.element.firstElementChild!.tagName === "P"
                && aura.wysiwyg.element.firstElementChild!.childElementCount === 0
                && (aura.wysiwyg.element.textContent! === "" || aura.wysiwyg.element.textContent! === "\n")) {
                // Show placeholder when empty
                aura.wysiwyg.element.innerHTML = "";
            }
            const range = getEditorRange(aura);
            if (event.key === "Backspace") {
                // firefox headings https://github.com/Vanessa219/aura/issues/211
                if (isFirefox() && range.startContainer.textContent! === "\n" && range.startOffset === 1) {
                    range.startContainer.textContent! = "";
                }
            }

            // Not wrapped in a block element
            modifyPre(aura, range);

            highlightToolbar(aura);

            if (event.key !== "ArrowDown" && event.key !== "ArrowRight" && event.key !== "Backspace"
                && event.key !== "ArrowLeft" && event.key !== "ArrowUp") {
                return;
            }

            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                aura.hint.render(aura);
            }

            // Arrow keys and delete when hitting block preview
            let previewElement = hasClosestByClassName(range.startContainer, "aura-wysiwyg__preview");
            if (!previewElement && range.startContainer.nodeType !== 3 && range.startOffset > 0) {
                // Delete before table hits code block
                const blockRenderElement = range.startContainer as HTMLElement;
                if (blockRenderElement.classList.contains("aura-wysiwyg__block")) {
                    const candidate =
                        blockRenderElement.lastElementChild as HTMLElement | null;
                    if (candidate?.classList.contains("aura-wysiwyg__preview")) {
                        previewElement = candidate;
                    }
                }
            }
            if (!previewElement) {
                return;
            }
            const previousElement =
                previewElement.previousElementSibling as HTMLElement | null;
            if (!previousElement) {
                return;
            }
            if (previousElement.style.display === "none") {
                if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                    showCode(previewElement, aura);
                } else {
                    showCode(previewElement, aura, false);
                }
                return;
            }

            let codeElement = previewElement.previousElementSibling! as HTMLElement;
            if (codeElement.tagName === "PRE") {
                codeElement = codeElement.firstElementChild! as HTMLElement;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
                const blockRenderElement = previewElement.parentElement!;
                let nextNode = getRenderElementNextNode(blockRenderElement) as HTMLElement;
                if (nextNode && nextNode.nodeType !== 3) {
                    // Next node is still code render block
                    const nextRenderElement = nextNode.querySelector(".aura-wysiwyg__preview")! as HTMLElement;
                    if (nextRenderElement) {
                        showCode(nextRenderElement, aura);
                        return;
                    }
                }
                // Skip render block; move cursor to next node
                if (nextNode.nodeType === 3) {
                    // inline
                    while (nextNode.textContent!.length === 0 && nextNode.nextSibling!) {
                        // https://github.com/Vanessa219/aura/issues/100 2
                        nextNode = nextNode.nextSibling! as HTMLElement;
                    }
                    range.setStart(nextNode, 1);
                } else {
                    // block
                    range.setStart(nextNode.firstChild!, 0);
                }
            } else {
                range.selectNodeContents(codeElement);
                range.collapse(false);
            }
        });
    }
}

export {WYSIWYG};
