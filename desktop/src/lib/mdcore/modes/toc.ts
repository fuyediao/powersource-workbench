import {buildOutlineHTML} from "../render/outlineRender";
import {mathRender} from "../render/mathRender";
import {execAfterRender, insertAfterBlock, insertBeforeBlock} from "./fixBrowserBehavior";
import {hasClosestByClassName, hasClosestByMatchTag} from "../util/hasClosest";
import {getSelectPosition} from "../util/selection";

export const renderToc = (aura: IAura) => {
    const editorElement = aura[aura.currentMode].element;
    let tocHTML = buildOutlineHTML(aura);
    if (tocHTML === "") {
        tocHTML = "[ToC]";
    }
    editorElement.querySelectorAll('[data-type="toc-block"]').forEach((item: Element) => {
        item.innerHTML = tocHTML;
        mathRender(item as HTMLElement, {
            math: aura.options.preview.math,
        });
    });
};

export const clickToc = (event: MouseEvent & { target: HTMLElement }, aura: IAura) => {
    const spanElement = hasClosestByMatchTag(event.target, "SPAN");
    if (spanElement && hasClosestByClassName(spanElement, "aura-toc")) {
        const headingElement = aura[aura.currentMode].element.querySelector("#" + spanElement.getAttribute("data-target-id")!)! as HTMLElement;
        if (headingElement) {
            if (aura.options.height === "auto") {
                let windowScrollY = headingElement.offsetTop + aura.element.offsetTop;
                window.scrollTo(window.scrollX, windowScrollY);
            } else {
                if (aura.element.offsetTop < window.scrollY) {
                    window.scrollTo(window.scrollX, aura.element.offsetTop);
                }
                aura[aura.currentMode].element.scrollTop = headingElement.offsetTop;
            }
        }
        return;
    }
};

export const keydownToc = (blockElement: HTMLElement, aura: IAura, event: KeyboardEvent, range: Range) => {
    // No element before toc; insert empty block
    if (blockElement.previousElementSibling! &&
        blockElement.previousElementSibling!.classList.contains("aura-toc")) {
        if (event.key === "Backspace" &&
            getSelectPosition(blockElement, aura[aura.currentMode].element, range).start === 0) {
            blockElement.previousElementSibling!.remove();
            execAfterRender(aura);
            return true;
        }
        if (insertBeforeBlock(aura, event, range, blockElement, blockElement.previousElementSibling! as HTMLElement)) {
            return true;
        }
    }
    // No element after toc; insert empty block
    if (blockElement.nextElementSibling! &&
        blockElement.nextElementSibling!.classList.contains("aura-toc")) {
        if (event.key === "Delete" &&
            getSelectPosition(blockElement, aura[aura.currentMode].element, range).start
            >= blockElement.textContent!.trimRight().length) {
            blockElement.nextElementSibling!.remove();
            execAfterRender(aura);
            return true;
        }
        if (insertAfterBlock(aura, event, range, blockElement, blockElement.nextElementSibling! as HTMLElement)) {
            return true;
        }
    }
    // Delete toc
    if (event.key === "Backspace" || event.key === "Delete") {
        const tocElement = hasClosestByClassName(range.startContainer, "aura-toc");
        if (tocElement) {
            tocElement.remove();
            execAfterRender(aura);
            return true;
        }
    }
};
