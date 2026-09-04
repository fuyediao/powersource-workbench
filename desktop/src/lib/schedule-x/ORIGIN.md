# Schedule-X calendar engine (in-tree)

This directory is a trimmed, in-repo copy of Schedule-X **source** used by Workbench
Electron Calendar, fused the same way Aura lives under [`../mdcore/`](../mdcore/)
and Univer under [`../univer/`](../univer/) — first-party `src/lib` TypeScript,
not an npm install and not a side `vendor/` tree.

- **Upstream**: <https://github.com/schedule-x/schedule-x> (calendar / plugins) and
  <https://github.com/schedule-x/react> (React adapter)
- **Versions**: monorepo packages **v3.7.3**; `@schedule-x/react` **v3.7.0**
  (pinned to the last free drag-and-drop / resize line — Schedule-X v4 moved those
  plugins to premium `@sx-premium/*`)
- **License**: MIT — upstream text:
  <https://github.com/schedule-x/schedule-x/blob/v3.7.3/LICENSE>
  (not copied into each package folder)
- **Reason**: keep the calendar stack auditable and patchable next to Workbench chrome
  (brand token bridge in `src/styles/calendar-host.css`, personal Supabase
  scope). Runtime still uses Preact inside the calendar engine; Workbench shell stays
  React via the in-tree adapter.
- **Lint**: oxlint ignores `src/lib/schedule-x/**` (upstream style). Root `tsc`
  excludes the same tree; the app types the public API via published `.d.ts` under
  each package’s `types/` while Vite compiles the TypeScript sources.

## Layout

Upstream package names are unchanged (`@schedule-x/calendar` still resolves to the
`calendar` folder). Each package keeps its `src/` tree (tests stripped).

| Folder | Role |
|--------|------|
| [`calendar/`](calendar/) | Core Preact calendar (`src/index.ts`) |
| [`shared/`](shared/) | Shared types, utils, icons |
| [`date-picker/`](date-picker/) | Header date picker (calendar dependency) |
| [`translations/`](translations/) | Built-in locale packs |
| [`events-service/`](events-service/) | Events CRUD plugin |
| [`drag-and-drop/`](drag-and-drop/) | Free DnD plugin (3.7.x) |
| [`resize/`](resize/) | Free resize plugin (3.7.x) |
| [`react/`](react/) | React adapter (`ScheduleXCalendar`, `useCalendarApp`) |
| [`theme-default/`](theme-default/) | Published CSS under `lib/` (SCSS pipeline not reproduced) |

Vite resolves `@schedule-x/<name>` and deep `@schedule-x/<name>/src/...` via
`workbench:resolve-schedule-x` in [`../../../vite.config.ts`](../../../vite.config.ts).
Bare `@schedule-x/calendar` maps to [`calendar/src/workbench-entry.ts`](calendar/src/workbench-entry.ts)
(createCalendar + the six host views, not the upstream barrel). Calendar and
date-picker default locale packs are [`translations/src/workbench.ts`](translations/src/workbench.ts)
(en / zh-CN / zh-TW only).
Preact JSX for non-`react` packages is compiled by `workbench:schedule-x-preact-jsx`.
TypeScript path maps for the app-facing packages live in
[`../../../tsconfig.json`](../../../tsconfig.json) (`types/core.d.ts` / react
`types/index.d.ts`).

## What is excluded

- Upstream unit tests (`*.spec.ts`, `__test__/`), Cypress, website, docs site.
- Unused plugins (`event-modal`, `recurrence`, `ical`, `calendar-controls`, …).
- Per-package `package.json` / build tooling (entries are wired in Vite).
- Theme SCSS sources — only the built `lib/*.css` from `@schedule-x/theme-default@3.7.3`
  (same idea as Univer keeping `lib/index.css`).
- Schedule-X v4+ premium plugins (`@sx-premium/drag-and-drop`, draw, etc.).
- Root CRM `schedule-x/` clone (gitignored local reference only; often a newer major).

## Runtime peers (still npm)

- `preact`, `@preact/signals`, `temporal-polyfill` — small shared runtimes, same role as
  `@univerjs/icons` for Univer.
