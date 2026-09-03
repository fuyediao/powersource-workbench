import {hasClosestBlock} from "../util/hasClosest";
import {getEditorRange, setRangeByWbr} from "../util/selection";
import {renderToc} from "./toc";

export const setHeading = (aura: IAura, tagName: string) => {
    const range = getEditorRange(aura);
    let blockElement = hasClosestBlock(range.startContainer);
    if (!blockElement) {
        blockElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
    }
    if (!blockElement && aura.wysiwyg.element.children.length === 0) {
        blockElement = aura.wysiwyg.element;
    }
    if (blockElement && !blockElement.classList.contains("aura-wysiwyg__block")) {
        range.insertNode(document.createElement("wbr"));
        // Firefox requires trim https://github.com/Vanessa219/aura/issues/207
        if (blockElement.innerHTML.trim() === "<wbr>") {
            // Firefox cursor misalignment https://github.com/Vanessa219/aura/issues/199 1
            blockElement.innerHTML = "<wbr><br>";
        }
        if (blockElement.tagName === "BLOCKQUOTE" || blockElement.classList.contains("aura-reset")) {
            blockElement.innerHTML = `<${tagName} data-block="0">${blockElement.innerHTML.trim()}</${tagName}>`;
        } else {
            blockElement.outerHTML = `<${tagName} data-block="0">${blockElement.innerHTML.trim()}</${tagName}>`;
        }
        setRangeByWbr(aura.wysiwyg.element, range);
        renderToc(aura);
    }
};

export const removeHeading = (aura: IAura) => {
    const range = getSelection()!.getRangeAt(0);
    let blockElement = hasClosestBlock(range.startContainer);
    if (!blockElement) {
        blockElement = range.startContainer.childNodes[range.startOffset] as HTMLElement;
    }
    if (blockElement) {
        range.insertNode(document.createElement("wbr"));
        blockElement.outerHTML = `<p data-block="0">${blockElement.innerHTML}</p>`;
        setRangeByWbr(aura.wysiwyg.element, range);
    }
};
