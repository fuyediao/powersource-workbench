import {code160to32} from "../util/misc";
import {isCtrl} from "../util/compatibility";
import {execAfterRender} from "../modes/fixBrowserBehavior";
import {hasClosestByClassName} from "../util/hasClosest";
import {processCodeRender} from "../render/processCode";
import {getCursorPosition, insertHTML, setSelectionFocus} from "../util/selection";
import { editorUi } from '@/utils/aura/editor-ui';

/**
 * Emoji / language autocomplete logic (React owns the popup chrome).
 */
export class Hint {
    public timeId: number;
    public recentLanguage: string;
    private splitChar = "";
    private lastIndex = -1;
    private aura: IAura | null = null;

    constructor(hintExtends: IHintExtend[]) {
        this.timeId = -1;
        this.recentLanguage = "";
        hintExtends.push({key: ":"});
    }

    /**
     * Bind fill handler for the active editor instance.
     *
     * @param aura - Active editor.
     */
    public bind(aura: IAura) {
        this.aura = aura;
        editorUi.setHintFillHandler((value) => {
            this.fillValue(value, aura);
        });
    }

    /**
     * Unbind fill handler when the editor is destroyed.
     */
    public unbind() {
        if (this.aura) {
            editorUi.setHintFillHandler(null);
            this.aura = null;
        }
        editorUi.hideHint();
    }

    public render(aura: IAura) {
        if (!window.getSelection()!.focusNode) {
            return;
        }
        let currentLineValue: string;
        const range = getSelection()!.getRangeAt(0);
        currentLineValue = range.startContainer.textContent!.substring(0, range.startOffset) || "";

        const key = this.getKey(currentLineValue, aura.options.hint.extend);

        if (typeof key === "undefined") {
            editorUi.hideHint();
            clearTimeout(this.timeId);
        } else {
            if (this.splitChar === ":") {
                const emojiHint = key === "" ? aura.options.hint.emoji : aura.markdown.getEmojis();
                const matchEmojiData: IHintData[] = [];
                Object.keys(emojiHint).forEach((keyName) => {
                    if (keyName.indexOf(key.toLowerCase()) === 0) {
                        if (emojiHint[keyName].indexOf(".") > -1) {
                            matchEmojiData.push({
                                html: `<img class="float-left mr-[3px] size-5" src="${emojiHint[keyName]}" title=":${keyName}:"/> :${keyName}:`,
                                value: `:${keyName}:`,
                            });
                        } else {
                            matchEmojiData.push({
                                html: `<span class="float-left mr-[3px] text-base">${emojiHint[keyName]}</span>${keyName}`,
                                value: emojiHint[keyName],
                            });
                        }
                    }
                });
                this.genHTML(matchEmojiData, key, aura);
            } else {
                aura.options.hint.extend.forEach((item) => {
                    if (item.key === this.splitChar) {
                        clearTimeout(this.timeId);
                        this.timeId = window.setTimeout(async () => {
                            this.genHTML(await item.hint!(key), key, aura);
                        }, aura.options.hint.delay);
                    }
                });
            }
        }
    }

    public genHTML(data: IHintData[], key: string, aura: IAura) {
        if (data.length === 0) {
            editorUi.hideHint();
            return;
        }

        const editorElement = aura[aura.currentMode].element;
        const textareaPosition = getCursorPosition(editorElement);
        const parentRect = editorElement.parentElement!.getBoundingClientRect();
        const x = parentRect.left + textareaPosition.left;
        const y = parentRect.top + textareaPosition.top;
        const lineHeight = parseInt(document.defaultView!.getComputedStyle(editorElement, null)
            .getPropertyValue("line-height"), 10);
        const items = data.slice(0, 8).map((hintData) => {
            let html = hintData.html;
            if (key !== "") {
                const lastIndex = html.lastIndexOf(">") + 1;
                let replaceHtml = html.substr(lastIndex);
                const replaceIndex = replaceHtml.toLowerCase().indexOf(key.toLowerCase());
                if (replaceIndex > -1) {
                    replaceHtml = replaceHtml.substring(0, replaceIndex) + "<b>" +
                        replaceHtml.substring(replaceIndex, replaceIndex + key.length) + "</b>" +
                        replaceHtml.substring(replaceIndex + key.length);
                    html = html.substr(0, lastIndex) + replaceHtml;
                }
            }
            return {html, value: hintData.value};
        });

        let left = x;
        let right: number | "auto" = "auto";
        // Approximate overflow flip (React may refine after mount).
        if (x + 250 > window.innerWidth) {
            left = 0;
            right = 0;
        }

        editorUi.setHintState({
            visible: true,
            items,
            selectedIndex: 0,
            left,
            top: y + (lineHeight || 22),
            right,
        });
    }

