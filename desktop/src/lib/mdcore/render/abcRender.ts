import {addScript} from "../util/addScript";
const abcRenderAdapter = {
    getCode: (el: Element) => el.textContent!,
    getElements: (el: HTMLElement | Document) => el.querySelectorAll(".language-abc"),
};

declare const ABCJS: {
    renderAbc(element: HTMLElement, text: string): void;
};

/**
 * Render ABC music notation blocks using the npm-preloaded abcjs global.
 *
 * @param element - Root to search for ABC blocks.
 */
export const abcRender = (element: (HTMLElement | Document) = document) => {
    const abcElements = abcRenderAdapter.getElements(element);
    if (abcElements.length > 0) {
        addScript("auraAbcjsScript").then(() => {
            abcElements.forEach((item: Element) => {
                if (item.parentElement!.classList.contains("aura-wysiwyg__pre")) {
                    return;
                }
                if (item.getAttribute("data-processed")! === "true") {
                    return;
                }
                ABCJS.renderAbc(item as HTMLElement, abcRenderAdapter.getCode(item).trim());
                ;(item as HTMLElement).style.overflowX = "auto";
                item.setAttribute("data-processed", "true");
            });
        });
    }
};
