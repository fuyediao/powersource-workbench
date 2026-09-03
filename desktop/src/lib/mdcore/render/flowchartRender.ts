import {addScript} from "../util/addScript";
const flowchartRenderAdapter = {
    getCode: (el: Element) => el.textContent!,
    getElements: (el: HTMLElement | Document) => el.querySelectorAll(".language-flowchart"),
};

declare const flowchart: {
    parse(text: string): { drawSVG: (type: HTMLElement) => void };
};

/**
 * Render flowchart.js blocks via the npm-preloaded global.
 *
 * @param element - Root to search.
 */
export const flowchartRender = (element: HTMLElement) => {
    const flowchartElements = flowchartRenderAdapter.getElements(element);
    if (flowchartElements.length === 0) {
        return;
    }
    addScript("auraFlowchartScript").then(() => {
        flowchartElements.forEach((item: Element) => {
            if (item.getAttribute("data-processed")! === "true") {
                return;
            }
            const flowchartObj = flowchart.parse(flowchartRenderAdapter.getCode(item));
            item.innerHTML = "";
            flowchartObj.drawSVG(item as HTMLElement);
            item.setAttribute("data-processed", "true");
        });
    });
};