    /**
     * Insert a hint value at the caret (used by React popup and keyboard).
     *
     * @param value - Hint payload.
     * @param aura - Active editor.
     */
    public fillValue = (value: string, aura: IAura) => {
        editorUi.hideHint();
        const range: Range = window.getSelection()!.getRangeAt(0);

        if (aura.currentMode === "wysiwyg" && range.startContainer.nodeType !== 3 ) {
            const startContainer = range.startContainer as HTMLElement;
            let inputElement: HTMLInputElement;
            if (startContainer.classList.contains("aura-input")) {
                inputElement = startContainer as HTMLInputElement;
            } else {
                inputElement = startContainer.firstElementChild! as HTMLInputElement;
            }
            if (inputElement && inputElement.classList.contains("aura-input")) {
                inputElement.value = value.trimRight();
                range.selectNodeContents(inputElement);
                range.collapse(false);
                inputElement.dispatchEvent(new CustomEvent("input", {detail: 1}));
                this.recentLanguage = value.trimRight();
                return;
            }
        }

        range.setStart(range.startContainer, this.lastIndex);
        range.deleteContents();

        if (aura.options.hint.parse) {
            insertHTML(aura.markdown.spinAuraDom(value), aura);
        } else {
            insertHTML(value, aura);
        }
        if (this.splitChar === ":" && value.indexOf(":") > -1) {
            range.insertNode(document.createTextNode(" "));
        }
        range.collapse(false);
        setSelectionFocus(range);

        if (aura.currentMode === "wysiwyg") {
            const preElement = hasClosestByClassName(range.startContainer, "aura-wysiwyg__block");
            if (preElement && preElement.lastElementChild!.classList.contains("aura-wysiwyg__preview")) {
                preElement.lastElementChild!.innerHTML = preElement.firstElementChild!.innerHTML;
                processCodeRender(preElement.lastElementChild! as HTMLElement, aura);
            }
        }
        execAfterRender(aura);
    }

    public select(event: KeyboardEvent, _aura: IAura) {
        if (!editorUi.isHintVisible()) {
            return false;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            editorUi.moveHintSelection(1);
            return true;
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            editorUi.moveHintSelection(-1);
            return true;
        } else if (!isCtrl(event) && !event.shiftKey && !event.altKey && event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            return editorUi.commitHintSelection();
        }
        return false;
    }

    private getKey(currentLineValue: string, extend: IHintExtend[]) {
        this.lastIndex = -1;
        this.splitChar = "";
        extend.forEach((item) => {
            const currentLastIndex = currentLineValue.lastIndexOf(item.key);
            if (this.lastIndex < currentLastIndex) {
                this.splitChar = item.key;
                this.lastIndex = currentLastIndex;
            }
        });

        let key;
        if (this.lastIndex === -1) {
            return key;
        }
        const lineArray = currentLineValue.split(this.splitChar);
        const lastItem = lineArray[lineArray.length - 1];
        const maxLength = 32;
        if (lineArray.length > 1 && lastItem.trim() === lastItem) {
            if (lineArray.length === 2 && lineArray[0] === "" && lineArray[1].length < maxLength) {
                key = lineArray[1];
            } else {
                const preChar = lineArray[lineArray.length - 2].slice(-1);
                if (code160to32(preChar) === " " && lastItem.length < maxLength) {
                    key = lastItem;
                }
            }
        }
        return key;
    }
}
