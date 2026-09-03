import {AURA_VERSION} from "./util/constants";
import {Hint} from "./features/hint";
import {getHTML} from "./render/serialize";
import {MarkdownDocument} from "./document/markdown-document";
import {setMarkdownEngine} from "./render/set-markdown-engine";
import { editorUi } from '@/utils/aura/editor-ui';
import {initUI, UIUnbindListener} from "./init-ui";
import {Undo} from "./features/undo";
import {getSelectText} from "./util/misc";
import {Options} from "./util/Options";
import {WYSIWYG} from "./modes/index";
import {renderDomByMd} from "./modes/renderDomByMd";
import {installEditorVendors} from "./util/vendor-preload";
import {renderToc} from "./modes/toc";
import {
    execFormatWrap,
    execHeading as applyHeadingLevel,
} from "./modes/exec-format";

class Aura {
    public readonly version: string;
    public aura!: IAura;
    private isDestroyed = false;

    /**
     * @param id - Mount element or element id.
     * @param options - Editor options.
     */
    constructor(id: string | HTMLElement, options?: IOptions) {
        this.version = AURA_VERSION;

        if (typeof id === "string") {
            const mountElement = document.getElementById(id);
            if (!mountElement) {
                this.showErrorTip(`Failed to get element by id: ${id}`);
                return;
            }
            id = mountElement;
        }

        const getOptions = new Options(options ?? {});
        const mergedOptions = getOptions.merge();

        // Boot order: preload editor vendors → editor init. The Markdown
        // engine is bundled TypeScript, so no async engine load is required.
        void (async () => {
            try {
                await installEditorVendors();
                if (this.isDestroyed) {
                    return;
                }
                this.init(id as HTMLElement, mergedOptions);
            } catch (error: unknown) {
                const message =
                    error instanceof Error ? error.message : String(error);
                this.showErrorTip(`Failed to start editor: ${message}`);
            }
        })();
    }

    /**
     * Surface a boot error via the React toast host.
     *
     * @param error - Error message.
     */
    private showErrorTip(error: string) {
        editorUi.showToast(error, 0);
    }

    /** Get Markdown content */
    public getValue() {
        // Constructor finishes before async vendor/boot `init()` assigns `this.aura`.
        if (!this.aura) {
            return "";
        }
        return this.aura.document.getText();
    }

    /**
     * Update the authoritative source while Monaco is active. The WYSIWYG DOM
     * is intentionally left untouched until source mode closes.
     *
     * @param markdown - Current Monaco document text.
     */
    public setSourceValue(markdown: string) {
        if (this.aura) {
            this.aura.document.setText(markdown);
        }
    }

    /** Return the current edit mode. */
    public getCurrentMode() {
        return this.aura?.currentMode;
    }

    /**
     * Apply wrap formatting (bold / italic / strike) used by the Electron Format menu.
     *
     * @param type - Format action name.
     */
    public execFormat(type: "bold" | "italic" | "strike") {
        if (!this.aura?.markdown) {
            return;
        }
        execFormatWrap(this.aura, type);
    }

    /**
     * Apply a heading level used by the Electron Format menu.
     *
     * @param level - Heading level 1–6.
     */
    public execHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
        if (!this.aura?.markdown) {
            return;
        }
        applyHeadingLevel(this.aura, level);
    }

    /** Focus the editor. */
    public focus() {
        this.aura.wysiwyg.element.focus();
    }

    /** Return selected text */
    public getSelection() {
        return getSelectText(this.aura.wysiwyg.element);
    }

    /** Get HTML */
    public getHTML() {
        return getHTML(this.aura);
    }

    /** Set editor content */
    public setValue(markdown: string, clearStack = false) {
        renderDomByMd(this.aura, markdown, {
            enableAddUndoStack: true,
            enableHint: false,
        });

        renderToc(this.aura);

        if (!markdown) {
            editorUi.hideHint();
        }
        if (clearStack) {
            this.clearStack();
        }
    }

    /** Clear undo & redo stacks */
    public clearStack() {
        this.aura.undo.clearStack(this.aura);
        this.aura.undo.addToUndoStack(this.aura);
    }

    /** Destroy editor (keeps the React-owned `#write` shell intact). */
    public destroy() {
        this.isDestroyed = true;
        if (!this.aura) {
            return;
        }
        this.aura.hint.unbind();
        const write = this.aura.element.querySelector(
            "#write.aura-write, .aura-write, #write",
        );
        if (write) {
            write.innerHTML = "";
        }

        UIUnbindListener();
        this.aura.wysiwyg.unbindListener();
        this.aura.options.after = undefined;
    }

    private init(id: HTMLElement, mergedOptions: IMergedOptions) {
        if (this.isDestroyed) {
            return;
        }
        const hint = new Hint(mergedOptions.hint.extend);
        this.aura = {
            currentMode: "wysiwyg",
            element: id,
            hint,
            options: mergedOptions,
        } as unknown as IAura;

        this.aura.undo = new Undo();
        this.aura.document = new MarkdownDocument();
        this.aura.wysiwyg = new WYSIWYG(this.aura);

        this.aura.markdown = setMarkdownEngine({
            autoSpace: this.aura.options.preview.markdown.autoSpace,
            gfmAutoLink: this.aura.options.preview.markdown.gfmAutoLink,
            codeBlockPreview: this.aura.options.preview.markdown
                .codeBlockPreview,
            emojiSite: this.aura.options.hint.emojiPath,
            emojis: this.aura.options.hint.emoji,
            fixTermTypo: this.aura.options.preview.markdown.fixTermTypo,
            footnotes: this.aura.options.preview.markdown.footnotes,
            headingAnchor: false,
            inlineMathDigit: this.aura.options.preview.math.inlineDigit,
            linkBase: this.aura.options.preview.markdown.linkBase,
            linkPrefix: this.aura.options.preview.markdown.linkPrefix,
            listStyle: this.aura.options.preview.markdown.listStyle,
            mark: this.aura.options.preview.markdown.mark,
            mathBlockPreview: this.aura.options.preview.markdown
                .mathBlockPreview,
            paragraphBeginningSpace: this.aura.options.preview.markdown
                .paragraphBeginningSpace,
            renderedCodeLanguages: this.aura.options.customRenders.map(
                (renderer) => renderer.language,
            ),
            sanitize: this.aura.options.preview.markdown.sanitize,
            sub: this.aura.options.preview.markdown.sub,
            sup: this.aura.options.preview.markdown.sup,
            toc: this.aura.options.preview.markdown.toc,
        });

        hint.bind(this.aura);
        initUI(this.aura);

        if (mergedOptions.after) {
            mergedOptions.after();
        }
    }
}

export default Aura;
