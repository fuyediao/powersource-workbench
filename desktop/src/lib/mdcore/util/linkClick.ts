import { openAppUrl } from '@/utils/shared/open-app-url'

/**
 * Normalize a heading id / TOC hash for fuzzy comparison.
 *
 * @param value - Raw id or hash fragment.
 * @returns Collapsed lowercase slug.
 */
function normalizeSlug(value: string): string {
  return decodeURIComponent(value)
    .replace(/^wysiwyg-/i, "")
    .replace(/_\d+$/u, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract a document hash from a href (relative `#…` or same-origin URL).
 *
 * @param href - Link destination.
 * @returns Hash including `#`, or null.
 */
function extractHash(href: string): string | null {
  if (href.startsWith("#")) {
    return href;
  }
  try {
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin && url.hash) {
      return url.hash;
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null;
}

/**
 * Collect heading elements inside editor surfaces.
 *
 * @returns Heading elements with ids when present.
 */
function listEditorHeadings(): HTMLHeadingElement[] {
  return [
    ...document.querySelectorAll<HTMLHeadingElement>(
      ".aura-reset h1, .aura-reset h2, .aura-reset h3, .aura-reset h4, .aura-reset h5, .aura-reset h6, .aura-wysiwyg h1, .aura-wysiwyg h2, .aura-wysiwyg h3, .aura-wysiwyg h4, .aura-wysiwyg h5, .aura-wysiwyg h6",
    ),
  ];
}

/**
 * Resolve an in-document heading/anchor target inside the editor surfaces.
 *
 * Heading ids look like `wysiwyg-1--title--Headings-_6` while Markdown TOC links
 * use GitHub-style `#1-title-headings` — match by id, slug, or text.
 *
 * @param hash - Fragment including or excluding `#`.
 * @param linkText - Optional visible link label for text fallback.
 * @returns Matching element, or null.
 */
function findAnchorTarget(
  hash: string,
  linkText?: string,
): HTMLElement | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  if (!id) {
    return null;
  }

  const byId = document.getElementById(id);
  if (byId) {
    return byId;
  }

  const escaped = CSS.escape(id);
  const rooted = document.querySelector<HTMLElement>(
    `.aura-reset #${escaped}, .aura-wysiwyg #${escaped}`,
  )!;
  if (rooted) {
    return rooted;
  }

  const headings = listEditorHeadings();
  const wantedSlug = normalizeSlug(id);

  const bySlug = headings.find((heading) => {
    if (!heading.id) {
      return false;
    }
    const headingSlug = normalizeSlug(heading.id);
    return (
      headingSlug === wantedSlug ||
      headingSlug.endsWith(wantedSlug) ||
      wantedSlug.endsWith(headingSlug)
    );
  });
  if (bySlug) {
    return bySlug;
  }

  const label = linkText?.trim();
  if (label) {
    const byText = headings.find(
      (heading) => heading.textContent?.trim() === label,
    );
    if (byText) {
      return byText;
    }
  }

  return null;
}

/**
 * Read the destination URL from a link click target.
 *
 * @param el - Element passed by `link.click`.
 * @returns Href string, or empty.
 */
function resolveHref(el: Element): string {
  if (el instanceof HTMLAnchorElement) {
    return el.getAttribute("href")?.trim() ?? "";
  }
  return el.textContent?.trim() ?? "";
}

/**
 * Visible label for matching TOC text to heading text.
 *
 * @param el - Element passed by `link.click`.
 * @returns Trimmed label, or undefined.
 */
function resolveLinkText(el: Element): string | undefined {
  if (el instanceof HTMLAnchorElement) {
    return el.textContent?.trim() || undefined;
  }
  const anchor = el.closest("a") ?? el.closest('[data-type="a"]');
  return anchor?.textContent?.trim() || undefined;
}

/**
 * Open http(s)/mailto links via the signed-in in-app / system preference.
 *
 * @param href - Absolute external URL.
 */
function openExternal(href: string): void {
  openAppUrl(href)
}

/**
 * Handle editor link clicks: scroll for in-doc anchors, open http(s) via
 * Settings “Open links” preference (in-app browser tab or system browser).
 *
 * @param el - Anchor element.
 */
export function handleEditorLinkClick(el: Element): void {
  const href = resolveHref(el);
  if (!href) {
    return;
  }

  const hash = extractHash(href);
  if (hash) {
    findAnchorTarget(hash, resolveLinkText(el))?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    return;
  }

  if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
    openExternal(href);
  }
}
