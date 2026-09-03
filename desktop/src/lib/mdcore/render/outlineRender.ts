import {hasClosestByHeadings} from "../util/hasClosestByHeadings";
import {createMarkdownEngineApi} from "@/lib/mdtohtml";
import {
    outlineActionIconSvgHtml,
    outlineLeafSpacerSvgHtml,
} from "@/icons/AllIcons";
import {mathRender} from "./mathRender";

/**
 * Build in-document ToC / outline HTML for the active editor surface.
 * (Panel UI was removed; shell sidebar owns navigation outline.)
 *
 * @param aura - Editor instance.
 * @returns Nested list HTML, or empty string when there are no headings.
 */
export const buildOutlineHTML = (aura: IAura): string => {
    const sink = document.createElement("div");
    return outlineRender(aura[aura.currentMode].element, sink, aura);
};

export const outlineRender = (contentElement: HTMLElement, targetElement: Element, aura?: IAura) => {
    let tocHTML = "";
    const ids: string[] = [];
    Array.from(contentElement.children).forEach((item: Element, index: number) => {
        if (hasClosestByHeadings(item)) {
            if (aura) {
                const lastIndex = item.id.lastIndexOf("_");
                item.id = item.id.substring(0, lastIndex === -1 ? undefined : lastIndex) + "_" + index;
            }
            ids.push(item.id);
            tocHTML += item.outerHTML.replace("<wbr>", "");
        }
    });
    if (tocHTML === "") {
        targetElement.innerHTML = "";
        return "";
    }
    const tempElement = document.createElement("div");
    if (aura) {
        aura.markdown.setToc(true);
        tempElement.innerHTML = aura.markdown.spinAuraDom("<p>[ToC]</p>" + tocHTML);
        aura.markdown.setToc(aura.options.preview.markdown.toc);
    } else {
        targetElement.classList.add("aura-outline");
        const markdown = createMarkdownEngineApi({toc: true});
        tempElement.innerHTML = markdown.spinAuraDom("<p>[ToC]</p>" + tocHTML);
    }
    const headingsElement = tempElement.firstElementChild!.querySelectorAll("li > span[data-target-id]");
    headingsElement.forEach((item, index) => {
        if (item.nextElementSibling! && item.nextElementSibling!.tagName === "UL") {
            item.innerHTML = `${outlineActionIconSvgHtml()}<span>${item.innerHTML}</span>`;
        } else {
            item.innerHTML = `${outlineLeafSpacerSvgHtml()}<span>${item.innerHTML}</span>`;
        }
        item.setAttribute("data-target-id", ids[index]);
    });
    tocHTML = tempElement.firstElementChild!.innerHTML;
    if (headingsElement.length === 0) {
        targetElement.innerHTML = "";
        return tocHTML;
    }
    targetElement.innerHTML = tocHTML;
    if (aura) {
        mathRender(targetElement as HTMLElement, {
            math: aura.options.preview.math,
        });
    }
    targetElement.firstElementChild!.addEventListener("click", (event: Event) => {
        let target = event.target as HTMLElement;
        while (target && !target.isEqualNode(targetElement)) {
            if (target.classList.contains("aura-outline__action")) {
                if (target.classList.contains("aura-outline__action--close")) {
                    target.classList.remove("aura-outline__action--close");
                    target.parentElement!.nextElementSibling!.setAttribute("style", "display:block");
                } else {
                    target.classList.add("aura-outline__action--close");
                    target.parentElement!.nextElementSibling!.setAttribute("style", "display:none");
                }
                event.preventDefault();
                event.stopPropagation();
                break;
            } else if (target.getAttribute("data-target-id")!) {
                event.preventDefault();
                event.stopPropagation();
                const idElement = document.getElementById(target.getAttribute("data-target-id")!);
                if (!idElement) {
                    return;
                }
                if (aura) {
                    if (aura.options.height === "auto") {
                        let windowScrollY = idElement.offsetTop + aura.element.offsetTop;
                        window.scrollTo(window.scrollX, windowScrollY);
                    } else {
                        if (aura.element.offsetTop < window.scrollY) {
                            window.scrollTo(window.scrollX, aura.element.offsetTop);
                        }
                        contentElement.scrollTop = idElement.offsetTop;
                    }
                } else {
                    window.scrollTo(window.scrollX, idElement.offsetTop);
                }
                break;
            }
            target = target.parentElement!;
        }
    });
    return tocHTML;
};
