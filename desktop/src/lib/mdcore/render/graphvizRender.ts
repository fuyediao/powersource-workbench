import {addScript} from "../util/addScript";

/** Fence language classes that should render as Graphviz DOT. */
const GRAPHVIZ_SELECTOR =
    ".language-graphviz, .language-dot, .language-digraph";

const graphvizRenderAdapter = {
    getCode: (el: Element) => el.textContent!,
    getElements: (el: HTMLElement | Document) =>
        el.querySelectorAll(GRAPHVIZ_SELECTOR),
};

type AuraGraphviz = {
    renderSVGElement: (code: string) => Promise<HTMLElement>;
};

/**
 * Render Graphviz fenced blocks (npm `@viz-js/viz` via Aura preload).
 *
 * @param element - Root to scan.
 */
export const graphvizRender = (element: HTMLElement) => {
    const graphvizElements = graphvizRenderAdapter.getElements(element);

    if (graphvizElements.length === 0) {
        return;
    }
    addScript("auraGraphVizScript").then(() => {
        const graphviz = (window as Window & { __AURA_GRAPHVIZ__?: AuraGraphviz }).__AURA_GRAPHVIZ__;
        if (!graphviz?.renderSVGElement) {
            return;
        }
        graphvizElements.forEach((e: Element) => {
            const code = graphvizRenderAdapter.getCode(e);
            if (e.parentElement!.classList.contains("aura-wysiwyg__pre")) {
                return;
            }

            if (e.getAttribute("data-processed")! === "true" || code.trim() === "") {
                return;
            }

            graphviz.renderSVGElement(code).then((result: HTMLElement) => {
                e.innerHTML = result.outerHTML;
            }).catch((error: Error) => {
                e.innerHTML = `graphviz render error: <br>${error}`;
                e.className = "aura-reset--error";
            });

            e.setAttribute("data-processed", "true");
        });
    });
};
