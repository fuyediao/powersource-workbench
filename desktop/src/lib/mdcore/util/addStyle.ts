/**
 * Load a stylesheet from local/npm-mapped URLs only (no CDN).
 *
 * @param urlOrTheme - Unused legacy URL, or highlight.js theme id when `id` is `auraHljsStyle`.
 * @param id - Link/style element id.
 */
export const addStyle = (urlOrTheme: string, id: string): void => {
    if (document.getElementById(id)) {
        return;
    }
    const w = window as Window & {
        __AURA_PRELOADED_STYLE_IDS__?: Set<string> | Record<string, boolean>;
        __AURA_STYLE_URLS__?: Record<string, string>;
        __AURA_HLJS_STYLE_URLS__?: Record<string, string>;
    };

    const preloaded = w.__AURA_PRELOADED_STYLE_IDS__;
    const isPreloaded =
        preloaded instanceof Set ? preloaded.has(id) : !!preloaded?.[id];
    if (isPreloaded && id !== "auraHljsStyle") {
        const styleElement = document.createElement("style");
        styleElement.id = id;
        document.head.appendChild(styleElement);
        return;
    }

    let href = w.__AURA_STYLE_URLS__?.[id] || "";
    if (id === "auraHljsStyle" && w.__AURA_HLJS_STYLE_URLS__) {
        const fromPath = /styles\/([^/?#]+)\.min\.css/.exec(urlOrTheme)?.[1];
        const theme = fromPath || urlOrTheme || "github";
        href =
            w.__AURA_HLJS_STYLE_URLS__[theme] ||
            w.__AURA_HLJS_STYLE_URLS__.github ||
            href;
    }

    if (!href) {
        return;
    }

    const styleElement = document.createElement("link");
    styleElement.id = id;
    styleElement.rel = "stylesheet";
    styleElement.type = "text/css";
    styleElement.href = href;
    document.getElementsByTagName("head")[0].appendChild(styleElement);
};
