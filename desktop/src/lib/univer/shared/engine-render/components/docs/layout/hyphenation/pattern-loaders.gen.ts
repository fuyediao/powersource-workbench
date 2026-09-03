/**
 * GeoCRM substitute for upstream Univer's build-time-generated `pattern-loaders.gen.ts`.
 *
 * Upstream generates this file from `./patterns/*.ts` during its own build (tsdown /
 * rolldown) and does not commit it to the OSS repo, so copying `src/` alone does not
 * bring it along. GeoCRM regenerates the same shape with Vite's native
 * `import.meta.glob`, which is a closer match to the original intent (per-language
 * code-split chunks, see the comment in `hyphen.ts`) than hand-listing every import.
 *
 * See `src/lib/univer/ORIGIN.md`.
 */
import type { Lang } from './lang';

/** Lazily-imported hyphenation pattern module (see `RawHyphenPattern` in `./tools`). */
type PatternModule = Record<string, unknown>

const patternModules = import.meta.glob<PatternModule>('./patterns/*.ts')

/** Maps each supported {@link Lang} to a lazy loader for its pattern module. */
export const PATTERN_LOADERS: Partial<Record<Lang, () => Promise<PatternModule>>> = Object.fromEntries(
  Object.keys(patternModules).map((path) => {
    const lang = path.replace('./patterns/', '').replace(/\.ts$/, '')
    return [lang, patternModules[path]]
  }),
)
