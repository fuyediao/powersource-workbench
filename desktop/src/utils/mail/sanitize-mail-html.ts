/**
 * Strips scripts, iframes, and inline handlers from an HTML mail body.
 * Render the result in a sandboxed iframe (`allow-same-origin` + `allow-modals`, no `allow-scripts` / `allow-popups`).
 * Parent intercepts anchor clicks so http(s) follows Settings link-open preference.
 * @param raw - Provider HTML.
 * @returns Safer HTML string.
 */
export function sanitizeMailHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
}
