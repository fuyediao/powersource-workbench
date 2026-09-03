import katex from "katex";
import {addScript} from "../util/addScript";
import {addStyle} from "../util/addStyle";
import {code160to32} from "../util/misc";

const mathRenderAdapter = {
    getCode: (el: Element) => el.textContent!,
    getElements: (element: HTMLElement | Document) => element.querySelectorAll(".language-math"),
};

/**
 * Render math blocks with KaTeX (npm import — not a bare global in ESM).
 *
 * @param element - Root to search.
 * @param options - Math engine options.
 */
export const mathRender = (element: (HTMLElement | Document) = document, options?: { math?: IMath }) => {
    const mathElements = mathRenderAdapter.getElements(element);

    if (mathElements.length === 0) {
        return;
    }

    const defaultOptions = {
        math: {
            engine: "KaTeX" as const,
            inlineDigit: false,
            macros: {},
        },
    };

    if (options && options.math) {
        options.math =
            Object.assign({}, defaultOptions.math, options.math);
    }
    options = Object.assign({}, defaultOptions, options);

    addStyle("", "auraKatexStyle");
    void addScript("auraKatexScript").then(() => {
        void addScript("auraKatexChemScript").then(() => {
            mathElements.forEach((mathElement) => {
                if (mathElement.parentElement!.classList.contains("aura-wysiwyg__pre")) {
                    return;
                }
                if (mathElement.getAttribute("data-math")) {
                    return;
                }
                const math = code160to32(mathRenderAdapter.getCode(mathElement));
                mathElement.setAttribute("data-math", math);
                try {
                    const macros = (options.math?.macros ?? {}) as NonNullable<
                        NonNullable<Parameters<typeof katex.renderToString>[1]>["macros"]
                    >
                    mathElement.innerHTML = katex.renderToString(math, {
                        displayMode: mathElement.tagName === "DIV",
                        output: "html",
                        macros,
                    });
                } catch (e) {
                    mathElement.innerHTML = (e as Error).message;
                    mathElement.className = "language-math aura-reset--error";
                }

                mathElement.addEventListener("copy", (rawEvent) => {
                    const event = rawEvent as ClipboardEvent;
                    event.stopPropagation();
                    event.preventDefault();
                    const auraMathElement = (event.currentTarget as HTMLElement).closest(".language-math");
                    event.clipboardData!.setData("text/html", auraMathElement!.innerHTML);
                    event.clipboardData!.setData("text/plain",
                        auraMathElement!.getAttribute("data-math")!);
                });
            });
        });
    }).catch((error: unknown) => {
        console.error(error);
    });
};
