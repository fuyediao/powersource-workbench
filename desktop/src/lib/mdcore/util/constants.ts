declare const AURA_VERSION: string;

const _AURA_VERSION = AURA_VERSION;

export {_AURA_VERSION as AURA_VERSION};

/**
 * Bundled highlight.js themes (npm URLs via `installEditorVendors`).
 * Unknown ids fall back to `github`.
 */
export abstract class Constants {
    public static readonly ZWSP: string = "\u200b";
    public static readonly DROP_EDITOR: string = "application/editor";
    public static readonly MOBILE_WIDTH: number = 520;
    public static readonly CODE_THEME: string[] = [
        "github",
        "github-dark",
        "atom-one-light",
        "atom-one-dark",
        "vs",
        "vs2015",
        "xcode",
        "monokai",
    ];
    public static readonly MARKDOWN_OPTIONS = {
        autoSpace: false,
        gfmAutoLink: true,
        codeBlockPreview: true,
        fixTermTypo: false,
        footnotes: true,
        linkBase: "",
        linkPrefix: "",
        listStyle: false,
        mark: true,
        mathBlockPreview: true,
        paragraphBeginningSpace: false,
        sanitize: true,
        sub: true,
        sup: true,
        toc: false,
    };
    public static readonly HLJS_OPTIONS = {
        enable: true,
        lineNumber: false,
        defaultLang: "",
        style: "github",
    };
    public static readonly MATH_OPTIONS: IMath = {
        engine: "KaTeX",
        inlineDigit: false,
        macros: {},
    };
}
