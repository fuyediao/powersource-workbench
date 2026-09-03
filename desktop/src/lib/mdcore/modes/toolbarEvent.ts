import {Constants} from "../util/constants";
import {listToggle} from "./fixBrowserBehavior";
import {hasClosestBlock, hasClosestByMatchTag} from "../util/hasClosest";
import {CODE_RENDER_SELECTOR, processCodeRender} from "../render/processCode";
import {getEditorRange, setRangeByWbr, setSelectionFocus} from "../util/selection";
import {afterRenderEvent} from "./afterRenderEvent";
import {highlightToolbar} from "./highlightToolbar";
import {getNextHTML, getPreviousHTML, splitElement} from "./inlineTag";

const cancelBES = (range: Range, aura: IAura, commandName: string) => {
    let element = range.startContainer.parentElement!;
    let jump = false;
    let lastTagName = "";
    let lastEndTagName = "";

    const splitHTML = splitElement(range);
    let lastBeforeHTML = splitHTML.beforeHTML;
    let lastAfterHTML = splitHTML.afterHTML;

    while (element && !jump) {
        let tagName = element.tagName;
        if (tagName === "STRIKE") {
            tagName = "S";
        }
        if (tagName === "I") {
            tagName = "EM";
        }
        if (tagName === "B") {
            tagName = "STRONG";
        }
        if (tagName === "S" || tagName === "STRONG" || tagName === "EM") {
            let insertHTML = "";
            let previousHTML = "";
            let nextHTML = "";
            if (element.parentElement!.getAttribute("data-block")! !== "0") {
                previousHTML = getPreviousHTML(element);
                nextHTML = getNextHTML(element);
            }

            if (lastBeforeHTML || previousHTML) {
                insertHTML = `${previousHTML}<${tagName}>${lastBeforeHTML}</${tagName}>`;
                lastBeforeHTML = insertHTML;
            }
            if ((commandName === "bold" && tagName === "STRONG") ||
                (commandName === "italic" && tagName === "EM") ||
                (commandName === "strikeThrough" && tagName === "S")) {
                // Cancel
                insertHTML += `${lastTagName}${Constants.ZWSP}<wbr>${lastEndTagName}`;
                jump = true;
            }

            if (lastAfterHTML || nextHTML) {
                lastAfterHTML = `<${tagName}>${lastAfterHTML}</${tagName}>${nextHTML}`;
                insertHTML += lastAfterHTML;
            }

            if (element.parentElement!.getAttribute("data-block")! !== "0") {
                element = element.parentElement!;
                element!.innerHTML = insertHTML;
            } else {
                element.outerHTML = insertHTML;
                element = element.parentElement!;
            }

            lastTagName = `<${tagName}>` + lastTagName;
            lastEndTagName = `</${tagName}>` + lastEndTagName;
        } else {
            jump = true;
        }
    }

    setRangeByWbr(aura.wysiwyg.element, range);
};

