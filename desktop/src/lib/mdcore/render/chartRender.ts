import {addScript} from "../util/addScript";
const chartRenderAdapter = {
    getCode: (el: HTMLElement) => el.innerText,
    getElements: (el: HTMLElement | Document) => el.querySelectorAll(".language-echarts"),
};
import {looseJsonParse} from "../util/misc";

declare const echarts: {
    init(element: HTMLElement, theme?: string): IEChart;
};

/**
 * Render ECharts option blocks via the npm-preloaded echarts global.
 *
 * @param element - Root to search.
 * @param theme - Editor chrome theme (`dark` enables the dark echarts theme).
 */
export const chartRender = (element: (HTMLElement | Document) = document, theme: string) => {
    const echartsElements = chartRenderAdapter.getElements(element);
    if (echartsElements.length > 0) {
        addScript("auraEchartsScript").then(() => {
            echartsElements.forEach(async (el) => {
                const e = el as HTMLDivElement;
                if (e.parentElement!.classList.contains("aura-wysiwyg__pre")) {
                    return;
                }

                const text = chartRenderAdapter.getCode(e).trim();
                if (!text) {
                    return;
                }
                try {
                    if (e.getAttribute("data-processed")! === "true") {
                        return;
                    }
                    const option = await looseJsonParse(text);
                    echarts.init(e, theme === "dark" ? "dark" : undefined).setOption(option);
                    e.setAttribute("data-processed", "true");
                } catch (error) {
                    e.className = "aura-reset--error";
                    e.innerHTML = `echarts render error: <br>${error}`;
                }
            });
        });
    }
};
