import {flagRender} from "../render/flagRender";
import {CODE_RENDER_SELECTOR, processCodeRender} from "../render/processCode";
import {resetDocumentFromSource} from "../document/markdown-document";
import {afterRenderEvent} from "./afterRenderEvent";

export const renderDomByMd = (aura: IAura, md: string, options = {
    enableAddUndoStack: true,
    enableHint: false,
}) => {
    const editorElement = aura.wysiwyg.element;
    editorElement.innerHTML = aura.markdown.markdownToAuraDom(md);

    editorElement.querySelectorAll(CODE_RENDER_SELECTOR).forEach((item: Element) => {
        processCodeRender(item as HTMLElement, aura);
        if (item.classList.contains("aura-wysiwyg__preview")) {
            item.previousElementSibling!.setAttribute("style", "display:none");
        }
    });

    flagRender(editorElement);
    // Seed the source-of-truth store from the loaded text (blocks stay verbatim).
    resetDocumentFromSource(aura, md);
    afterRenderEvent(aura, options);
};
