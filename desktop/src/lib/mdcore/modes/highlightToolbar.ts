import {hasClosestByAttribute, hasClosestByClassName} from "../util/hasClosest";
import {selectIsEditor} from "../util/selection";

/**
 * Hide editable source panes for block previews the caret is not inside.
 * Keeps Typora/Vditor behavior: click a code/math/html block to edit, leave
 * it to show only the highlighted (or rendered) preview.
 *
 * @param aura - Editor instance.
 * @param activeBlock - Block containing the caret, or `false` when none.
 */
const collapseInactiveBlockEditors = (
    aura: IAura,
    activeBlock: HTMLElement | false,
): void => {
    const dataType = activeBlock
        ? activeBlock.getAttribute("data-type") ?? ""
        : "";
    const isBlock = dataType.includes("block");

    aura.wysiwyg.element
        .querySelectorAll(".aura-wysiwyg__preview")
        .forEach((itemElement) => {
            const preview = itemElement as HTMLElement;
            if (
                activeBlock &&
                (!isBlock || activeBlock.contains(preview))
            ) {
                return;
            }
            const source = preview.previousElementSibling as HTMLElement | null;
            if (source && source.style.display !== "none") {
                source.style.display = "none";
            }
        });
};

/**
 * Refresh WYSIWYG selection helpers without a floating block toolbar.
 * Collapse inactive code/math/html edit panes and keep backslash markers.
 *
 * @param aura - Editor instance.
 */
export const highlightToolbar = (aura: IAura) => {
    clearTimeout(aura.wysiwyg.hlToolbarTimeoutId);
    aura.wysiwyg.hlToolbarTimeoutId = window.setTimeout(() => {
        if (aura.wysiwyg.element.getAttribute("contenteditable")! === "false") {
            return;
        }
        if (!selectIsEditor(aura.wysiwyg.element)) {
            collapseInactiveBlockEditors(aura, false);
            return;
        }

        if (getSelection()!.rangeCount === 0) {
            return;
        }
        const range = getSelection()!.getRangeAt(0);
        let typeElement = range.startContainer as HTMLElement;
        if (range.startContainer.nodeType === 3) {
            typeElement = range.startContainer.parentElement!;
        } else if (typeElement.childNodes.length > 0) {
            const offset = Math.min(
                range.startOffset,
                typeElement.childNodes.length - 1,
            );
            typeElement = typeElement.childNodes[offset] as HTMLElement;
        }

        const blockRenderElement = hasClosestByClassName(
            typeElement,
            "aura-wysiwyg__block",
        );
        collapseInactiveBlockEditors(aura, blockRenderElement);

        aura.wysiwyg.element
            .querySelectorAll('span[data-type="backslash"] > span')
            .forEach((item: Element) => {
                ;(item as HTMLElement).style.display = "none";
            });
        const backslashElement = hasClosestByAttribute(
            range.startContainer,
            "data-type",
            "backslash",
        );
        if (backslashElement) {
            const marker = backslashElement.querySelector("span");
            if (marker) {
                marker.style.display = "inline";
            }
        }
    }, 200);
};
