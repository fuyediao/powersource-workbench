import {Constants} from "../util/constants";
import {afterRenderEvent} from "./afterRenderEvent";
import {input} from "./input";
import {isCtrl, isFirefox} from "../util/compatibility";
import {scrollCenter} from "./editorCommonEvent";
import {
    getTopList,
    hasClosestBlock,
    hasClosestByAttribute,
    hasClosestByClassName,
    hasClosestByMatchTag,
} from "../util/hasClosest";
import {getLastNode} from "../util/hasClosest";
import {highlightToolbar} from "./highlightToolbar";
import {matchHotKey} from "../util/hotKey";
import {
    CODE_RENDER_SELECTOR,
    processCodeRender,
    processPasteCode,
} from "../render/processCode";
import {flagRender, unwrapFlagImages} from "../render/flagRender";
import {
    getEditorRange,
    getSelectPosition,
    insertHTML,
    setRangeByWbr,
    setSelectionByPosition, setSelectionFocus,
} from "../util/selection";
import {renderToc} from "./toc";
import {sanitizeHtml} from "@/lib/mdtohtml";
import {normalizeClipboardHtml} from "../util/clipboard-html";
import {
    matchCodeFenceShortcut,
    matchCompletedHeadingShortcut,
} from "../util/block-markdown-shortcut";

// https://github.com/Vanessa219/aura/issues/508 Soft keyboard cannot delete empty block
export const fixGSKeyBackspace = (event: KeyboardEvent, aura: IAura, startContainer: Node) => {
    if (event.keyCode === 229 && event.code === "" && event.key === "Unidentified") {
        const blockElement = hasClosestBlock(startContainer);
        // Mobile punctuation shows as 299; limit empty-delete conditions
        if (blockElement && blockElement.textContent!.trim() === "") {
            aura[aura.currentMode].composingLock = true;
            return false;
        }
    }
    return true;
};

// https://github.com/Vanessa219/aura/issues/361 Input Chinese after code block
export const fixCJKPosition = (range: Range, aura: IAura, event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === "Tab" || event.key === "Backspace" || event.key.indexOf("Arrow") > -1
        || isCtrl(event) || event.key === "Escape" || event.shiftKey || event.altKey) {
        return;
    }
    const pLiElement = hasClosestByMatchTag(range.startContainer, "P") ||
        hasClosestByMatchTag(range.startContainer, "LI");
    if (pLiElement && getSelectPosition(pLiElement, aura[aura.currentMode].element, range).start === 0) {

        // https://github.com/Vanessa219/aura/issues/1289 WKWebView IME switch creates six-per-em space, misaligning cursor
        if (pLiElement.nodeValue) {
            pLiElement.nodeValue = pLiElement.nodeValue.replace(/\u2006/g, "");
        }

        const zwspNode = document.createTextNode(Constants.ZWSP);
        range.insertNode(zwspNode);
        range.setStartAfter(zwspNode);
    }
};

// https://github.com/Vanessa219/aura/issues/381 Cursor cannot move down inside inline math
export const fixCursorDownInlineMath = (range: Range, key: string) => {
    if (key === "ArrowDown" || key === "ArrowUp") {
        const inlineElement = hasClosestByAttribute(range.startContainer, "data-type", "math-inline") ||
            hasClosestByAttribute(range.startContainer, "data-type", "html-entity") ||
            hasClosestByAttribute(range.startContainer, "data-type", "html-inline");
        if (inlineElement) {
            if (key === "ArrowDown") {
                range.setStartAfter(inlineElement.parentElement!);
            }
            if (key === "ArrowUp") {
                range.setStartBefore(inlineElement.parentElement!);
            }
        }
    }
};

export const insertEmptyBlock = (aura: IAura, position: InsertPosition) => {
    const range = getEditorRange(aura);
    const blockElement = hasClosestBlock(range.startContainer);
    if (blockElement) {
        blockElement.insertAdjacentHTML(position, `<p data-block="0">${Constants.ZWSP}<wbr>\n</p>`);
        setRangeByWbr(aura[aura.currentMode].element, range);
        highlightToolbar(aura);
        execAfterRender(aura);
    }
};

export const isFirstCell = (cellElement: HTMLElement) => {
    const tableElement = hasClosestByMatchTag(cellElement, "TABLE") as HTMLTableElement;
    if (tableElement && tableElement.rows[0].cells[0].isSameNode(cellElement)) {
        return tableElement;
    }
    return false;
};

export const isLastCell = (cellElement: HTMLElement) => {
    const tableElement = hasClosestByMatchTag(cellElement, "TABLE") as HTMLTableElement;
    if (tableElement && tableElement.lastElementChild!.lastElementChild!.lastElementChild!.isSameNode(cellElement)) {
        return tableElement;
    }
    return false;
};

// Move cursor to previous table cell
const goPreviousCell = (cellElement: HTMLElement, range: Range, isSelected = true) => {
    let previousElement: Element | null = cellElement.previousElementSibling!;
    if (!previousElement) {
        if (cellElement.parentElement!.previousElementSibling!) {
            previousElement = cellElement.parentElement!.previousElementSibling!.lastElementChild!;
        } else if (cellElement.parentElement!.parentElement!.tagName === "TBODY" &&
            cellElement.parentElement!.parentElement!.previousElementSibling!) {
            previousElement = cellElement.parentElement!
                .parentElement!.previousElementSibling!.lastElementChild!.lastElementChild!;
        } else {
            previousElement = null;
        }
    }
    if (previousElement) {
        range.selectNodeContents(previousElement);
        if (!isSelected) {
            range.collapse(false);
        }
        setSelectionFocus(range);
    }
    return previousElement;
};

export const insertAfterBlock = (aura: IAura, event: KeyboardEvent, range: Range, element: HTMLElement,
                                 blockElement: HTMLElement) => {
    const position = getSelectPosition(element, aura[aura.currentMode].element, range);
    if ((event.key === "ArrowDown" && element.textContent!.trimRight().substr(position.start).indexOf("\n") === -1) ||
        (event.key === "ArrowRight" && position.start >= element.textContent!.trimRight().length)) {
        const nextElement = blockElement.nextElementSibling!;
        if (!nextElement ||
            (nextElement && (nextElement.tagName === "TABLE" || nextElement.getAttribute("data-type")!))) {
            blockElement.insertAdjacentHTML("afterend",
                `<p data-block="0">${Constants.ZWSP}<wbr></p>`);
            setRangeByWbr(aura[aura.currentMode].element, range);
        } else {
            range.selectNodeContents(nextElement);
            range.collapse(true);
            setSelectionFocus(range);
        }
        event.preventDefault();
        return true;
    }
    return false;
};

