import {addScript} from "../util/addScript";
const SMILESRenderAdapter = {
    getCode: (el: Element) => el.textContent!,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-smiles"),
};
import {genUUID} from "../util/misc";

declare class SmiDrawer {
    constructor(moleculeOptions: IObject, reactionOptions: IObject);

    public draw: (code: string, id: string, theme?: string) => void;
}

/**
 * Render SMILES chemistry blocks via the npm-preloaded SmiDrawer global.
 *
 * @param element - Root to search.
 * @param theme - Editor chrome theme.
 */
export const SMILESRender = (element: (HTMLElement | Document) = document, theme: string) => {
    const SMILESElements = SMILESRenderAdapter.getElements(element);
    if (SMILESElements.length > 0) {
        addScript("auraAbcjsScript").then(() => {
            const sd = new SmiDrawer({}, {});
            SMILESElements.forEach((item: Element) => {
                const code = SMILESRenderAdapter.getCode(item).trim();
                if (item.getAttribute("data-processed")! === "true" || code.trim() === "") {
                    return;
                }
                const id = "smiles" + genUUID();
                item.innerHTML = `<svg id="${id}"></svg>`;
                sd.draw(code, "#" + id, theme === "dark" ? "dark" : undefined);
                item.setAttribute("data-processed", "true");
            });
        });
    }
};