export const toolbarEvent = (aura: IAura, actionBtn: Element, event: Event) => {
    if (aura.wysiwyg.composingLock // Mac Chrome fires this after CJK IME end, duplicating last char https://github.com/Vanessa219/aura/issues/188
        && event instanceof CustomEvent // Ignore IME on button click https://github.com/Vanessa219/aura/issues/473
    ) {
        return;
    }

    let useHighlight = true;
    let useRender = true;
    if (aura.wysiwyg.element.querySelector("wbr")!) {
        aura.wysiwyg.element.querySelector("wbr")!.remove();
    }
    const range = getEditorRange(aura);

    let commandName = actionBtn.getAttribute("data-type")!;

    // Remove
    if (actionBtn.classList.contains("aura-menu--current")) {
        if (commandName === "strike") {
            commandName = "strikeThrough";
        }

        if (commandName === "quote") {
            let quoteElement = hasClosestByMatchTag(range.startContainer, "BLOCKQUOTE");
            if (!quoteElement) {
                quoteElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
            }
            if (quoteElement) {
                useHighlight = false;
                actionBtn.classList.remove("aura-menu--current");
                range.insertNode(document.createElement("wbr"));
                quoteElement.outerHTML = quoteElement.innerHTML.trim() === "" ?
                    `<p data-block="0">${quoteElement.innerHTML}</p>` : quoteElement.innerHTML;
                setRangeByWbr(aura.wysiwyg.element, range);
            }
        } else if (commandName === "inline-code") {
            let inlineCodeElement = hasClosestByMatchTag(range.startContainer, "CODE");
            if (!inlineCodeElement) {
                inlineCodeElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
            }
            if (inlineCodeElement) {
                inlineCodeElement.outerHTML = inlineCodeElement.innerHTML.replace(Constants.ZWSP, "") + "<wbr>";
                setRangeByWbr(aura.wysiwyg.element, range);
            }
        } else if (commandName === "link") {
            if (!range.collapsed) {
                document.execCommand("unlink", false, "");
            } else {
                range.selectNode(range.startContainer.parentElement!);
                document.execCommand("unlink", false, "");
            }
        } else if (commandName === "check" || commandName === "list" || commandName === "ordered-list") {
            listToggle(aura, range, commandName);
            setRangeByWbr(aura.wysiwyg.element, range);
            useHighlight = false;
            actionBtn.classList.remove("aura-menu--current");
        } else {
            // bold, italic, strike
            useHighlight = false;
            actionBtn.classList.remove("aura-menu--current");
            if (range.toString() === "") {
                cancelBES(range, aura, commandName);
            } else {
                document.execCommand(commandName, false, "");
            }
        }
    } else {
        // Add
        if (aura.wysiwyg.element.childNodes.length === 0) {
            aura.wysiwyg.element.innerHTML = '<p data-block="0"><wbr></p>';
            setRangeByWbr(aura.wysiwyg.element, range);
        }

        let blockElement = hasClosestBlock(range.startContainer);
        if (commandName === "quote") {
            if (!blockElement) {
                blockElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
            }

            if (blockElement) {
                useHighlight = false;
                actionBtn.classList.add("aura-menu--current");
                range.insertNode(document.createElement("wbr"));

                const liElement = hasClosestByMatchTag(range.startContainer, "LI");
                // Soft newline in li
                if (liElement && blockElement.contains(liElement)) {
                    liElement.innerHTML = `<blockquote data-block="0">${liElement.innerHTML}</blockquote>`;
                } else {
                    blockElement.outerHTML = `<blockquote data-block="0">${blockElement.outerHTML}</blockquote>`;
                }
                setRangeByWbr(aura.wysiwyg.element, range);
            }
        } else if (commandName === "check" || commandName === "list" || commandName === "ordered-list") {
            listToggle(aura, range, commandName, false);
            setRangeByWbr(aura.wysiwyg.element, range);
            useHighlight = false;
            actionBtn.classList.add("aura-menu--current");
        } else if (commandName === "inline-code") {
            if (range.toString() === "") {
                const node = document.createElement("code");
                node.textContent! = Constants.ZWSP;
                range.insertNode(node);
                range.setStart(node.firstChild!, 1);
                range.collapse(true);
                setSelectionFocus(range);
            } else if (range.startContainer.nodeType === 3) {
                const node = document.createElement("code");
                range.surroundContents(node);
                range.insertNode(node);
                setSelectionFocus(range);
            }
            actionBtn.classList.add("aura-menu--current");
        } else if (commandName === "code") {
            const node = document.createElement("div");
            node.className = "aura-wysiwyg__block";
            node.setAttribute("data-type", "code-block");
            node.setAttribute("data-block", "0");
            node.setAttribute("data-marker", "```");
            if (range.toString() === "") {
                node.innerHTML = "<pre><code><wbr>\n</code></pre>";
            } else {
                node.innerHTML = `<pre><code>${range.toString()}<wbr></code></pre>`;
                range.deleteContents();
            }
            range.insertNode(node);
            if (blockElement) {
                blockElement.outerHTML = aura.markdown.spinAuraDom(blockElement.outerHTML);
            }
            setRangeByWbr(aura.wysiwyg.element, range);
            aura.wysiwyg.element.querySelectorAll(CODE_RENDER_SELECTOR).forEach(
                (item) => {
                    processCodeRender(item as HTMLElement, aura);
                });
            actionBtn.classList.add("aura-menu--disabled");
        } else if (commandName === "link") {
            if (range.toString() === "") {
                const aElement = document.createElement("a");
                aElement.innerText = Constants.ZWSP;
                range.insertNode(aElement);
                range.setStart(aElement.firstChild!, 1);
                range.collapse(true);
                setSelectionFocus(range);
            } else {
                const node = document.createElement("a");
                node.setAttribute("href", "");
                node.innerHTML = range.toString();
                range.surroundContents(node);
                range.insertNode(node);
                setSelectionFocus(range);
            }
            useHighlight = false;
            actionBtn.classList.add("aura-menu--current");
        } else if (commandName === "table") {
            let tableHTML = `<table data-block="0"><thead><tr><th>col1<wbr></th><th>col2</th><th>col3</th></tr></thead><tbody><tr><td> </td><td> </td><td> </td></tr><tr><td> </td><td> </td><td> </td></tr></tbody></table>`;
            if (range.toString().trim() === "") {
                if (blockElement && blockElement.innerHTML.trim().replace(Constants.ZWSP, "") === "") {
                    blockElement.outerHTML = tableHTML;
                } else {
                    document.execCommand("insertHTML", false, tableHTML);
                }
                range.selectNode(aura.wysiwyg.element.querySelector("wbr")!.previousSibling!);
                aura.wysiwyg.element.querySelector("wbr")!.remove();
                setSelectionFocus(range);
            } else {
                tableHTML = `<table data-block="0"><thead><tr>`;
                const tableText = range.toString().split("\n");
                const delimiter = tableText[0].split(",").length > tableText[0].split("\t").length ? "," : "\t";

                tableText.forEach((rows, index) => {
                    if (index === 0) {
                        rows.split(delimiter).forEach((header, subIndex) => {
                            if (subIndex === 0) {
                                tableHTML += `<th>${header}<wbr></th>`;
                            } else {
                                tableHTML += `<th>${header}</th>`;
                            }
                        });
                        tableHTML += "</tr></thead>";
                    } else {
                        if (index === 1) {
                            tableHTML += "<tbody><tr>";
                        } else {
                            tableHTML += "<tr>";
                        }
                        rows.split(delimiter).forEach((cell) => {
                            tableHTML += `<td>${cell}</td>`;
                        });
                        tableHTML += `</tr>`;
                    }
                });
                tableHTML += "</tbody></table>";
                document.execCommand("insertHTML", false, tableHTML);
                setRangeByWbr(aura.wysiwyg.element, range);
            }
            useHighlight = false;
            actionBtn.classList.add("aura-menu--disabled");
        } else if (commandName === "line") {
            if (blockElement) {
                const hrHTML = '<hr data-block="0"><p data-block="0"><wbr>\n</p>';
                if (blockElement.innerHTML.trim() === "") {
                    blockElement.outerHTML = hrHTML;
                } else {
                    blockElement.insertAdjacentHTML("afterend", hrHTML);
                }
                setRangeByWbr(aura.wysiwyg.element, range);
            }
        } else {
            // bold, italic, strike
            useHighlight = false;
            actionBtn.classList.add("aura-menu--current");

            if (commandName === "strike") {
                commandName = "strikeThrough";
            }
            if (range.toString() === "" && (commandName === "bold" || commandName === "italic" || commandName === "strikeThrough")) {
                let tagName = "strong";
                if (commandName === "italic") {
                    tagName = "em";
                } else if (commandName === "strikeThrough") {
                    tagName = "s";
                }
                const node = document.createElement(tagName);
                node.textContent! = Constants.ZWSP;

                range.insertNode(node);

                if (node.previousSibling! && node.previousSibling!.textContent! === Constants.ZWSP) {
                    // Remove zwsp in deep nesting
                    node.previousSibling!.textContent! = "";
                }

                range.setStart(node.firstChild!, 1);
                range.collapse(true);
                setSelectionFocus(range);
            } else {
                document.execCommand(commandName, false, "");
            }
        }
    }

    if (useHighlight) {
        highlightToolbar(aura);
    }

    if (useRender) {
        afterRenderEvent(aura);
    }
};
