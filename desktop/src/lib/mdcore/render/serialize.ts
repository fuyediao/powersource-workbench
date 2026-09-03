/**
 * Serialize the WYSIWYG document to standard HTML via the Markdown engine.
 *
 * @param aura - Active editor instance.
 * @returns HTML string.
 */
export const getHTML = (aura: IAura) => {
    return aura.markdown.auraDomToHtml(aura.wysiwyg.element.innerHTML);
};
