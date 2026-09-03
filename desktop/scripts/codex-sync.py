"""Copy a pruned Codex `codex-rs` tree into `src/lib/codex`.

Keeps crates reachable from `codex-app-server` (plus Linux/Windows sandbox
helpers). Drops TUI, CLI chrome, VS Code, Bazel, docs, and tests.
"""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

ELECTRON_ROOT = Path(__file__).resolve().parents[1]
DEST = ELECTRON_ROOT / "src" / "lib" / "codex"
DEFAULT_SOURCE = Path(r"F:\Documents\ai\codex-main\codex-rs")

SKIP_CRATES: set[str] = set()

EXTRA_CRATES = ("bwrap", "linux-sandbox", "windows-sandbox-rs")
IGNORE_DIR_NAMES = {"tests", "benches", "target"}
IGNORE_FILE_NAMES = {"BUILD.bazel"}


def workspace_path_map(ws_text: str) -> dict[str, str]:
    """Map workspace package names to relative crate paths.

    Args:
        ws_text: Root Cargo.toml text.

    Returns:
        Package name to path.
    """
    mapping: dict[str, str] = {}
    for match in re.finditer(r"^([A-Za-z0-9_-]+)\s*=\s*\{([^}]*)\}", ws_text, re.M):
        name, body = match.group(1), match.group(2)
        path_match = re.search(r'path\s*=\s*"([^"]+)"', body)
        if path_match:
            mapping[name] = path_match.group(1).replace("\\", "/")
    return mapping


def parse_crate(root: Path, crate_rel: str, ws_paths: dict[str, str]) -> set[str]:
    """Return relative crate directories referenced by a package manifest.

    Args:
        root: `codex-rs` root.
        crate_rel: Crate directory relative to `root`.
        ws_paths: Workspace dependency path map.

    Returns:
        Relative crate paths.
    """
    cargo = root / crate_rel / "Cargo.toml"
    if not cargo.exists():
        return set()
    text = cargo.read_text(encoding="utf-8")
    deps: set[str] = set()
    for match in re.finditer(r'path\s*=\s*"([^"]+)"', text):
        raw = match.group(1).replace("\\", "/")
        if raw.endswith(".rs"):
            continue
        resolved = (root / crate_rel / raw).resolve()
        if not (resolved / "Cargo.toml").exists():
            continue
        try:
            rel = resolved.relative_to(root.resolve()).as_posix()
        except ValueError:
            continue
        deps.add(rel)
    for match in re.finditer(r"^([A-Za-z0-9_-]+)\s*=\s*\{([^}]*)\}", text, re.M):
        name, body = match.group(1), match.group(2)
        if "workspace" not in body:
            continue
        mapped = ws_paths.get(name) or ws_paths.get(name.replace("_", "-"))
        if mapped:
            deps.add(mapped.replace("\\", "/"))
    return deps


def reachable_crates(root: Path) -> list[str]:
    """Compute crate directories needed to build `codex-app-server`.

    Args:
        root: `codex-rs` root.

    Returns:
        Sorted relative crate paths.
    """
    ws_paths = workspace_path_map((root / "Cargo.toml").read_text(encoding="utf-8"))
    seen: set[str] = set()
    stack = ["app-server", *EXTRA_CRATES]
    while stack:
        current = stack.pop().replace("\\", "/").lstrip("./")
        if current in seen or current in SKIP_CRATES:
            continue
        seen.add(current)
        for dep in parse_crate(root, current, ws_paths):
            dep = dep.replace("\\", "/").lstrip("./")
            if dep not in seen and dep not in SKIP_CRATES:
                stack.append(dep)
    crates = []
    for rel in sorted(seen):
        if rel in SKIP_CRATES:
            continue
        if (root / rel / "Cargo.toml").exists():
            crates.append(rel)
    return crates


def original_members(ws_text: str) -> list[str]:
    """Parse the workspace members array.

    Args:
        ws_text: Root Cargo.toml text.

    Returns:
        Member paths.
    """
    match = re.search(r"members\s*=\s*\[(.*?)\]", ws_text, re.S)
    if not match:
        return []
    return re.findall(r'"([^"]+)"', match.group(1))


