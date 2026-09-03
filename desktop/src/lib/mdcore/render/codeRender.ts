import {Constants} from "../util/constants";
import {isRenderedCodeLanguage} from "@/lib/mdtohtml/rendered-code-languages";

/**
 * Inject an empty hover-menu slot above highlighted fenced-code previews.
 * The React shell fills the slot via `preview.hljs.renderMenu` (copy control).
 *
 * @param element - Root to search for `pre > code`.
 * @param option - Optional highlight.js options (custom menu hook).
 */
export const codeRender = (element: HTMLElement, option?: IHljs) => {
    Array.from<HTMLElement>(element.querySelectorAll("pre > code")).filter((e) => {
        if (e.parentElement!.classList.contains("aura-wysiwyg__pre")) {
            return false;
        }
        const languageClass = Array.from(e.classList)
            .find((name) => name.startsWith("language-"));
        if (
            isRenderedCodeLanguage(
                languageClass?.slice("language-".length) ?? "",
            )
        ) {
            return false;
        }

        if (e.style.maxHeight.indexOf("px") > -1) {
            return false;
        }

        return true;
    }).forEach((e) => {
        const divElement = document.createElement("div");
        divElement.className = "aura-copy";
        divElement.contentEditable = "false";
        e.before(divElement);
        e.style.maxHeight = (window.outerHeight - 40) + "px";
        const isEditableCode = e.parentElement!.classList
            .contains("aura-wysiwyg__code");
        if (!isEditableCode) {
            // Keep a ZWSP after the code so caret navigation past the block stays stable.
            e.insertAdjacentHTML("afterend", `<span style="position: absolute">${Constants.ZWSP}</span>`);
        }
        if (option?.renderMenu) {
            option.renderMenu(e, divElement);
        }
    });
};
