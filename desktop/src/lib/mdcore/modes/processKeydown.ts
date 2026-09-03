import {Constants} from "../util/constants";
import {isCtrl, isFirefox} from "../util/compatibility";
import {scrollCenter} from "./editorCommonEvent";
import {
    fixBlockquote, fixCJKPosition,
    fixCodeBlock, fixCursorDownInlineMath, fixDelete, fixFirefoxArrowUpTable, fixGSKeyBackspace, fixHR,
    fixList,
    fixMarkdown,
    fixTab,
    fixTable,
    fixTask, insertAfterBlock, insertBeforeBlock,
} from "./fixBrowserBehavior";
import {
    hasClosestBlock,
    hasClosestByClassName,
    hasClosestByMatchTag,
    hasTopClosestByTag,
} from "../util/hasClosest";
import {hasClosestByHeadings} from "../util/hasClosestByHeadings";
import {matchHotKey} from "../util/hotKey";
import {getEditorRange, getSelectPosition, setSelectionFocus} from "../util/selection";
import {keydownToc} from "./toc";
import {afterRenderEvent} from "./afterRenderEvent";
import {nextIsCode} from "./inlineTag";
import {removeHeading, setHeading} from "./setHeading";
import {showCode} from "./showCode";

export const processKeydown = (aura: IAura, event: KeyboardEvent) => {
    // Chrome/Firefox compositionend timing differs https://github.com/Vanessa219/aura/issues/188
    aura.wysiwyg.composingLock = event.isComposing;
    if (event.isComposing) {
        return false;
    }

    // Record cursor on first undo entry
    if (event.key.indexOf("Arrow") === -1 && event.key !== "Meta" && event.key !== "Control" && event.key !== "Alt" &&
        event.key !== "Shift" && event.key !== "CapsLock" && event.key !== "Escape" && !/^F\d{1,2}$/.test(event.key)) {
        aura.undo.recordFirstPosition(aura, event);
    }

    const range = getEditorRange(aura);
    const startContainer = range.startContainer;

    if (!fixGSKeyBackspace(event, aura, startContainer)) {
        return false;
    }

    fixCJKPosition(range, aura, event);

    fixHR(range);

    // Handle only the following shortcut operations
    if (event.key !== "Enter" && event.key !== "Tab" && event.key !== "Backspace" && event.key.indexOf("Arrow") === -1
        && !isCtrl(event) && event.key !== "Escape" && event.key !== "Delete") {
        return false;
    }

    const blockElement = hasClosestBlock(startContainer);
    const pElement = hasClosestByMatchTag(startContainer, "P");

    // Markdown handling
    if (fixMarkdown(event, aura, pElement, range)) {
        return true;
    }

    // li
    if (fixList(range, aura, pElement, event)) {
        return true;
    }

    // table
    if (fixTable(aura, event, range)) {
        return true;
    }

    // code render
    const codeRenderElement = hasClosestByClassName(startContainer, "aura-wysiwyg__block");
    if (codeRenderElement) {
        // esc: exit edit, show render only
        if (event.key === "Escape" && codeRenderElement.children.length === 2) {
            (codeRenderElement.firstElementChild! as HTMLElement).style.display = "none";
            aura.wysiwyg.element.blur();
            event.preventDefault();
            return true;
        }

        if (codeRenderElement.getAttribute("data-block")! === "0") {
            if (fixCodeBlock(aura, event, codeRenderElement.firstElementChild! as HTMLElement, range)) {
                return true;
            }
            if (insertAfterBlock(aura, event, range, codeRenderElement.firstElementChild! as HTMLElement,
                codeRenderElement)) {
                return true;
            }

            if (codeRenderElement.getAttribute("data-type")! !== "yaml-front-matter" &&
                insertBeforeBlock(aura, event, range, codeRenderElement.firstElementChild! as HTMLElement,
                    codeRenderElement)) {
                return true;
            }
        }
    }

    // blockquote
    if (fixBlockquote(aura, range, event, pElement)) {
        return true;
    }

    // Top-level blockquote
    const topBQElement = hasTopClosestByTag(startContainer, "BLOCKQUOTE");
    if (topBQElement) {
        if (!event.shiftKey && event.altKey && event.key === "Enter") {
            if (!isCtrl(event)) {
                // alt+enter: exit nested blockquote outward https://github.com/Vanessa219/aura/issues/51
                range.setStartAfter(topBQElement);
            } else {
                // ctrl+alt+enter: exit nested blockquote inward
                range.setStartBefore(topBQElement);
            }
            setSelectionFocus(range);
            const node = document.createElement("p");
            node.setAttribute("data-block", "0");
            node.innerHTML = "\n";
            range.insertNode(node);
            range.collapse(true);
            setSelectionFocus(range);
            afterRenderEvent(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }
    }

    // h1-h6
    const headingElement = hasClosestByHeadings(startContainer);
    if (headingElement) {
        if (headingElement.tagName === "H6" && startContainer.textContent!.length === range.startOffset &&
            !isCtrl(event) && !event.shiftKey && !event.altKey && event.key === "Enter") {
            // enter: H6 newline parse issue https://github.com/Vanessa219/aura/issues/48
            const pTempElement = document.createElement("p");
            pTempElement.textContent! = "\n";
            pTempElement.setAttribute("data-block", "0");
            startContainer.parentElement!.insertAdjacentElement("afterend", pTempElement);
            range.setStart(pTempElement, 0);
            setSelectionFocus(range);
            afterRenderEvent(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }

        // enter++: increase heading level
        if (matchHotKey("⌘=", event)) {
            const index = parseInt((headingElement as HTMLElement).tagName.substr(1), 10) - 1;
            if (index > 0) {
                setHeading(aura, `h${index}`);
                afterRenderEvent(aura);
            }
            event.preventDefault();
            return true;
        }

        // enter++: decrease heading level
        if (matchHotKey("⌘-", event)) {
            const index = parseInt((headingElement as HTMLElement).tagName.substr(1), 10) + 1;
            if (index < 7) {
                setHeading(aura, `h${index}`);
                afterRenderEvent(aura);
            }
            event.preventDefault();
            return true;
        }

        if (event.key === "Backspace" && !isCtrl(event) && !event.shiftKey && !event.altKey
            && headingElement.textContent!.length === 1) {
            // Empty after delete
            removeHeading(aura);
        }
    }

    // task list
    if (fixTask(aura, range, event)) {
        return true;
    }

    if (fixTab(aura, range, event)) {
        return true;
    }

    // shift+enter: soft newline; table/hr/heading, cell, block render handled above; li & p use browser default
    if (!isCtrl(event) && event.shiftKey && !event.altKey && event.key === "Enter" &&
        startContainer.parentElement!.tagName !== "LI" && startContainer.parentElement!.tagName !== "P") {
        if (["STRONG", "STRIKE", "S", "I", "EM", "B"].includes(startContainer.parentElement!.tagName)) {
            // Continue inline soft newline https://github.com/Vanessa219/aura/issues/170
            range.insertNode(document.createTextNode("\n" + Constants.ZWSP));
        } else {
            range.insertNode(document.createTextNode("\n"));
        }
        range.collapse(false);
        setSelectionFocus(range);
        afterRenderEvent(aura);
        scrollCenter(aura);
        event.preventDefault();
        return true;
    }

    // Delete
    if (event.key === "Backspace" && !isCtrl(event) && !event.shiftKey && !event.altKey && range.toString() === "") {
        if (fixDelete(aura, range, event, pElement)) {
            return true;
        }
        if (blockElement) {
            if (blockElement.previousElementSibling!
                && blockElement.previousElementSibling!.classList.contains("aura-wysiwyg__block")
                && blockElement.previousElementSibling!.getAttribute("data-block")! === "0"
                // https://github.com/Vanessa219/aura/issues/946
                && blockElement.tagName !== "UL" && blockElement.tagName !== "OL"
            ) {
                const rangeStart = getSelectPosition(blockElement, aura.wysiwyg.element, range).start;
                if ((rangeStart === 0 && range.startOffset === 0) || // https://github.com/Vanessa219/aura/issues/894
                    (rangeStart === 1 && blockElement.innerText.startsWith(Constants.ZWSP))) {
                    // After delete cursor on code render block; prevent event, cannot merge with keyup code block handling
                    const previousBlock =
                        blockElement.previousElementSibling as HTMLElement;
                    const preview = previousBlock.querySelector(
                        ".aura-wysiwyg__preview",
                    ) as HTMLElement | null;
                    if (preview) {
                        showCode(preview, aura, false);
                    } else {
                        const code = previousBlock.querySelector("pre > code");
                        if (code) {
                            range.selectNodeContents(code);
                            range.collapse(false);
                            setSelectionFocus(range);
                        }
                    }
                    if (blockElement.innerHTML.trim().replace(Constants.ZWSP, "") === "") {
                        // Delete when current block empty and not last
                        blockElement.remove();
                        afterRenderEvent(aura);
                    }
                    event.preventDefault();
                    return true;
                }
            }

            const rangeStartOffset = range.startOffset;
            if (range.toString() === "" && startContainer.nodeType === 3 &&
                startContainer.textContent!.charAt(rangeStartOffset - 2) === "\n" &&
                startContainer.textContent!.charAt(rangeStartOffset - 1) !== Constants.ZWSP
                && ["STRONG", "STRIKE", "S", "I", "EM", "B"].includes(startContainer.parentElement!.tagName)) {
                // Keep inline soft newline behavior consistent
                startContainer.textContent! = startContainer.textContent!.substring(0, rangeStartOffset - 1) +
                    Constants.ZWSP;
                range.setStart(startContainer, rangeStartOffset);
                range.collapse(true);
                afterRenderEvent(aura);
                event.preventDefault();
                return true;
            }

            // Delete after zero-width char before inline code, math, html
            if (startContainer.textContent! === Constants.ZWSP && range.startOffset === 1
                && !startContainer.previousSibling! && nextIsCode(range)) {
                startContainer.textContent! = "";
                // Cannot return; when preceded by code render block: fix delete before inline math/html deleting code content
            }

            // Fix delete before inline math/html/entity deleting code content; cannot return, need further handling
            blockElement.querySelectorAll("span.aura-wysiwyg__block[data-type='math-inline']").forEach((item) => {
                (item.firstElementChild! as HTMLElement).style.display = "inline";
                (item.lastElementChild! as HTMLElement).style.display = "none";
            });
            blockElement.querySelectorAll("span.aura-wysiwyg__block[data-type='html-entity']").forEach((item) => {
                (item.firstElementChild! as HTMLElement).style.display = "inline";
                (item.lastElementChild! as HTMLElement).style.display = "none";
            });
        }
    }

    if (isFirefox() && range.startOffset === 1 && startContainer.textContent!.indexOf(Constants.ZWSP) > -1 &&
        startContainer.previousSibling! && startContainer.previousSibling!.nodeType !== 3 &&
        (startContainer.previousSibling! as HTMLElement).tagName === "CODE" &&
        (event.key === "Backspace" || event.key === "ArrowLeft")) {
        // https://github.com/Vanessa219/aura/issues/410
        range.selectNodeContents(startContainer.previousSibling!);
        range.collapse(false);
        event.preventDefault();
        return true;
    }

    if (fixFirefoxArrowUpTable(event, blockElement, range)) {
        event.preventDefault();
        return true;
    }

    fixCursorDownInlineMath(range, event.key);

    if (event.key === "ArrowDown") {
        // No effect when cursor before inline math
        const nextElement = startContainer.nextSibling! as HTMLElement;
        if (nextElement && nextElement.nodeType !== 3 && nextElement.getAttribute("data-type")! === "math-inline") {
            range.setStartAfter(nextElement);
        }
    }

    if (blockElement && keydownToc(blockElement, aura, event, range)) {
        event.preventDefault();
        return true;
    }

    return false;
};