def rewrite_members(ws_text: str, members: list[str]) -> str:
    """Replace the workspace members list.

    Args:
        ws_text: Root Cargo.toml text.
        members: Kept member paths.

    Returns:
        Updated manifest text.
    """
    body = ",\n    ".join(f'"{item}"' for item in members)
    replacement = f"members = [\n    {body},\n]"
    return re.sub(r"members\s*=\s*\[.*?\]", replacement, ws_text, count=1, flags=re.S)


BENCH_OR_TEST_TARGET_RE = re.compile(
    r"^\[\[(?:bench|test)\]\]\n(?:(?!^\[).*\n?)*", re.M
)


def strip_excluded_target_sections(manifest_text: str) -> str:
    """Drop `[[bench]]` / `[[test]]` manifest targets.

    `ignore_copy` always excludes `benches/` and `tests/` directories, so a
    surviving `[[bench]]`/`[[test]]` target (pointing at a now-missing file)
    makes `cargo` fail to parse the manifest even without building it.

    Args:
        manifest_text: Crate `Cargo.toml` text after copy.

    Returns:
        Manifest text with those target tables removed.
    """
    return BENCH_OR_TEST_TARGET_RE.sub("", manifest_text)


def ignore_copy(_directory: str, names: list[str]) -> set[str]:
    """shutil.copytree ignore hook.

    Args:
        _directory: Current directory.
        names: Entry names.

    Returns:
        Names to skip.
    """
    skipped: set[str] = set()
    for name in names:
        if name in IGNORE_DIR_NAMES or name in IGNORE_FILE_NAMES:
            skipped.add(name)
        elif name.endswith(".bazel"):
            skipped.add(name)
    return skipped


def copy_tree(source: Path, dest: Path) -> int:
    """Copy the pruned workspace into `dest`.

    Args:
        source: Upstream `codex-rs` root.
        dest: In-tree destination.

    Returns:
        Number of crate directories copied.
    """
    crates = reachable_crates(source)
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)

    ws_text = (source / "Cargo.toml").read_text(encoding="utf-8")
    members = [item for item in original_members(ws_text) if item in set(crates)]
    for rel in crates:
        if "/tests/" in rel.replace("\\", "/") and rel not in members:
            members.append(rel)
    members.sort()
    (dest / "Cargo.toml").write_text(rewrite_members(ws_text, members), encoding="utf-8")

    for name in ("Cargo.lock", "rust-toolchain.toml", "clippy.toml"):
        src_file = source / name
        if src_file.exists():
            shutil.copy2(src_file, dest / name)

    cargo_config = source / ".cargo" / "config.toml"
    if cargo_config.exists():
        (dest / ".cargo").mkdir(parents=True, exist_ok=True)
        shutil.copy2(cargo_config, dest / ".cargo" / "config.toml")

    license_src = source.parent / "LICENSE"
    notice_src = source.parent / "NOTICE"
    if license_src.exists():
        shutil.copy2(license_src, dest / "LICENSE")
    if notice_src.exists():
        shutil.copy2(notice_src, dest / "NOTICE")

    for rel in crates:
        src_dir = source / rel
        dst_dir = dest / rel
        dst_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src_dir, dst_dir, ignore=ignore_copy, dirs_exist_ok=True)
        manifest = dst_dir / "Cargo.toml"
        if manifest.exists():
            original = manifest.read_text(encoding="utf-8")
            stripped = strip_excluded_target_sections(original)
            if stripped != original:
                manifest.write_text(stripped, encoding="utf-8")

    vendor = source / "vendor" / "bubblewrap"
    if vendor.exists():
        shutil.copytree(
            vendor,
            dest / "vendor" / "bubblewrap",
            ignore=ignore_copy,
            dirs_exist_ok=True,
        )

    return len(crates)


def main() -> int:
    """Copy the pruned Codex workspace and print the crate count.

    Returns:
        Process exit code.
    """
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not (source / "Cargo.toml").exists():
        print(f"missing Codex workspace at {source}", file=sys.stderr)
        return 1
    count = copy_tree(source, DEST)
    print(f"copied {count} crates to {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
