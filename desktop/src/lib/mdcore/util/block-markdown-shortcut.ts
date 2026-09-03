const ZERO_WIDTH_SPACE_RE = /\u200b/g;

export interface HeadingMarkdownShortcut {
    level: number;
    markdown: string;
}

export interface CodeFenceMarkdownShortcut {
    fence: string;
    language: string;
}

/**
 * Match an empty ATX heading prefix after its trigger space is inserted.
 * @param text - Current paragraph text.
 * @returns Heading metadata, or null when the paragraph is not a shortcut.
 */
export function matchEmptyHeadingShortcut(text: string): HeadingMarkdownShortcut | null {
    const normalized = text.replace(ZERO_WIDTH_SPACE_RE, "");
    const match = /^(#{1,6})[ \t]$/.exec(normalized);
    if (!match) {
        return null;
    }
    return {
        level: match[1].length,
        markdown: match[1],
    };
}

/**
 * Match a complete ATX heading line used as an Enter-key fallback.
 * @param text - Current paragraph text.
 * @returns Heading metadata, or null when the paragraph is not a heading.
 */
export function matchCompletedHeadingShortcut(text: string): HeadingMarkdownShortcut | null {
    const normalized = text.replace(ZERO_WIDTH_SPACE_RE, "").trim();
    const match = /^(#{1,6})[ \t]+\S[\s\S]*$/.exec(normalized);
    if (!match) {
        return null;
    }
    return {
        level: match[1].length,
        markdown: normalized,
    };
}

/**
 * Match a fenced-code opener before Enter converts it into an editable block.
 * @param text - Current paragraph text.
 * @returns Fence metadata, or null when the paragraph is not a code opener.
 */
export function matchCodeFenceShortcut(text: string): CodeFenceMarkdownShortcut | null {
    const normalized = text.replace(ZERO_WIDTH_SPACE_RE, "").trim();
    const match = /^(`{3,}|~{3,})[ \t]*([A-Za-z0-9_+.-]*)[ \t]*$/.exec(normalized);
    if (!match) {
        return null;
    }
    return {
        fence: match[1],
        language: match[2],
    };
}