export const insertBeforeBlock = (aura: IAura, event: KeyboardEvent, range: Range, element: HTMLElement,
                                  blockElement: HTMLElement) => {
    const position = getSelectPosition(element, aura[aura.currentMode].element, range);
    if ((event.key === "ArrowUp" && element.textContent!.substr(0, position.start).indexOf("\n") === -1) ||
        ((event.key === "ArrowLeft" || (event.key === "Backspace" && range.toString() === "")) &&
            position.start === 0)) {
        const previousElement = blockElement.previousElementSibling!;
        // table || code
        if (!previousElement ||
            (previousElement && (previousElement.tagName === "TABLE" || previousElement.getAttribute("data-type")!))) {
            blockElement.insertAdjacentHTML("beforebegin",
                `<p data-block="0">${Constants.ZWSP}<wbr></p>`);
            setRangeByWbr(aura[aura.currentMode].element, range);
        } else {
            range.selectNodeContents(previousElement);
            range.collapse(false);
            setSelectionFocus(range);
        }
        event.preventDefault();
        return true;
    }
    return false;
};

export const listToggle = (aura: IAura, range: Range, type: string, cancel = true) => {
    const itemElement = hasClosestByMatchTag(range.startContainer, "LI");
    aura[aura.currentMode].element.querySelectorAll("wbr").forEach((wbr) => {
        wbr.remove();
    });
    range.insertNode(document.createElement("wbr"));

    if (cancel && itemElement) {
        // Cancel
        let pHTML = "";
        for (let i = 0; i < itemElement.parentElement!.childElementCount; i++) {
            const inputElement = itemElement.parentElement!.children[i].querySelector("input")!;
            if (inputElement) {
                inputElement.remove();
            }
            pHTML += `<p data-block="0">${itemElement.parentElement!.children[i].innerHTML.trimLeft()}</p>`;
        }
        itemElement.parentElement!.insertAdjacentHTML("beforebegin", pHTML);
        itemElement.parentElement!.remove();
    } else {
        if (!itemElement) {
            // Add
            let blockElement = hasClosestByAttribute(range.startContainer, "data-block", "0");
            if (!blockElement) {
                aura[aura.currentMode].element.querySelector("wbr")!.remove();
                blockElement = aura[aura.currentMode].element.querySelector("p")!;
                blockElement.innerHTML = "<wbr>";
            }
            if (type === "check") {
                blockElement.insertAdjacentHTML("beforebegin",
                    `<ul data-block="0"><li class="aura-task"><input type="checkbox" /> ${blockElement.innerHTML}</li></ul>`);
                blockElement.remove();
            } else if (type === "list") {
                blockElement.insertAdjacentHTML("beforebegin",
                    `<ul data-block="0"><li>${blockElement.innerHTML}</li></ul>`);
                blockElement.remove();
            } else if (type === "ordered-list") {
                blockElement.insertAdjacentHTML("beforebegin",
                    `<ol data-block="0"><li>${blockElement.innerHTML}</li></ol>`);
                blockElement.remove();
            }
        } else {
            // Toggle
            if (type === "check") {
                itemElement.parentElement!.querySelectorAll("li").forEach((item) => {
                    item.insertAdjacentHTML("afterbegin",
                        `<input type="checkbox" />${item.textContent!.indexOf(" ") === 0 ? "" : " "}`);
                    item.classList.add("aura-task");
                });
            } else {
                if (itemElement.querySelector("input")!) {
                    itemElement.parentElement!.querySelectorAll("li").forEach((item) => {
                        item.querySelector("input")!.remove();
                        item.classList.remove("aura-task");
                    });
                }
                let element;
                if (type === "list") {
                    element = document.createElement("ul");
                    element.setAttribute("data-marker", "*");
                } else {
                    element = document.createElement("ol");
                    element.setAttribute("data-marker", "1.");
                }
                element.setAttribute("data-block", "0");
                element.setAttribute("data-tight", itemElement.parentElement!.getAttribute("data-tight")!);
                element.innerHTML = itemElement.parentElement!.innerHTML;
                itemElement.parentElement!.parentNode!.replaceChild(element, itemElement.parentElement!);
            }
        }
    }
};

export const listIndent = (aura: IAura, liElement: HTMLElement, range: Range) => {
    const previousElement = liElement.previousElementSibling!;
    if (liElement && previousElement) {
        const liElements: HTMLElement[] = [liElement];
        Array.from(range.cloneContents().children).forEach((item, index) => {
            if (item.nodeType !== 3 && liElement && item.textContent!.trim() !== ""
                && liElement.getAttribute("data-node-id")! === item.getAttribute("data-node-id")!) {
                if (index !== 0) {
                    liElements.push(liElement);
                }
                liElement = liElement.nextElementSibling! as HTMLElement;
            }
        });

        aura[aura.currentMode].element.querySelectorAll("wbr").forEach((wbr) => {
            wbr.remove();
        });
        range.insertNode(document.createElement("wbr"));
        const liParentElement = previousElement.parentElement!;

        let liHTML = "";
        liElements.forEach((item: Element) => {
            let marker = item.getAttribute("data-marker")!;
            if (marker!.length !== 1) {
                marker! = `1${marker!.slice(-1)}`;
            }
            liHTML += `<li data-node-id="${item.getAttribute("data-node-id")!}" data-marker="${marker}">${item.innerHTML}</li>`;
            item.remove();
        });
        previousElement.insertAdjacentHTML("beforeend",
            `<${liParentElement!.tagName} data-block="0">${liHTML}</${liParentElement!.tagName}>`);

        liParentElement!.outerHTML = aura.markdown.spinAuraDom(liParentElement!.outerHTML);

        setRangeByWbr(aura[aura.currentMode].element, range);
        const tempTopListElement = getTopList(range.startContainer);
        if (tempTopListElement) {
            tempTopListElement.querySelectorAll(CODE_RENDER_SELECTOR)
                .forEach((item: Element) => {
                    processCodeRender(item as HTMLElement, aura);
                    if (
                        aura.currentMode === "wysiwyg" &&
                        item.classList.contains("aura-wysiwyg__preview")
                    ) {
                        item.previousElementSibling!.setAttribute("style", "display:none");
                    }
                });
        }
        execAfterRender(aura);
        highlightToolbar(aura);
    } else {
        aura[aura.currentMode].element.focus();
    }
};

