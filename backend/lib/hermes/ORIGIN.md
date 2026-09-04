# Hermes file-contract kernel (in-tree)

This directory is a pruned, in-repo copy of [Nous Hermes Agent](https://github.com/NousResearch/hermes-agent)
sources that define the Harness memory and cron **file contract**. Refresh with
[`../scripts/hermes-sync.py`](../scripts/hermes-sync.py) from
`F:\Documents\ai\hermes-agent-main` (or pass another checkout as argv).

- **Upstream**: <https://github.com/NousResearch/hermes-agent>
- **License**: MIT — copy in [`LICENSE`](LICENSE)
- **Runtime**: do **not** run this Python as a product agent. Harness memory,
  skills, and `jobs.json` are served by `geocrm-api` (`internal/harness`).
  Electron reviews `MEMORY.md` / `USER.md` with the user's Settings API key;
  Go clamps and writes the files.

## Scope

Kept (small on purpose):

| Path | Role |
|------|------|
| `tools/memory_tool.py` | Bounded `MEMORY.md` / `USER.md` (2200 / 1375 chars) |
| `tools/threat_patterns.py` | Memory injection scan used by the memory tool |
| `agent/memory_provider.py` | Provider interface |
| `agent/learning_mutations.py` | Memory vs profile file mapping |
| `cron/jobs.py` | `jobs.json` layout |
| `docs/memory.md` | English upstream memory guide |

Dropped from upstream: TUI, Desktop, website (except the memory guide),
Docker / s6, gateway, Matrix, Playwright, optional-skills, tests, the
`run_agent` loop, Node/OpenRouter/Vercel gateway HTTP in `hermes_constants`,
OpenAI/httpx proxy helpers in `utils.py`, `cron/scheduler.py`, and
`agent/background_review.py` (those called official provider APIs).

Imports in these files still point at the full upstream tree. They are a
reference for later edits, not a runnable package.
