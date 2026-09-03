# Mihomo (in-tree)

This directory is the [MetaCubeX Mihomo](https://github.com/MetaCubeX/mihomo)
kernel (upstream Alpha branch snapshot). `npm run dev` / `npm run build`
compile this tree with Go (`scripts/clash-prebuild.mjs`)
into [`bin/mihomo`](bin/) (gitignored). Electron main starts that binary and talks
to it over a unix socket (Windows: named pipe). The renderer never opens a
controller TCP port.

- **Upstream**: <https://github.com/MetaCubeX/mihomo> (Alpha branch)
- **License**: GPL-3.0-only — copy in [`LICENSE`](LICENSE); upstream:
  <https://github.com/MetaCubeX/mihomo/blob/Alpha/LICENSE>
- **Reason**: Clash uses Mihomo (`verge-mihomo`). Needs a local **Go** toolchain
  (Rust is not required).
- **Lint**: oxlint and `tsc --noEmit` exclude this tree.

## Layout

| Path | Role |
|------|------|
| `*.go` packages | Mihomo kernel |
| [`go.mod`](go.mod) / [`go.sum`](go.sum) | Go module |
| [`Makefile`](Makefile) | Same `go build` as Electron prebuild (`bin/mihomo`) |

CI, Docker, Nix, docs, GitHub templates, and the `test/` integration suite
were not copied from upstream.