export const listOutdent = (aura: IAura, liElement: HTMLElement, range: Range, topListElement: HTMLElement) => {
    const liParentLiElement = hasClosestByMatchTag(liElement.parentElement!, "LI");
    if (liParentLiElement) {
        aura[aura.currentMode].element.querySelectorAll("wbr").forEach((wbr) => {
            wbr.remove();
        });
        range.insertNode(document.createElement("wbr"));

        const liParentElement = liElement.parentElement!;
        const liParentAfterElement = liParentElement!.cloneNode() as HTMLElement;
        const liElements: HTMLElement[] = [liElement];
        Array.from(range.cloneContents().children).forEach((item, index) => {
            if (item.nodeType !== 3 && liElement && item.textContent!.trim() !== "" &&
                liElement.getAttribute("data-node-id")! === item.getAttribute("data-node-id")!) {
                if (index !== 0) {
                    liElements.push(liElement);
                }
                liElement = liElement.nextElementSibling! as HTMLElement;
            }
        });
        let isMatch = false;
        let afterHTML = "";
        liParentElement!.querySelectorAll("li").forEach((item) => {
            if (isMatch) {
                afterHTML += item.outerHTML;
                if (!item.nextElementSibling! && !item.previousElementSibling!) {
                    item.parentElement!.remove();
                } else {
                    item.remove();
                }
            }
            if (item.isSameNode(liElements[liElements.length - 1])) {
                isMatch = true;
            }
        });

        liElements.reverse().forEach((item) => {
            liParentLiElement.insertAdjacentElement("afterend", item);
        });

        if (afterHTML) {
            liParentAfterElement.innerHTML = afterHTML;
            liElements[0].insertAdjacentElement("beforeend", liParentAfterElement);
        }

        topListElement.outerHTML = aura.markdown.spinAuraDom(topListElement.outerHTML);

        setRangeByWbr(aura[aura.currentMode].element, range);
        const tempTopListElement = getTopList(range.startContainer);
        if (tempTopListElement) {
            tempTopListElement.querySelectorAll(CODE_RENDER_SELECTOR)
                .forEach((item: Element) => {
                    processCodeRender(item as HTMLElement, aura);
                    if (
                        aura.currentMode === "wysiwyg" &&
                        item.classList.contains("aura-wysiwyg__preview")
                    ) {
                        item.previousElementSibling!.setAttribute("style", "display:none");
                    }
                });
        }
        execAfterRender(aura);
        highlightToolbar(aura);
    } else {
        aura[aura.currentMode].element.focus();
    }
};

export const setTableAlign = (tableElement: HTMLTableElement, type: string) => {
    const cell = getSelection()!.getRangeAt(0).startContainer.parentElement!;

    const columnCnt = tableElement.rows[0].cells.length;
    const rowCnt = tableElement.rows.length;
    let currentColumn = 0;

    for (let i = 0; i < rowCnt; i++) {
        for (let j = 0; j < columnCnt; j++) {
            if (tableElement.rows[i].cells[j].isSameNode(cell)) {
                currentColumn = j;
                break;
            }
        }
    }
    for (let k = 0; k < rowCnt; k++) {
        tableElement.rows[k].cells[currentColumn].setAttribute("align", type);
    }
};

export const isHrMD = (text: string) => {
    // - _ *
    const marker = text.trimRight().split("\n").pop();
    if (marker === "") {
        return false;
    }
    if (marker!.replace(/ |-/g, "") === ""
        || marker!.replace(/ |_/g, "") === ""
        || marker!.replace(/ |\*/g, "") === "") {
        if (marker!.replace(/ /g, "").length > 2) {
            if (marker!.indexOf("-") > -1 && marker!.trimLeft().indexOf(" ") === -1
                && text.trimRight().split("\n").length > 1) {
                // Satisfies heading
                return false;
            }
            if (marker!.indexOf("    ") === 0 || marker!.indexOf("\t") === 0) {
                // Code block
                return false;
            }
            return true;
        }
        return false;
    }
    return false;
};

export const isHeadingMD = (text: string) => {
    // - =
    const textArray = text.trimRight().split("\n");
    text = textArray.pop()!;

    if (text.indexOf("    ") === 0 || text.indexOf("\t") === 0) {
        return false;
    }

    text = text.trimLeft();
    if (text === "" || textArray.length === 0) {
        return false;
    }
    if (text.replace(/-/g, "") === ""
        || text.replace(/=/g, "") === "") {
        return true;
    }
    return false;
};

export const execAfterRender = (aura: IAura, options = {
    enableAddUndoStack: true,
    enableHint: false,
}) => {
    afterRenderEvent(aura, options);
};

export const fixList = (range: Range, aura: IAura, pElement: HTMLElement | false, event: KeyboardEvent) => {
    const startContainer = range.startContainer;
    const liElement = hasClosestByMatchTag(startContainer, "LI");
    if (liElement) {
        if (!isCtrl(event) && !event.altKey && event.key === "Enter" &&
            // fix: newline in first P of li with multiple P creates new li below
            (!event.shiftKey && pElement && liElement.contains(pElement) && pElement.nextElementSibling!)) {
            if (liElement && !liElement.textContent!.endsWith("\n")) {
                // li end requires \n
                liElement.insertAdjacentText("beforeend", "\n");
            }
            range.insertNode(document.createTextNode("\n\n"));
            range.collapse(false);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }

        if (!isCtrl(event) && !event.shiftKey && !event.altKey && event.key === "Backspace" &&
            !liElement.previousElementSibling! && range.toString() === "" &&
            getSelectPosition(liElement, aura[aura.currentMode].element, range).start === 0) {
            // Cannot delete li when cursor is between bullet and first character
            if (liElement.nextElementSibling!) {
                liElement.parentElement!.insertAdjacentHTML("beforebegin",
                    `<p data-block="0"><wbr>${liElement.innerHTML}</p>`);
                liElement.remove();
            } else {
                liElement.parentElement!.outerHTML = `<p data-block="0"><wbr>${liElement.innerHTML}</p>`;
            }
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }

        // Align with parent paragraph after deleting empty list
        if (!isCtrl(event) && !event.shiftKey && !event.altKey && event.key === "Backspace" &&
            liElement.textContent!.trim().replace(Constants.ZWSP, "") === "" &&
            range.toString() === "" && liElement.previousElementSibling?.tagName === "LI") {
            liElement.previousElementSibling!.insertAdjacentText("beforeend", "\n\n");
            range.selectNodeContents(liElement.previousElementSibling!);
            range.collapse(false);
            liElement.remove();
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }

        if (!isCtrl(event) && !event.altKey && event.key === "Tab") {
            // Tab at first/zero character indents list
            let isFirst = false;
            if (range.startOffset === 0
                && ((startContainer.nodeType === 3 && !startContainer.previousSibling!)
                    || (startContainer.nodeType !== 3 && startContainer.nodeName === "LI"))) {
                // Ordered/unordered list
                isFirst = true;
            } else if (liElement.classList.contains("aura-task") && range.startOffset === 1
                && startContainer.previousSibling!.nodeType !== 3
                && (startContainer.previousSibling! as HTMLElement).tagName === "INPUT") {
                // Task list
                isFirst = true;
            }

            if (isFirst || range.toString() !== "") {
                if (event.shiftKey) {
                    listOutdent(aura, liElement, range, liElement.parentElement!);
                } else {
                    listIndent(aura, liElement, range);
                }
                event.preventDefault();
                return true;
            }
        }
    }
    return false;
};

