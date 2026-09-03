import {Constants} from "./constants";
import {handleEditorLinkClick} from "./linkClick";
import {merge} from "./misc";

export class Options {
    public options: IOptions;
    private defaultOptions: IMergedOptions = {
        rtl: false,
        after: undefined,
        counter: {
            enable: false,
            type: "markdown",
        },
        customRenders: [],
        height: "auto",
        hint: {
            delay: 200,
            emoji: {
                "+1": "\u{1F44D}",
                "-1": "\u{1F44E}",
                "confused": "\u{1F615}",
                "eyes": "\u{1F440}\uFE0F",
                "heart": "\u2764\uFE0F",
                "rocket": "\u{1F680}\uFE0F",
                "smile": "\u{1F604}",
                "tada": "\u{1F389}\uFE0F",
            },
            /** Empty: default emojis are Unicode; set only for custom image maps. */
            emojiPath: "",
            extend: [],
            parse: true,
        },
        lang: "en_US",
        placeholder: "",
        preview: {
            hljs: Constants.HLJS_OPTIONS,
            markdown: Constants.MARKDOWN_OPTIONS,
            math: Constants.MATH_OPTIONS as IMergedMath,
            maxWidth: 800,
        },
        link: {
            isOpen: true,
            click: handleEditorLinkClick,
        },
        image: {
            isPreview: true,
        },
        theme: "classic",
        typewriterMode: false,
        undoDelay: 800,
        value: "",
        width: "auto",
    };

    constructor(options: IOptions) {
        this.options = options;
    }

    public merge(): IMergedOptions {
        if (this.options) {
            if (this.options.hint?.emoji) {
                this.defaultOptions.hint.emoji = this.options.hint.emoji;
            }
        }

        return merge(this.defaultOptions, this.options) as IMergedOptions;
    }
}
