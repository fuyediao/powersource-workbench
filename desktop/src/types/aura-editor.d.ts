/// <reference types="vite/client" />

declare module "*.svg";

declare module "*.png";

declare module "*.js?url" {
    const url: string;
    export default url;
}

declare module "*.css?url" {
    const url: string;
    export default url;
}

declare module "@plantuml/core" {
    /**
     * Render PlantUML into a DOM element by id.
     *
     * @param lines - Source lines.
     * @param targetId - Element id.
     * @param options - Optional dark mode.
     */
    export function render(
        lines: string[],
        targetId: string,
        options?: { dark?: boolean },
    ): void

    /**
     * Render PlantUML to an SVG string via callbacks.
     *
     * @param lines - Source lines.
     * @param onSuccess - Receives SVG markup.
     * @param onError - Receives an error message.
     */
    export function renderToString(
        lines: string[],
        onSuccess: (svg: string) => void,
        onError: (message: string) => void,
    ): void
}

declare module "@plantuml/core/viz-global.js?url" {
    const url: string
    export default url
}

declare module "flowchart.js" {
    const flowchart: {
        parse(text: string): { drawSVG: (element: HTMLElement) => void };
    };
    export default flowchart;
}

declare module "smiles-drawer" {
    const SmilesDrawer: {
        SmiDrawer?: new (
            moleculeOptions: Record<string, unknown>,
            reactionOptions: Record<string, unknown>,
        ) => { draw: (code: string, id: string, theme?: string) => void };
        Drawer?: new (
            moleculeOptions: Record<string, unknown>,
            reactionOptions: Record<string, unknown>,
        ) => { draw: (code: string, id: string, theme?: string) => void };
    };
    export default SmilesDrawer;
}

interface Window {
    mermaid?: typeof import("mermaid").default;
    hljs: {
        listLanguages(): string[];
        highlight(text: string, options: {
            language?: string,
            ignoreIllegals: boolean
        }): {
            value: string
        };
        getLanguage(text: string): {
            name: string
        } | undefined;
    };
    katex?: {
        renderToString(
            math: string,
            option: { displayMode: boolean; output: string; macros: object },
        ): string;
    };
    echarts?: { init(element: HTMLElement, theme?: string): unknown };
    flowchart?: { parse(text: string): { drawSVG: (el: HTMLElement) => void } };
    Viz?: unknown;
    ABCJS?: { renderAbc(element: HTMLElement, text: string): void };
    SmiDrawer?: new (
        moleculeOptions: Record<string, unknown>,
        reactionOptions: Record<string, unknown>,
    ) => { draw: (code: string, id: string, theme?: string) => void };
    markmap?: Record<string, unknown>;
    __AURA_GRAPHVIZ__?: {
        renderSVGElement: (code: string) => Promise<HTMLElement>;
    };
    __AURA_PLANTUML__?: {
        renderToSvg: (
            source: string,
            options?: { dark?: boolean },
        ) => Promise<string>;
    };
    __AURA_PRELOADED_STYLE_IDS__?: Set<string>;
    __AURA_STYLE_URLS__?: Record<string, string>;
    __AURA_HLJS_STYLE_URLS__?: Record<string, string>;
}

interface IObject {
    [key: string]: string;
}

/** Options used when binding the Markdown engine to an Aura instance. */
interface IMarkdownBindOptions extends IMarkdownConfig {
    emojis: IObject;
    emojiSite: string;
    headingAnchor: boolean;
    inlineMathDigit: boolean;
    renderedCodeLanguages: string[];
}

declare const webkitAudioContext: {
    prototype: AudioContext
    new(contextOptions?: AudioContextOptions): AudioContext,
};

/** Engine locale codes used for speech synthesis and `options.lang`. */
type AuraLang = "en_US" | "zh_TW" | "zh_CN";

/** @link https://ld246.com/article/1549638745630#options-preview-hljs */
interface IHljs {
    /** Language used when code block has no language. Default: "" */
    defaultLang?: string;
    /** Enable line numbers. Default: false */
    lineNumber?: boolean;
    /** Code style; see [Chroma](https://xyproto.github.io/splash/docs/longer/all.html). Default: 'github' */
    style?: string;
    /** Enable code highlighting. Default: true */
    enable?: boolean;
    /** Custom languages: CODE_LANGUAGES */
    langs?: string[];