// Tab handling: block code render, table; list first-char tab handled above
export const fixTab = (aura: IAura, range: Range, event: KeyboardEvent) => {
    if (aura.options.tab && event.key === "Tab") {
        if (event.shiftKey) {
            // TODO shift+tab
        } else {
            if (range.toString() === "") {
                range.insertNode(document.createTextNode(aura.options.tab));
                range.collapse(false);
            } else {
                range.extractContents();
                range.insertNode(document.createTextNode(aura.options.tab));
                range.collapse(false);
            }
        }
        setSelectionFocus(range);
        execAfterRender(aura);
        event.preventDefault();
        return true;
    }
};

export const fixMarkdown = (event: KeyboardEvent, aura: IAura, pElement: HTMLElement | false, range: Range) => {
    if (!pElement) {
        return;
    }
    if (!isCtrl(event) && !event.altKey && event.key === "Enter") {
        const codeFence = matchCodeFenceShortcut(pElement.textContent ?? "");
        if (!event.shiftKey && codeFence) {
            const codeMarkdown = `${codeFence.fence}${codeFence.language}\n${Constants.ZWSP}\n${codeFence.fence}`;
            pElement.outerHTML = aura.markdown.markdownToAuraDom(codeMarkdown)
                .replace(Constants.ZWSP, "<wbr>");
            setRangeByWbr(aura[aura.currentMode].element, range);
            aura.wysiwyg.element.querySelectorAll(CODE_RENDER_SELECTOR).forEach((item) => {
                processCodeRender(item as HTMLElement, aura);
            });
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }

        const completedHeading = matchCompletedHeadingShortcut(pElement.textContent ?? "");
        if (!event.shiftKey && completedHeading) {
            const renderedHeading = aura.markdown.markdownToAuraDom(completedHeading.markdown);
            pElement.outerHTML = `${renderedHeading}<p data-block="0"><wbr><br></p>`;
            setRangeByWbr(aura[aura.currentMode].element, range);
            renderToc(aura);
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }

        const pText = String.raw`${pElement.textContent!}`.replace(/\\\|/g, "").trim();
        const pTextList = pText.split("|");
        if (pText.startsWith("|") && pText.endsWith("|") && pTextList.length > 3) {
            // Table autocomplete
            let tableHeaderMD = pTextList.map(() => "---").join("|");
            tableHeaderMD =
                pElement.textContent! + "\n" + tableHeaderMD.substring(3, tableHeaderMD.length - 3) + "\n|<wbr>";
            pElement.outerHTML = aura.markdown.spinAuraDom(tableHeaderMD);
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }

        // HR rendering
        if (isHrMD(pElement.innerHTML) && pElement.previousElementSibling!) {
            // Content before hr after soft newline
            let pInnerHTML = "";
            const innerHTMLList = pElement.innerHTML.trimRight().split("\n");
            if (innerHTMLList.length > 1) {
                innerHTMLList.pop();
                pInnerHTML = `<p data-block="0">${innerHTMLList.join("\n")}</p>`;
            }

            pElement.insertAdjacentHTML("afterend",
                `${pInnerHTML}<hr data-block="0"><p data-block="0"><wbr>\n</p>`);
            pElement.remove();
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }

        if (isHeadingMD(pElement.innerHTML)) {
            // Heading rendering
            pElement.outerHTML = aura.markdown.spinAuraDom(pElement.innerHTML + '<p data-block="0"><wbr>\n</p>');
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }
    }

    // Soft newline gets split https://github.com/Vanessa219/aura/issues/220
    if (range.collapsed && pElement.previousElementSibling! && event.key === "Backspace" &&
        !isCtrl(event) && !event.altKey && !event.shiftKey &&
        pElement.textContent!.trimRight().split("\n").length > 1 &&
        getSelectPosition(pElement, aura[aura.currentMode].element, range).start === 0) {
        const lastElement = getLastNode(pElement.previousElementSibling!) as HTMLElement;
        if (!lastElement.textContent!.endsWith("\n")) {
            lastElement.textContent! = lastElement.textContent! + "\n";
        }
        lastElement.parentElement!.insertAdjacentHTML("beforeend", `<wbr>${pElement.innerHTML}`);
        pElement.remove();
        setRangeByWbr(aura[aura.currentMode].element, range);
        return false;
    }
    return false;
};

export const insertRow = (aura: IAura, range: Range, cellElement: HTMLElement) => {
    let rowHTML = "";
    for (let m = 0; m < cellElement.parentElement!.childElementCount; m++) {
        rowHTML += `<td align="${cellElement.parentElement!.children[m].getAttribute("align")!}"> </td>`;
    }
    if (cellElement.tagName === "TH") {
        cellElement.parentElement!.parentElement!.insertAdjacentHTML("afterend",
            `<tbody><tr>${rowHTML}</tr></tbody>`);
    } else {
        cellElement.parentElement!.insertAdjacentHTML("afterend", `<tr>${rowHTML}</tr>`);
    }
    execAfterRender(aura);
};

export const insertRowAbove = (aura: IAura, range: Range, cellElement: HTMLElement) => {
    let rowHTML = "";
    for (let m = 0; m < cellElement.parentElement!.childElementCount; m++) {
        if (cellElement.tagName === "TH") {
            rowHTML += `<th align="${cellElement.parentElement!.children[m].getAttribute("align")!}"> </th>`;
        } else {
            rowHTML += `<td align="${cellElement.parentElement!.children[m].getAttribute("align")!}"> </td>`;
        }
    }
    if (cellElement.tagName === "TH") {
        cellElement.parentElement!.parentElement!.insertAdjacentHTML("beforebegin", `<thead><tr>${rowHTML}</tr></thead>`);

        range.insertNode(document.createElement("wbr"));
        const theadHTML = cellElement.parentElement!.innerHTML.replace(/<th>/g, "<td>").replace(/<\/th>/g, "</td>");
        cellElement.parentElement!.parentElement!.nextElementSibling!.insertAdjacentHTML("afterbegin", theadHTML);

        cellElement.parentElement!.parentElement!.remove();
        setRangeByWbr(aura[aura.currentMode].element, range);
    } else {
        cellElement.parentElement!.insertAdjacentHTML("beforebegin", `<tr>${rowHTML}</tr>`);
    }
    execAfterRender(aura);
};

export const insertColumn =
    (aura: IAura, tableElement: HTMLTableElement, cellElement: HTMLElement, type: InsertPosition = "afterend") => {
        let index = 0;
        let previousElement = cellElement.previousElementSibling!;
        while (previousElement) {
            index++;
            previousElement = previousElement.previousElementSibling!;
        }
        for (let i = 0; i < tableElement.rows.length; i++) {
            if (i === 0) {
                tableElement.rows[i].cells[index].insertAdjacentHTML(type, "<th> </th>");
            } else {
                tableElement.rows[i].cells[index].insertAdjacentHTML(type, "<td> </td>");
            }
        }
        execAfterRender(aura);
    };
