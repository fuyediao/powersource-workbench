/**
 * Editor caret / whitespace tokens shared with the WYSIWYG kernel.
 * Values must stay stable so the Aura DOM contract remains byte-compatible
 * across spin / round-trip.
 */

/** Internal caret insertion mark (U+2038). */
export const CARET = '‸'

/** Frontend caret element used inside contenteditable. */
export const FRONT_END_CARET = '<wbr>'

/** Zero-width space placeholder. */
export const ZWSP = '\u200b'
