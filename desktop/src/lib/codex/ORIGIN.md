# Codex app-server (in-tree)

This directory is a pruned, in-repo copy of the [OpenAI Codex](https://github.com/openai/codex)
Rust workspace (`codex-rs`). `npm run harness:prebuild` compiles
`codex-app-server` into [`bin/`](bin/) (gitignored). Electron main spawns that
binary over stdio JSON-RPC. The renderer never talks to Codex directly.

- **Upstream**: <https://github.com/openai/codex> (`codex-rs/`)
- **Synced**: 2026-09-02, upstream `main` commit
  [`8d32abcd017d06511b46050cff9dbba8738fc2fa`](https://github.com/openai/codex/commit/8d32abcd017d06511b46050cff9dbba8738fc2fa)
- **License**: Apache-2.0 — copy in [`LICENSE`](LICENSE); notice in [`NOTICE`](NOTICE)
- **Reason**: Harness workflow is local Codex `app-server` (files, shell, sandbox,
  approvals, third-party MCP). Do not use the npm `@openai/codex` CLI.
- **Lint**: oxlint and `tsc --noEmit` exclude this tree.

## Scope

Kept: crates reachable from `codex-app-server`, plus Linux/Windows sandbox
helpers and `vendor/bubblewrap`. Refresh with
[`../../../scripts/codex-sync.py`](../../../scripts/codex-sync.py).

Dropped from upstream (not required to spawn `codex-app-server --listen stdio://`):

- TUI (`tui/`) and the `codex` CLI chrome (`cli/`)
- VS Code extension, TypeScript SDK, docs, Bazel, `v8-poc`
- Cloud-task clients, `mcp-server`, Ollama/LM Studio adapters, `scheduled_tasks`

Codex built-in memories stay **off** at runtime; the VPS slim profile
(`MEMORY.md` / `USER.md`) is the memory store. The Hermes file-contract
sources live in [`backend/lib/hermes`](../../../../backend/lib/hermes).
Do not strip shell / `apply_patch` / sandbox from this tree.

## GeoCRM overlay (not part of upstream — `codex-sync.py` wipes this directory,
## restore these paths from git after every sync)

- [`core/generic-system-prompt.md`](core/generic-system-prompt.md) — vendor-neutral
  fallback `BASE_INSTRUCTIONS` (GeoCRM work agent: CRM analysis, Office,
  and code including viewable web pages), wired into
  [`models-manager/src/model_info.rs`](models-manager/src/model_info.rs).
  Catalog models still use dedicated vendor dumps; Electron prepends the same
  routing on `thread/start` via `electron/shared/harness-work-agent.ts`.
- [`core/model-prompts/*.md`](core/model-prompts/) — dedicated per-catalog-id vendor
  prompt dumps (ChatGPT, Gemini, Claude, Grok, Kimi, MiniMax, Mistral, Perplexity),
  dispatched by
  [`models-manager/src/model_prompts.rs`](models-manager/src/model_prompts.rs)
  (`dedicated_instructions_for_slug`).
- `model_info::apply_catalog_prompt` (called from `manager.rs` right after
  `model_info_from_slug` / the remote-catalog match, before `with_config_overrides`)
  installs the dedicated dump — or `BASE_INSTRUCTIONS` when the slug has none — as
  `instructions_template`, skipping the two local personality slugs
  (`gpt-5.2-codex`, `exp-codex-personality`) so their `{{ personality }}` template
  survives.
- `pub(crate) mod model_prompts;` in
  [`models-manager/src/lib.rs`](models-manager/src/lib.rs).
- [`.gitignore`](.gitignore) (`/target/`, `/bin/`).

## Layout

| Path | Role |
|------|------|
| `app-server/` | `codex-app-server` binary (stdio JSON-RPC) |
| other workspace crates | Compile-time dependencies of that binary |
| `vendor/bubblewrap/` | Linux sandbox helper sources |
| [`bin/`](bin/) | `codex-app-server` (gitignored; `npm run harness:prebuild`) |