export const deleteRow = (aura: IAura, range: Range, cellElement: HTMLElement) => {
    if (cellElement.tagName === "TD") {
        const tbodyElement = cellElement.parentElement!.parentElement!;
        if (cellElement.parentElement!.previousElementSibling!) {
            range.selectNodeContents(cellElement.parentElement!.previousElementSibling!.lastElementChild!);
        } else {
            range.selectNodeContents(tbodyElement!.previousElementSibling!.lastElementChild!.lastElementChild!);
        }

        if (tbodyElement!.childElementCount === 1) {
            tbodyElement!.remove();
        } else {
            cellElement.parentElement!.remove();
        }

        range.collapse(false);
        setSelectionFocus(range);
        execAfterRender(aura);
    }
};

export const deleteColumn =
    (aura: IAura, range: Range, tableElement: HTMLTableElement, cellElement: HTMLElement) => {
        let index = 0;
        let previousElement = cellElement.previousElementSibling!;
        while (previousElement) {
            index++;
            previousElement = previousElement.previousElementSibling!;
        }
        if (cellElement.previousElementSibling! || cellElement.nextElementSibling!) {
            range.selectNodeContents(cellElement.previousElementSibling! || cellElement.nextElementSibling!);
            range.collapse(true);
        }
        for (let i = 0; i < tableElement.rows.length; i++) {
            const cells = tableElement.rows[i].cells;
            if (cells.length === 1) {
                tableElement.remove();
                highlightToolbar(aura);
                break;
            }
            cells[index].remove();
        }
        setSelectionFocus(range);
        execAfterRender(aura);
    };

export const fixTable = (aura: IAura, event: KeyboardEvent, range: Range) => {
    const startContainer = range.startContainer;
    const cellElement = hasClosestByMatchTag(startContainer, "TD") ||
        hasClosestByMatchTag(startContainer, "TH");
    if (cellElement) {
        // Newline or soft newline: add br in cell
        if (!isCtrl(event) && !event.altKey && event.key === "Enter") {
            if (!cellElement.lastElementChild! ||
                (cellElement.lastElementChild! && (!cellElement.lastElementChild!.isSameNode(cellElement.lastChild!) ||
                    cellElement.lastElementChild!.tagName !== "BR"))) {
                cellElement.insertAdjacentHTML("beforeend", "<br>");
            }
            const brElement = document.createElement("br");
            range.insertNode(brElement);
            range.setStartAfter(brElement);
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }

        // Tab: move cursor to next cell
        if (event.key === "Tab") {
            if (event.shiftKey) {
                // Shift+Tab: move cursor to previous cell
                goPreviousCell(cellElement, range);
                event.preventDefault();
                return true;
            }

            let nextElement: Element | null = cellElement.nextElementSibling!;
            if (!nextElement) {
                if (cellElement.parentElement!.nextElementSibling!) {
                    nextElement = cellElement.parentElement!.nextElementSibling!.firstElementChild!;
                } else if (cellElement.parentElement!.parentElement!.tagName === "THEAD" &&
                    cellElement.parentElement!.parentElement!.nextElementSibling!) {
                    nextElement =
                        cellElement.parentElement!.parentElement!.nextElementSibling!.firstElementChild!.firstElementChild!;
                } else {
                    nextElement = null;
                }
            }
            if (nextElement) {
                range.selectNodeContents(nextElement);
                setSelectionFocus(range);
            }
            event.preventDefault();
            return true;
        }

        const tableElement = cellElement.parentElement!.parentElement!.parentElement! as HTMLTableElement;
        if (event.key === "ArrowUp") {
            event.preventDefault();
            if (cellElement.tagName === "TH") {
                if (tableElement.previousElementSibling!) {
                    range.selectNodeContents(tableElement.previousElementSibling!);
                    range.collapse(false);
                    setSelectionFocus(range);
                } else {
                    insertEmptyBlock(aura, "beforebegin");
                }
                return true;
            }

            let m = 0;
            const trElement = cellElement.parentElement! as HTMLTableRowElement;
            for (; m < trElement.cells.length; m++) {
                if (trElement.cells[m].isSameNode(cellElement)) {
                    break;
                }
            }

            let previousElement = trElement.previousElementSibling! as HTMLTableRowElement;
            if (!previousElement) {
                previousElement = trElement.parentElement!.previousElementSibling!.firstChild! as HTMLTableRowElement;
            }
            range.selectNodeContents(previousElement.cells[m]);
            range.collapse(false);
            setSelectionFocus(range);
            return true;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            const trElement = cellElement.parentElement! as HTMLTableRowElement;
            if (!trElement.nextElementSibling! && cellElement.tagName === "TD") {
                if (tableElement.nextElementSibling!) {
                    range.selectNodeContents(tableElement.nextElementSibling!);
                    range.collapse(true);
                    setSelectionFocus(range);
                } else {
                    insertEmptyBlock(aura, "afterend");
                }
                return true;
            }

            let m = 0;
            for (; m < trElement.cells.length; m++) {
                if (trElement.cells[m].isSameNode(cellElement)) {
                    break;
                }
            }

            let nextElement = trElement.nextElementSibling! as HTMLTableRowElement;
            if (!nextElement) {
                nextElement = trElement.parentElement!.nextElementSibling!.firstChild! as HTMLTableRowElement;
            }
            range.selectNodeContents(nextElement.cells[m]);
            range.collapse(true);
            setSelectionFocus(range);
            return true;
        }

        // Backspace: move cursor to previous cell
        if (!isCtrl(event) && !event.shiftKey && !event.altKey && event.key === "Backspace"
            && range.startOffset === 0 && range.toString() === "") {
            const previousCellElement = goPreviousCell(cellElement, range, false);
            if (!previousCellElement && tableElement) {
                if (tableElement.textContent!.trim() === "") {
                    tableElement.outerHTML = `<p data-block="0"><wbr>\n</p>`;
                    setRangeByWbr(aura[aura.currentMode].element, range);
                } else {
                    range.setStartBefore(tableElement);
                    range.collapse(true);
                }
                execAfterRender(aura);
            }
            event.preventDefault();
            return true;
        }
        // Add row above
        if (matchHotKey("????F", event)) {
            insertRowAbove(aura, range, cellElement);
            event.preventDefault();
            return true;
        }

        // Add row below https://github.com/Vanessa219/aura/issues/46
        if (matchHotKey("??", event)) {
            insertRow(aura, range, cellElement);
            event.preventDefault();
            return true;
        }

        // Add column to the left
        if (matchHotKey("????G", event)) {
            insertColumn(aura, tableElement, cellElement, "beforebegin");
            event.preventDefault();
            return true;
        }

        // Add column to the right
        if (matchHotKey("????=", event)) {
            insertColumn(aura, tableElement, cellElement);
            event.preventDefault();
            return true;
        }

        // Delete current row
        if (matchHotKey("??", event)) {
            deleteRow(aura, range, cellElement);
            event.preventDefault();
            return true;
        }

        // Delete current column
        if (matchHotKey("????-", event)) {
            deleteColumn(aura, range, tableElement, cellElement);
            event.preventDefault();
            return true;
        }

        // Table align.
        if (matchHotKey("????L", event)) {
            setTableAlign(tableElement, "left");
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }
        if (matchHotKey("????C", event)) {
            setTableAlign(tableElement, "center");
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }
        if (matchHotKey("????R", event)) {
            setTableAlign(tableElement, "right");
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }
    }
    return false;
};

