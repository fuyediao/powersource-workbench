import {abcRender} from "./abcRender";
import {chartRender} from "./chartRender";
import {codeRender} from "./codeRender";
import {flowchartRender} from "./flowchartRender";
import {graphvizRender} from "./graphvizRender";
import {highlightRender} from "./highlightRender";
import {lilypondRender} from "./lilypondRender";
import {mathRender} from "./mathRender";
import {mermaidRender} from "./mermaidRender";
import {markmapRender} from "./markmapRender";
import {mindmapRender} from "./mindmapRender";
import {plantumlRender} from "./plantumlRender";
import {SMILESRender} from "./SMILESRender";
import {svgRender} from "./svgRender";

/** Unprocessed visual previews and directly editable code surfaces. */
export const CODE_RENDER_SELECTOR =
    ".aura-wysiwyg__preview[data-render='2'], " +
    ".aura-wysiwyg__code[data-render='2']";

export const processPasteCode = (html: string, text: string) => {
    const tempElement = document.createElement("div");
    tempElement.innerHTML = html;
    let isCode = false;
    if (tempElement.childElementCount === 1 &&
        (tempElement.lastElementChild! as HTMLElement).style.fontFamily.indexOf("monospace") > -1) {
        // VS Code
        isCode = true;
    }
    const pres = tempElement.querySelectorAll("pre");
    if (tempElement.childElementCount === 1 && pres.length === 1
        && pres[0].className !== "aura-wysiwyg") {
        // IDE
        isCode = true;
    }
    if (html.indexOf('\n<p class="p1">') === 0) {
        // Xcode
        isCode = true;
    }
    if (tempElement.childElementCount === 1 && tempElement.firstElementChild!.tagName === "TABLE" &&
        tempElement.querySelector(".line-number")! && tempElement.querySelector(".line-content")!) {
        // Web page source
        isCode = true;
    }

    if (isCode) {
        const code = text || html;
        if (/\n/.test(code) || pres.length === 1) {
            return `<div class="aura-wysiwyg__block" data-block="0" data-type="code-block"><pre><code>${
                code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}<wbr></code></pre></div>`;
        }
        return `<code>${code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code><wbr>`;
    }
    return false;
};

/** Language id to diagram/code renderer. Absent ids fall back to highlight.js. */
const CODE_BLOCK_HANDLERS: Record<string, (preview: HTMLElement, aura: IAura) => void> = {
    abc: (preview) => abcRender(preview),
    lilypond: (preview) => lilypondRender(preview),
    lily: (preview) => lilypondRender(preview),
    mermaid: (preview, aura) => mermaidRender(preview, aura.options.theme),
    smiles: (preview, aura) => SMILESRender(preview, aura.options.theme),
    markmap: (preview) => markmapRender(preview),
    flowchart: (preview) => flowchartRender(preview),
    echarts: (preview, aura) => chartRender(preview, aura.options.theme),
    mindmap: (preview, aura) => mindmapRender(preview, aura.options.theme),
    plantuml: (preview, aura) => plantumlRender(preview, aura.options.theme),
    // Common PlantUML fence alias.
    puml: (preview, aura) => plantumlRender(preview, aura.options.theme),
    graphviz: (preview) => graphvizRender(preview),
    // Common DOT fence aliases used by Typora / docs / plugins.
    dot: (preview) => graphvizRender(preview),
    digraph: (preview) => graphvizRender(preview),
    math: (preview, aura) => mathRender(preview, {math: aura.options.preview.math}),
    svg: (preview) => svgRender(preview),
};

/**
 * Read the language identifier from a fenced code panel.
 *
 * @param panel - Source or preview panel containing a code element.
 * @returns Normalized language identifier.
 */
const getCodeLanguage = (panel: HTMLElement): string => {
    const code = panel.querySelector("code");
    const languageClass = Array.from(code?.classList ?? [])
        .find((name) => name.startsWith("language-"));
    return languageClass?.slice("language-".length).toLowerCase() ?? "";
};

/**
 * Render or highlight one fenced-code panel.
 *
 * @param panel - Visual preview or directly editable code panel.
 * @param aura - Active editor instance.
 */
export const processCodeRender = (panel: HTMLElement, aura: IAura) => {
    if (!panel) {
        return;
    }
    if (panel.parentElement!.getAttribute("data-type")! === "html-block") {
        // Standalone SVG HTML blocks reuse the fenced-svg sanitizer / preview.
        if (panel.querySelector("code.language-svg")) {
            svgRender(panel);
        }
        panel.setAttribute("data-render", "1");
        return;
    }
    // Inline / block math use `.language-math` (often a span/div, not `code.language-math`).
    if (panel.querySelector(".language-math")) {
        mathRender(panel, {math: aura.options.preview.math});
        panel.setAttribute("data-render", "1");
        return;
    }
    const language = getCodeLanguage(panel);
    const customRenderer = aura.options.customRenders.find(
        (item) => item.language.toLowerCase() === language,
    );
    if (panel.classList.contains("aura-wysiwyg__code")) {
        highlightRender(Object.assign({}, aura.options.preview.hljs), panel);
        codeRender(panel, aura.options.preview.hljs);
        panel.setAttribute("data-render", "1");
        return;
    }

    const handler = CODE_BLOCK_HANDLERS[language];
    if (handler) {
        handler(panel, aura);
    } else if (customRenderer) {
        customRenderer.render(panel, aura);
    } else {
        highlightRender(Object.assign({}, aura.options.preview.hljs), panel);
        codeRender(panel, aura.options.preview.hljs);
    }

    panel.setAttribute("data-render", "1");
};