    /** Render top-right menu button */
    renderMenu?(element: HTMLElement, menuElement: HTMLElement): void;
}

/** @link https://ld246.com/article/1549638745630#options-preview-math */
interface IMath {
    /** Allow digits after opening $ in inline math. Default: false */
    inlineDigit?: boolean;
    /** Macro definitions passed to KaTeX. Default: {} */
    macros?: object;
    /** Math rendering engine. Default: 'KaTeX' */
    engine?: "KaTeX";
}

/** @link https://ld246.com/article/1549638745630#options-preview-markdown */
interface IMarkdownConfig {
    /** Auto space. Default: false */
    autoSpace?: boolean;
    /** Two spaces at paragraph start. Default: false */
    paragraphBeginningSpace?: boolean;
    /** Auto-fix terminology. Default: false */
    fixTermTypo?: boolean;
    /** Insert table of contents. Default: false */
    toc?: boolean;
    /** Footnotes. Default: true */
    footnotes?: boolean;
    /** Render code blocks in WYSIWYG mode. Default: true */
    codeBlockPreview?: boolean;
    /** Render math blocks in WYSIWYG mode. Default: true */
    mathBlockPreview?: boolean;
    /** Enable XSS filtering. Default: true */
    sanitize?: boolean;
    /** Link relative path prefix. Default: '' */
    linkBase?: string;
    /** Link forced prefix. Default: '' */
    linkPrefix?: string;
    /** Add list markers for [custom list styles](https://github.com/Vanessa219/aura/issues/390). Default: false */
    listStyle?: boolean;
    /** Enable mark syntax */
    mark?: boolean;
    /** Enable autolink */
    gfmAutoLink?: boolean;
    /** Enable superscript */
    sup?: boolean;
    /** Enable subscript */
    sub?: boolean;
}

/** @link https://ld246.com/article/1549638745630#options-preview */
interface IPreview {
    /** Content max width for side padding. Default: 800; <= 0 lets themes own the column */
    maxWidth?: number;
    /** @link https://ld246.com/article/1549638745630#options-preview-hljs */
    hljs?: IHljs;
    /** @link https://ld246.com/article/1549638745630#options-preview-math */
    math?: IMath;
    /** @link https://ld246.com/article/1549638745630#options-preview-markdown */
    markdown?: IMarkdownConfig;
}

interface IHintData {
    html: string;
    value: string;
}

interface IHintExtend {
    key: string;

    hint?(value: string): IHintData[] | Promise<IHintData[]>;
}

/** @link https://ld246.com/article/1549638745630#options-hint */
interface IHint {
    /** Parse hint content as md */
    parse?: boolean;
    /** Hint debounce interval in ms. Default: 200 */
    delay?: number;
    /** Default emojis or custom alias map */
    emoji?: IObject;
    /** Base URL for custom emoji images (empty = Unicode-only defaults). */
    emojiPath?: string;
    extend?: IHintExtend[];
}

