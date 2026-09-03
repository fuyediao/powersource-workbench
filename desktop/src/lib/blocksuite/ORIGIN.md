# BlockSuite (Folio)

Folio mounts **npm** `@blocksuite/affine@0.22.4` (not the AFFiNE Electron app, not AFFiNE cloud).

## Bootstrapping (`patch-blocksuite-exports.mjs`)

Runs on `postinstall` / `dev` / `typecheck` / `build`:

1. Rewrite package `exports` from `./src/*.ts` → `./dist/*.js` (+ `.d.ts`) so tsc does not typecheck decorator-incompatible sources.
2. Strip TC39 `accessor` keywords from every `dist/**/*.js` (Chromium rejects `accessor color = …`).
3. Repair TypeScript's generated decorator descriptor fallback after stripping `accessor`, so
   decorated model fields can initialize even when no prototype descriptor exists yet.

## Vite interop (one-shot)

- **Prebundle** Folio BlockSuite entries + Atlaskit DnD + every installed `lodash.*` so CJS default/named exports work.
- **Alias** `bind-event-listener` → `shims/bind-event-listener.ts` (CJS-only; Atlaskit needs ESM `{ bind }`).
- **Plugin** wraps any remaining `lodash.*` CJS as `export default` if served outside the prebundle.
- Backup transform still strips any leftover `accessor` in `@blocksuite/*`.

## Folio view scope

Folio uses an explicit page-only view-extension allowlist. It includes page blocks, inline
content, document widgets, and the database/data-view stack. Gfx, surface, connector, frame,
and every edgeless-only extension are intentionally excluded so their static initializers never
enter the Folio renderer import graph.

## Layout

| Path | Role |
| --- | --- |
| `folio-workspace.ts` | `TestWorkspace` + store/view extensions; Yjs `spaceDoc` seed/load |
| `shims/bind-event-listener.ts` | ESM facade for Atlaskit DnD |
| `../components/folio/folio-editor.tsx` | `BlockStdScope.render()` host; Realtime Yjs + awareness |
