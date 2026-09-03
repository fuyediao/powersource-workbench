import {Constants} from "../util/constants";
import {isFlagImage} from "../render/flagRender";
import { editorUi } from '@/utils/aura/editor-ui';
import {afterRenderEvent} from "./afterRenderEvent";
import {processKeydown} from "./processKeydown";
import {removeHeading, setHeading} from "./setHeading";
import {isCtrl} from "../util/compatibility";
import {execAfterRender, paste} from "./fixBrowserBehavior";
import {hasClosestByMatchTag} from "../util/hasClosest";
import {matchHotKey} from "../util/hotKey";
import {getCursorPosition, getEditorRange} from "../util/selection";

export const focusEvent = (_aura: IAura, editorElement: HTMLElement) => {
    editorElement.addEventListener("focus", () => {
        editorUi.hideHint();
    });
};

export const dblclickEvent = (aura: IAura, editorElement: HTMLElement) => {
    editorElement.addEventListener("dblclick", (rawEvent) => {
        const event = rawEvent as MouseEvent & { target: HTMLElement };
        if (event.target.tagName === "IMG" && !isFlagImage(event.target)) {
            if (aura.options.image.preview) {
                aura.options.image.preview(event.target);
            } else if (aura.options.image.isPreview) {
                editorUi.openImagePreview(
                    event.target as HTMLImageElement,
                    aura.options.theme,
                );
            }
        }
    });
};

export const blurEvent = (aura: IAura, editorElement: HTMLElement) => {
    editorElement.addEventListener("blur", () => {
        aura[aura.currentMode].range = getEditorRange(aura);
    });
};

export const dropEvent = (aura: IAura, editorElement: HTMLElement) => {
    editorElement.addEventListener("dragstart", (event) => {
        // Drag selected text within the editor
        event.dataTransfer!.setData(Constants.DROP_EDITOR, Constants.DROP_EDITOR);
    });
    editorElement.addEventListener("drop",
        (rawEvent) => {
            const event = rawEvent as unknown as DragEvent & { target: HTMLElement };
            if (event.dataTransfer!.getData(Constants.DROP_EDITOR)) {
                // Drag selected text within the editor
                execAfterRender(aura);
            } else if (event.dataTransfer!.types.includes("Files") || event.dataTransfer!.types.includes("text/html")) {
                // External file dropped into editor or text dragged within editor
                paste(aura, event, {
                    pasteCode: (code: string) => {
                        document.execCommand("insertHTML", false, code);
                    },
                });
            }
        });
};

export const copyEvent =
    (aura: IAura, editorElement: HTMLElement, copy: (event: ClipboardEvent, aura: IAura) => void) => {
        editorElement.addEventListener("copy", (event: ClipboardEvent) => copy(event, aura));
    };

export const cutEvent =
    (aura: IAura, editorElement: HTMLElement, copy: (event: ClipboardEvent, aura: IAura) => void) => {
        editorElement.addEventListener("cut", (event: ClipboardEvent) => {
            copy(event, aura);
            document.execCommand("delete");
        });
    };

/**
 * Keep the caret vertically centered when typewriter mode is on.
 *
 * @param aura - Editor instance.
 */
export const scrollCenter = (aura: IAura) => {
    if (!aura.options.typewriterMode) {
        return;
    }
    const editorElement = aura[aura.currentMode].element;
    const cursorTop = getCursorPosition(editorElement).top;
    if (aura.options.height === "auto") {
        window.scrollTo(window.scrollX,
            cursorTop + aura.element.offsetTop - window.innerHeight / 2 + 10);
    } else {
        editorElement.scrollTop = cursorTop + editorElement.scrollTop - editorElement.clientHeight / 2 + 10;
    }
};

export const hotkeyEvent = (aura: IAura, editorElement: HTMLElement) => {
    editorElement.addEventListener("keydown", (rawEvent) => {
        const event = rawEvent as KeyboardEvent & { target: HTMLElement };
        // hint: navigate up/down
        if (aura.options.hint.extend.length > 1 &&
            aura.hint.select(event, aura)) {
            return;
        }

        if (processKeydown(aura, event)) {
            return;
        }

        // undo
        if (matchHotKey("\u2318Z", event)) {
            aura.undo.undo(aura);
            event.preventDefault();
            return;
        }

        // redo
        if (matchHotKey("\u2318Y", event)) {
            aura.undo.redo(aura);
            event.preventDefault();
            return;
        }

        // esc
        if (event.key === "Escape") {
            if (editorUi.isHintVisible()) {
                editorUi.hideHint();
            }
            event.preventDefault();
            return;
        }

        // h1 - h6 hotkey
        if (isCtrl(event) && event.altKey && !event.shiftKey && /^Digit[1-6]$/.test(event.code)) {
            const tagName = event.code.replace("Digit", "H");
            if (hasClosestByMatchTag(getSelection()!.getRangeAt(0).startContainer, tagName)) {
                removeHeading(aura);
            } else {
                setHeading(aura, tagName);
            }
            afterRenderEvent(aura);
            event.preventDefault();
            return true;
        }
    });
};

/**
 * Selection lifecycle hook (no embed callbacks).
 *
 * @param _aura - Active editor (unused).
 * @param _editorElement - Editor surface (unused).
 */
export const selectEvent = (_aura: IAura, _editorElement: HTMLElement) => {
    // Intentionally empty: shell owns selection UI; range is tracked on blur.
};