/** @link https://ld246.com/article/1549638745630#options */
interface IOptions {
    /** RTL */
    rtl?: boolean;
    /** Undo history interval */
    undoDelay?: number;
    /** Editor initial value. Default: '' */
    value?: string;
    /** Enable typewriter mode. Default: false */
    typewriterMode?: boolean;
    /** Editor height. Default: 'auto' */
    height?: number | string;
    /** Editor min height */
    minHeight?: number;
    /** Editor width; supports %. Default: 'auto' */
    width?: number | string;
    /** Placeholder when input is empty. Default: '' */
    placeholder?: string;
    /** Speech / engine locale. Default: 'en_US' */
    lang?: AuraLang;
    /** @link https://ld246.com/article/1549638745630#options-counter */
    counter?: {
        /** Enable counter. Default: false */
        enable: boolean;
        /** Max allowed input length */
        max?: number;
        /** Counter type. Default: 'markdown' */
        type?: "markdown";
        /** Character count callback */
        after?(length: number, counter: {
            /** Enable counter. Default: false */
            enable: boolean;
            /** Max allowed input length */
            max?: number;
            /** Counter type. Default: 'markdown' */
            type?: "markdown"
        }): void
    };
    /** @link https://ld246.com/article/1549638745630#options-preview */
    preview?: IPreview;
    /** @link https://ld246.com/article/1549638745630#options-link */
    link?: {
        /** Open link URL. Default: true */
        isOpen?: boolean;
        /** Link click handler */
        click?: (bom: Element) => void;
    },
    /** @link https://ld246.com/article/1549638745630#options-image */
    image?: {
        /** Preview images. Default: true */
        isPreview?: boolean;
        /** Image preview handler */
        preview?: (bom: Element) => void;
    },
    /** @link https://ld246.com/article/1549638745630#options-hint */
    hint?: IHint;
    /** Theme. Default: 'classic' */
    theme?: "classic" | "dark";
    /** Tab key string; supports \t and any string */
    tab?: string;
    customRenders?: {
        language: string,
        render: (element: HTMLElement, aura: IAura) => void
    }[],

    /** Callback after async editor render completes */
    after?(): void;
}

type IMergedMarkdownConfig = IMarkdownConfig & Required<Pick<IMarkdownConfig,
    "autoSpace" | "paragraphBeginningSpace" | "fixTermTypo" | "toc" | "footnotes" |
    "codeBlockPreview" | "mathBlockPreview" | "sanitize" | "linkBase" | "linkPrefix" |
    "listStyle" | "mark" | "gfmAutoLink" | "sup" | "sub">>;

type IMergedHljs = IHljs & Required<Pick<IHljs, "defaultLang" | "lineNumber" | "style" | "enable">>;

type IMergedMath = IMath & Required<Pick<IMath, "inlineDigit" | "macros" | "engine">>;

type IMergedPreview = IPreview & {
    hljs: IMergedHljs;
    markdown: IMergedMarkdownConfig;
    math: IMergedMath;
    maxWidth: number;
};

type IMergedHint = IHint & Required<Pick<IHint, "delay" | "emoji" | "emojiPath" | "extend" | "parse">>;

type IMergedOptions = IOptions & {
    counter: NonNullable<IOptions["counter"]> & {enable: boolean; type: "markdown"};
    customRenders: NonNullable<IOptions["customRenders"]>;
    height: number | string;
    hint: IMergedHint;
    image: NonNullable<IOptions["image"]> & {isPreview: boolean};
    lang: AuraLang;
    link: NonNullable<IOptions["link"]> & {isOpen: boolean};
    placeholder: string;
    preview: IMergedPreview;
    rtl: boolean;
    theme: "classic" | "dark";
    typewriterMode: boolean;
    undoDelay: number;
    value: string;
    width: number | string;
};

interface IEChart {
    setOption(option: unknown): void;

    resize(): void;
}

interface IAura {
    element: HTMLElement;
    options: IMergedOptions;
    markdown: import("@/lib/mdtohtml").MarkdownEngineApi;
    document: import("@/lib/mdcore/document/markdown-document").MarkdownDocument;
    currentMode: "wysiwyg";
    hint: {
        timeId: number
        recentLanguage: string
        bind(aura: IAura): void
        unbind(): void
        fillValue(value: string, aura: IAura): void
        render(aura: IAura): void,
        genHTML(data: IHintData[], key: string, aura: IAura): void
        select(event: KeyboardEvent, aura: IAura): boolean,
    };
    undo: {
        clearStack(aura: IAura): void,
        redo(aura: IAura): void
        undo(aura: IAura): void
        addToUndoStack(aura: IAura): void
        recordFirstPosition(aura: IAura, event: KeyboardEvent): void,
    };
    wysiwyg: {
        range: Range,
        element: HTMLPreElement,
        afterRenderTimeoutId: number,
        hlToolbarTimeoutId: number,
        preventInput: boolean,
        composingLock: boolean,
        unbindListener(): void,
    };
}
