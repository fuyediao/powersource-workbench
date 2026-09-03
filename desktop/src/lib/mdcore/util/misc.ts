import {selectIsEditor} from "./selection";

/**
 * Convert non-breaking spaces to regular spaces.
 *
 * @param text - Input text.
 * @returns Text with `\u00a0` replaced by a normal space.
 */
export const code160to32 = (text: string) => {
    return text.replace(/\u00a0/g, " ");
};

/**
 * Generate a RFC4122-ish random UUID using the Web Crypto API.
 *
 * @returns Randomly generated UUID string.
 */
export const genUUID = () => ([1e7].toString() + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (parseInt(c, 10) ^ (window.crypto.getRandomValues(new Uint32Array(1))[0] & (15 >> (parseInt(c, 10) / 4)))).toString(16)
);

/**
 * Parse a loose (non-strict-JSON) object literal expression.
 *
 * @param text - Expression source.
 * @returns Evaluated value.
 */
export const looseJsonParse = (text: string) => {
    return Function(`"use strict";return (${text})`)();
};

/**
 * Return the current selection text when it lies within the editor.
 *
 * @param editor - Editor root element.
 * @param range - Optional range to test.
 * @returns Selected text, or empty string when outside the editor.
 */
export const getSelectText = (editor: HTMLElement, range?: Range) => {
    if (selectIsEditor(editor, range)) {
        return getSelection()!.toString();
    }
    return "";
};

/**
 * Deep-merge plain objects left to right into a new target.
 *
 * @param options - Objects to merge.
 * @returns Merged object.
 */
export const merge = (...options: any[]) => {
    const target: any = {};
    const merger = (obj: any) => {
        for (const prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                if (Object.prototype.toString.call(obj[prop]) === "[object Object]") {
                    target[prop] = merge(target[prop], obj[prop]);
                } else {
                    target[prop] = obj[prop];
                }
            }
        }
    };
    for (let i = 0; i < options.length; i++) {
        merger(options[i]);
    }
    return target;
};