export const fixCodeBlock = (aura: IAura, event: KeyboardEvent, codeRenderElement: HTMLElement, range: Range) => {
    const codeElement = codeRenderElement.querySelector(":scope > code");
    if (!codeElement) {
        return false;
    }
    // Cmd+A in inline code block selects only current code block
    if (codeRenderElement.tagName === "PRE" && matchHotKey("??A", event)) {
        range.selectNodeContents(codeElement);
        event.preventDefault();
        return true;
    }

    // tab
    // TODO shift+tab, shift and selected text
    if (aura.options.tab && event.key === "Tab" && !event.shiftKey && range.toString() === "") {
        range.insertNode(document.createTextNode(aura.options.tab));
        range.collapse(false);
        execAfterRender(aura);
        event.preventDefault();
        return true;
    }

    // Backspace: at zeroth character, remove code block tag only
    if (event.key === "Backspace" && !isCtrl(event) && !event.shiftKey && !event.altKey) {
        const codePosition = getSelectPosition(codeRenderElement, aura[aura.currentMode].element, range);
        if ((codePosition.start === 0 ||
                (codePosition.start === 1 && codeRenderElement.innerText === "\n")) // Empty code block, cursor after \n
            && range.toString() === "") {
            const paragraph = document.createElement("p");
            paragraph.setAttribute("data-block", "0");
            paragraph.appendChild(document.createElement("wbr"));
            paragraph.appendChild(document.createTextNode(
                codeElement.textContent ?? "",
            ));
            codeRenderElement.parentElement!.replaceWith(paragraph);
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }
    }

    // Newline
    if (!isCtrl(event) && !event.altKey && event.key === "Enter") {
        if (!codeElement.textContent!.endsWith("\n")) {
            codeElement.insertAdjacentText("beforeend", "\n");
        }
        range.extractContents();
        range.insertNode(document.createTextNode("\n"));
        range.collapse(false);
        setSelectionFocus(range);
        if (!isFirefox()) {
            input(aura, range);
        }
        scrollCenter(aura);
        event.preventDefault();
        return true;
    }
    return false;
};

export const fixBlockquote = (aura: IAura, range: Range, event: KeyboardEvent, pElement: HTMLElement | false) => {
    const startContainer = range.startContainer;
    const blockquoteElement = hasClosestByMatchTag(startContainer, "BLOCKQUOTE");
    if (blockquoteElement && range.toString() === "") {
        if (event.key === "Backspace" && !isCtrl(event) && !event.shiftKey && !event.altKey &&
            getSelectPosition(blockquoteElement, aura[aura.currentMode].element, range).start === 0) {
            // Backspace: at zeroth character in quote, remove quote tag only
            range.insertNode(document.createElement("wbr"));
            blockquoteElement.outerHTML = blockquoteElement.innerHTML;
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }

        if (pElement && event.key === "Enter" && !isCtrl(event) && !event.shiftKey && !event.altKey
            && pElement.parentElement!.tagName === "BLOCKQUOTE") {
            // Enter on empty line exits blockquote layer by layer
            let isEmpty = false;
            if (pElement.innerHTML.replace(Constants.ZWSP, "") === "\n" ||
                pElement.innerHTML.replace(Constants.ZWSP, "") === "") {
                // Empty P
                isEmpty = true;
                pElement.remove();
            } else if (pElement.innerHTML.endsWith("\n\n") &&
                getSelectPosition(pElement, aura[aura.currentMode].element, range).start ===
                pElement.textContent!.length - 1) {
                // Soft newline
                pElement.innerHTML = pElement.innerHTML.substr(0, pElement.innerHTML.length - 2);
                isEmpty = true;
            }
            if (isEmpty) {
                // Need zero-width char or undo cannot be recorded
                blockquoteElement.insertAdjacentHTML("afterend", `<p data-block="0">${Constants.ZWSP}<wbr>\n</p>`);
                setRangeByWbr(aura[aura.currentMode].element, range);
                execAfterRender(aura);
                event.preventDefault();
                return true;
            }
        }
        const blockElement = hasClosestBlock(startContainer);
        if (aura.currentMode === "wysiwyg" && blockElement && matchHotKey("????;", event)) {
            // Insert blockquote
            range.insertNode(document.createElement("wbr"));
            blockElement.outerHTML = `<blockquote data-block="0">${blockElement.outerHTML}</blockquote>`;
            setRangeByWbr(aura.wysiwyg.element, range);
            afterRenderEvent(aura);
            event.preventDefault();
            return true;
        }

        if (insertAfterBlock(aura, event, range, blockquoteElement, blockquoteElement)) {
            return true;
        }
        if (insertBeforeBlock(aura, event, range, blockquoteElement, blockquoteElement)) {
            return true;
        }
    }
    return false;
};

