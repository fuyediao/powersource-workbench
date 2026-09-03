const FORBIDDEN_SVG_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "FOREIGNOBJECT",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "ANIMATE",
    "ANIMATEMOTION",
    "ANIMATETRANSFORM",
    "SET",
    "HANDLER",
]);

const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);
const EXTERNAL_CSS_URL = /url\(\s*(['"]?)(?!#)[^)]+\1\s*\)/i;

/**
 * Sanitize an SVG document before inserting it into the editor preview.
 *
 * @param source - Raw fenced SVG source.
 * @returns Safe SVG markup, or an empty string when the source is invalid.
 */
export const sanitizeSvgMarkup = (source: string): string => {
    const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement.tagName.toLowerCase() !== "svg") {
        return "";
    }

    parsed.querySelectorAll("*").forEach((element) => {
        if (FORBIDDEN_SVG_TAGS.has(element.localName.toUpperCase())) {
            element.remove();
            return;
        }
        Array.from(element.attributes).forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            if (name.startsWith("on")) {
                element.removeAttribute(attribute.name);
                return;
            }
            if (URL_ATTRIBUTES.has(name) && !attribute.value.trim().startsWith("#")) {
                element.removeAttribute(attribute.name);
                return;
            }
            if (name === "style" && EXTERNAL_CSS_URL.test(attribute.value)) {
                element.removeAttribute(attribute.name);
            }
        });
    });

    return new XMLSerializer().serializeToString(parsed.documentElement);
};

/**
 * Render a fenced `svg` code block into its WYSIWYG preview pane.
 *
 * @param preview - Preview pane containing the escaped source code.
 */
export const svgRender = (preview: HTMLElement): void => {
    const code = preview.querySelector("code");
    const svg = sanitizeSvgMarkup(code?.textContent ?? "");
    preview.classList.add("aura-svg-preview");
    if (svg && code) {
        code.innerHTML = svg;
    }
};
