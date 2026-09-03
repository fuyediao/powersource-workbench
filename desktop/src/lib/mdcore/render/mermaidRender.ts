import {addScript} from "../util/addScript";
const mermaidRenderAdapter = {
    getCode: (el: Element) => el.textContent!,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-mermaid"),
};
import {genUUID} from "../util/misc";

declare const mermaid: {
    initialize(options: any): void,
    render(id: string, text: string): { svg: string }
};

/**
 * Render Mermaid diagrams via the npm-preloaded mermaid global.
 *
 * @param element - Root to search.
 * @param theme - Editor chrome theme.
 */
export const mermaidRender = (element: (HTMLElement | Document) = document, theme: string) => {
    const mermaidElements = mermaidRenderAdapter.getElements(element);
    if (mermaidElements.length === 0) {
        return;
    }
    addScript("auraMermaidScript").then(() => {
        const config: any = {
            securityLevel: "loose",
            altFontFamily: "sans-serif",
            fontFamily: "sans-serif",
            startOnLoad: false,
            flowchart: {
                htmlLabels: true,
                useMaxWidth: !0
            },
            sequence: {
                useMaxWidth: true,
                diagramMarginX: 8,
                diagramMarginY: 8,
                boxMargin: 8,
                showSequenceNumbers: true
            },
            gantt: {
                leftPadding: 75,
                rightPadding: 20
            },
            // Mermaid 11.16 ships treeView with showIcons:false; enable the
            // built-in folder/file icon pack so treeView-beta matches docs.
            treeView: {
                showIcons: true,
            },
        };
        if (theme === "dark") {
            config.theme = "dark";
        }
        mermaid.initialize(config);
        mermaidElements.forEach(async (item) => {
            const code = mermaidRenderAdapter.getCode(item);
            if (item.getAttribute("data-processed")! === "true" || code.trim() === "") {
                return;
            }
            const id = "mermaid" + genUUID();
            try {
                const mermaidData = await mermaid.render(id, item.textContent!);
                item.innerHTML = mermaidData.svg;
            } catch (e) {
                const errorElement = document.querySelector("#" + id);
                const message = e instanceof Error ? e.message : String(e);
                if (errorElement) {
                    item.innerHTML = `${errorElement.outerHTML}<br>
<div style="text-align: left"><small>${message.replace(/\n/, "<br>")}</small></div>`;
                    errorElement.parentElement?.remove();
                } else {
                    item.innerHTML =
                        `<div style="text-align: left" class="aura-reset--error">` +
                        `<small>${message.replace(/\n/g, "<br>")}</small></div>`;
                }
            }
            item.setAttribute("data-processed", "true");
        });
    });
};