export const fixTask = (aura: IAura, range: Range, event: KeyboardEvent) => {
    const startContainer = range.startContainer;
    const taskItemElement = hasClosestByMatchTag(startContainer, "LI");
    if (taskItemElement && taskItemElement.classList.contains("aura-task")) {
        if (matchHotKey("????J", event)) {
            // ctrl + shift: toggle checked
            const inputElement = taskItemElement.firstElementChild! as HTMLInputElement;
            if (inputElement.checked) {
                inputElement.removeAttribute("checked");
            } else {
                inputElement.setAttribute("checked", "checked");
            }
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }

        // Backspace: delete before checkbox
        if (event.key === "Backspace" && !isCtrl(event) && !event.shiftKey && !event.altKey && range.toString() === ""
            && range.startOffset === 1
            && ((startContainer.nodeType === 3 && startContainer.previousSibling! &&
                    (startContainer.previousSibling! as HTMLElement).tagName === "INPUT")
                || startContainer.nodeType !== 3)) {
            const previousElement = taskItemElement.previousElementSibling!;
            taskItemElement.querySelector("input")!.remove();
            if (previousElement) {
                const lastNode = getLastNode(previousElement);
                lastNode.parentElement!.insertAdjacentHTML("beforeend", "<wbr>" + taskItemElement.innerHTML.trim());
                taskItemElement.remove();
            } else {
                taskItemElement.parentElement!.insertAdjacentHTML("beforebegin",
                    `<p data-block="0"><wbr>${taskItemElement.innerHTML.trim() || "\n"}</p>`);
                if (taskItemElement.nextElementSibling!) {
                    taskItemElement.remove();
                } else {
                    taskItemElement.parentElement!.remove();
                }
            }
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }

        if (event.key === "Enter" && !isCtrl(event) && !event.shiftKey && !event.altKey) {
            if (taskItemElement.textContent!.trim() === "") {
                // Current task list item has no text
                if (hasClosestByClassName(taskItemElement.parentElement!, "aura-task")) {
                    // When nested, outdent
                    const topListElement = getTopList(startContainer);
                    if (topListElement) {
                        listOutdent(aura, taskItemElement, range, topListElement);
                    }
                } else {
                    // Only top-level task list
                    if (taskItemElement.nextElementSibling!) {
                        // Elements below task list; need paragraph separator
                        let afterHTML = "";
                        let beforeHTML = "";
                        let isAfter = false;
                        Array.from(taskItemElement.parentElement!.children).forEach((taskItem) => {
                            if (taskItemElement.isSameNode(taskItem)) {
                                isAfter = true;
                            } else {
                                if (isAfter) {
                                    afterHTML += taskItem.outerHTML;
                                } else {
                                    beforeHTML += taskItem.outerHTML;
                                }
                            }
                        });
                        const parentTagName = taskItemElement.parentElement!.tagName;
                        const dataMarker = taskItemElement.parentElement!.tagName === "OL" ? "" : ` data-marker="${taskItemElement.parentElement!.getAttribute("data-marker")!}"`;
                        let startAttribute = "";
                        if (beforeHTML) {
                            startAttribute = taskItemElement.parentElement!.tagName === "UL" ? "" : ` start="1"`;
                            beforeHTML = `<${parentTagName} data-tight="true"${dataMarker} data-block="0">${beforeHTML}</${parentTagName}>`;
                        }
                        // <p data-block="0">\n<wbr></p> => <p data-block="0"><wbr>\n</p>
                        // https://github.com/Vanessa219/aura/issues/430
                        taskItemElement.parentElement!.outerHTML = `${beforeHTML}<p data-block="0"><wbr>\n</p><${parentTagName}
 data-tight="true"${dataMarker} data-block="0"${startAttribute}>${afterHTML}</${parentTagName}>`;
                    } else {
                        // No task list below current task list
                        taskItemElement.parentElement!.insertAdjacentHTML("afterend", `<p data-block="0"><wbr>\n</p>`);
                        if (taskItemElement.parentElement!.querySelectorAll("li").length === 1) {
                            // Single task list item: replace with p element
                            taskItemElement.parentElement!.remove();
                        } else {
                            // Multiple items and current is last: remove this task list item
                            taskItemElement.remove();
                        }
                    }
                }
            } else if (startContainer.nodeType !== 3 && range.startOffset === 0 &&
                (startContainer.firstChild! as HTMLElement).tagName === "INPUT") {
                // Cursor before input
                range.setStart(startContainer.childNodes[1], 1);
            } else {
                // Task list has text; text after cursor goes to new task item
                range.setEndAfter(taskItemElement.lastChild!);
                taskItemElement.insertAdjacentHTML("afterend", `<li class="aura-task" data-marker="${taskItemElement.getAttribute("data-marker")!}"><input type="checkbox"> <wbr></li>`);
                document.querySelector("wbr")!.after(range.extractContents());
            }
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            scrollCenter(aura);
            event.preventDefault();
            return true;
        }
    }
    return false;
};

export const fixDelete = (aura: IAura, range: Range, event: KeyboardEvent, pElement: HTMLElement | false) => {
    if (range.startContainer.nodeType !== 3) {
        // Cursor before hr with content before hr
        const rangeElement = (range.startContainer as HTMLElement).children[range.startOffset];
        if (rangeElement && rangeElement.tagName === "HR") {
            range.selectNodeContents(rangeElement.previousElementSibling!);
            range.collapse(false);
            event.preventDefault();
            return true;
        }
    }

    if (pElement) {
        const previousElement = pElement.previousElementSibling!;
        if (previousElement && getSelectPosition(pElement, aura[aura.currentMode].element, range).start === 0 &&
            ((isFirefox() && previousElement.tagName === "HR") || previousElement.tagName === "TABLE")) {
            if (previousElement.tagName === "TABLE") {
                // Delete after table https://github.com/Vanessa219/aura/issues/243
                const lastCellElement = previousElement.lastElementChild!.lastElementChild!.lastElementChild!;
                lastCellElement!.innerHTML =
                    lastCellElement!.innerHTML.trimLeft() + "<wbr>" + pElement.textContent!.trim();
                pElement.remove();
            } else {
                // Delete with cursor after hr
                previousElement.remove();
            }
            setRangeByWbr(aura[aura.currentMode].element, range);
            execAfterRender(aura);
            event.preventDefault();
            return true;
        }
    }
    return false;
};

export const fixHR = (range: Range) => {
    if (isFirefox() && range.startContainer.nodeType !== 3 &&
        (range.startContainer as HTMLElement).tagName === "HR") {
        range.setStartBefore(range.startContainer);
    }
};

// firefox https://github.com/Vanessa219/aura/issues/407
export const fixFirefoxArrowUpTable = (event: KeyboardEvent, blockElement: false | HTMLElement, range: Range) => {
    if (!isFirefox()) {
        return false;
    }
    if (event.key === "ArrowUp" && blockElement && blockElement.previousElementSibling?.tagName === "TABLE") {
        const tableElement = blockElement.previousElementSibling! as HTMLTableElement;
        range.selectNodeContents(tableElement.rows[tableElement.rows.length - 1].lastElementChild!);
        range.collapse(false);
        event.preventDefault();
        return true;
    }
    if (event.key === "ArrowDown" && blockElement && blockElement.nextElementSibling?.tagName === "TABLE") {
        range.selectNodeContents((blockElement.nextElementSibling! as HTMLTableElement).rows[0].cells[0]);
        range.collapse(true);
        event.preventDefault();
        return true;
    }
    return false;
};

export const paste = async (aura: IAura, event: (ClipboardEvent | DragEvent) & {target: HTMLElement}, callback: {
    pasteCode(code: string): void,
}) => {
    if (aura[aura.currentMode].element.getAttribute("contenteditable")! !== "true") {
        return;
    }
    event.stopPropagation();
    event.preventDefault();
    let textHTML = "";
    let textPlain = "";
    let files: FileList | DataTransferItemList | undefined;

    if ("clipboardData" in event) {
        textHTML = event.clipboardData!.getData("text/html");
        textPlain = event.clipboardData!.getData("text/plain");
        files = event.clipboardData!.files;
    } else {
        textHTML = event.dataTransfer!.getData("text/html");
        textPlain = event.dataTransfer!.getData("text/plain");
        if (event.dataTransfer!.types.includes("Files")) {
            files = event.dataTransfer!.items;
        }
    }
    textHTML = normalizeClipboardHtml(textHTML, textPlain);
    // Browser address bar copy handling
    if (textHTML.replace(/&amp;/g, "&").replace(/<(|\/)(html|body|meta)[^>]*?>/ig, "").trim() ===
        `<a href="${textPlain}">${textPlain}</a>` ||
        textHTML.replace(/&amp;/g, "&").replace(/<(|\/)(html|body|meta)[^>]*?>/ig, "").trim() ===
        `<!--StartFragment--><a href="${textPlain}">${textPlain}</a><!--EndFragment-->`) {
        textHTML = "";
    }

    // process word
    const doc = new DOMParser().parseFromString(textHTML, "text/html");
    if (doc.body) {
        textHTML = doc.body.innerHTML;
    }
    textHTML = sanitizeHtml(textHTML);

    // process code
    const height = aura[aura.currentMode].element.scrollHeight;
    const code = processPasteCode(textHTML, textPlain);
    const codeElement = hasClosestByMatchTag(event.target, "CODE");
    if (codeElement) {
        // Paste at code position
        const position = getSelectPosition(event.target, aura[aura.currentMode].element);
        if (codeElement.parentElement!.tagName !== "PRE") {
            // https://github.com/Vanessa219/aura/issues/463
            textPlain += Constants.ZWSP;
        }
        codeElement.textContent! = codeElement.textContent!.substring(0, position.start)
            + textPlain + codeElement.textContent!.substring(position.end);
        setSelectionByPosition(position.start + textPlain.length, position.start + textPlain.length,
            codeElement.parentElement!);
        const preview = codeElement.parentElement?.nextElementSibling;
        if (preview?.classList.contains(`aura-${aura.currentMode}__preview`)) {
            preview.innerHTML = codeElement.outerHTML;
            processCodeRender(preview as HTMLElement, aura);
        }
    } else if (code) {
        callback.pasteCode(code);
    } else {
            if (textHTML.trim() !== "") {
            const tempElement = document.createElement("div");
            tempElement.innerHTML = textHTML;
            // Word mixed text/image paste may include VML image data.
            await processVMLImage(tempElement, ("clipboardData" in event ? event.clipboardData! : event.dataTransfer!).getData("text/rtf"));

            tempElement.querySelectorAll("[style]").forEach((e) => {
                e.removeAttribute("style");
            });
            tempElement.querySelectorAll(".aura-copy").forEach((e) => {
                e.remove();
            });
            insertHTML(aura.markdown.htmlToAuraDom(tempElement.innerHTML), aura);
            renderToc(aura);
        } else if (files && files.length > 0) {
            const fileReader = new FileReader();
            let file: File | undefined;
            if ("clipboardData" in event) {
                files = event.clipboardData!.files;
                file = files[0];
            } else if (event.dataTransfer!.types.includes("Files")) {
                files = event.dataTransfer!.items;
                file = files[0].getAsFile() ?? undefined;
            }
            if (file && file.type.startsWith("image")) {
                fileReader.readAsDataURL(file);
                fileReader.onload = () => {
                    const imgHTML = `<img alt="${file.name}" src="${fileReader.result!.toString()}">\n`;
                    document.execCommand("insertHTML", false, imgHTML);
                };
            }
        } else if (textPlain.trim() !== "" && (!files || files.length === 0)) {
            const range = getEditorRange(aura);
            if (range.toString() !== "" && aura.markdown.isValidLinkDest(textPlain)) {
                textPlain = `[${range.toString()}](${textPlain})`;
            }
            insertHTML(sanitizeHtml(aura.markdown.markdownToAuraDom(textPlain)), aura);
            renderToc(aura);
        }
    }
    const blockElement = hasClosestBlock(getEditorRange(aura).startContainer);
    if (blockElement) {
        // https://github.com/Vanessa219/aura/issues/591
        const range = getEditorRange(aura);
        aura[aura.currentMode].element.querySelectorAll("wbr").forEach((wbr) => {
            wbr.remove();
        });
        range.insertNode(document.createElement("wbr"));
        // spinAuraDom would treat flag <img> as a plain (full-size) image and drop
        // its class/size; restore emoji first, then re-render flags below.
        unwrapFlagImages(blockElement);
        blockElement.outerHTML = aura.markdown.spinAuraDom(blockElement.outerHTML);
        setRangeByWbr(aura[aura.currentMode].element, range);
    }
    aura[aura.currentMode].element.querySelectorAll(CODE_RENDER_SELECTOR)
        .forEach((item: Element) => {
            processCodeRender(item as HTMLElement, aura);
        });
    flagRender(aura[aura.currentMode].element);
    execAfterRender(aura);
    if (aura[aura.currentMode].element.scrollHeight - height >
        Math.min(aura[aura.currentMode].element.clientHeight, window.innerHeight) / 2) {
        scrollCenter(aura);
    }
};

const processVMLImage = async (root: Element, rtfData: string) => {
    if (!rtfData) {
        return;

    }

    const regexPictureHeader = /{\\pict[\s\S]+?\\bliptag-?\d+(\\blipupi-?\d+)?({\\\*\\blipuid\s?[\da-fA-F]+)?[\s}]*?/;
    const regexPicture = new RegExp("(?:(" + regexPictureHeader.source + "))([\\da-fA-F\\s]+)\\}", "g");
    const regImages = rtfData.match(regexPicture);
    const images: Array<{hex: string, type: string}> = [];
    if (regImages) {
        for (const image of regImages) {
            let imageType;

            if (image.includes("\\pngblip")) {
                imageType = "image/png";
            } else if (image.includes("\\jpegblip")) {
                imageType = "image/jpeg";
            }

            if (imageType) {
                images.push({
                    hex: image.replace(regexPictureHeader, "").replace(/[^\da-fA-F]/g, ""),
                    type: imageType,
                });
            }
        }
    }

    const shapes: Array<{shape: Element, img: Element}> = [];
    walk(root, (child: Element) => {
        if (child.tagName === "V:SHAPE") {
            walk(child, (sub) => {
                if (sub.tagName === "V:IMAGEDATA") shapes.push({shape: child, img: sub});
            });
            return false;
        }
    });
    for (let i = 0; i < shapes.length; i++) {
        const img = document.createElement("img");
        const newSrc = "data:" + images[i]!.type + ";base64," + btoa((images[i]!.hex.match(/\w{2}/g) || []).map(char => {
            return String.fromCharCode(parseInt(char, 16));
        }).join(""));
        img.src = newSrc;
        img.title = shapes[i].img.getAttribute("title")!;
        shapes[i].shape.parentNode!.replaceChild(img, shapes[i].shape);
    }
};

const walk = (el: Element, fn: (el: Element) => boolean | void) => {
    const goNext = fn(el);
    if (goNext !== false)
        for (let i = 0; i < el.children.length; i++) {
            walk(el.children[i], fn);
        }
};
