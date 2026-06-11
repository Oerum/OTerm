# OTerm — agent notes

## Stack
- **Frontend**: Vue 3 + TypeScript + Vite + Tailwind
- **Desktop**: Tauri 2 (Rust backend in `src-tauri/`)
- **Tests**: Vitest — `npm test`

## Supported Platforms
- **Windows**, **macOS**, and **Linux** must be fully supported. Ensure all code—including file path handling, shell execution, and Tauri commands—is cross-platform and does not make platform-specific assumptions.

## File-scoped commands
| Task | Command |
|------|---------|
| Typecheck | `npx vue-tsc --noEmit` |
| Test file | `npm test -- src/lib/formatGitError.test.ts` |
| Dev | `npm run dev` |
| Tauri dev | `npm run tauri dev` |

## User-visible feedback
- Use **`pushAppToast(message, variant)`** from `src/lib/appToast.ts` for errors, warnings, info, and success.
- Do not rely on `SourceControlPanel.showPanelFeedback` alone — the panel is unmounted when Source Control is closed.
- Git errors: format with `formatGitOperationError()` before toasting.

## Git / branches
- Branch switching UI lives in the **title bar** only (not the status bar).
- Branch switching goes through `switchGitBranch()` in `src/lib/switchGitBranch.ts` (worktree-aware; uses `git switch` via Tauri).
- Use the merge skill for branch merges; use `gh` for GitHub operations.

## Architecture
- Vertical slices per feature; minimal diffs; match existing Vue composable patterns.
- Git IPC: `src/lib/gitApi.ts` → Tauri commands in `src-tauri/src/git/`.

## Commit attribution
AI commits should include:
```
Co-Authored-By: <Agent Name> <noreply@anthropic.com>
```

## Full project verification (must all pass)

Run these before claiming the repo builds clean. Every command must exit **0** with **no errors and no warnings** (Rust uses `-D warnings`).

### Prerequisites

| Requirement | Notes |
|-------------|--------|
| Node.js | `>= 22` (`package.json` `engines`) |
| npm deps | From repo root: `npm ci` |
| Rust toolchain | Stable; `rustfmt` + `clippy` components installed |
| Shell (integration tests) | `pwsh` on PATH for `src-tauri/tests/pty_integration.rs` |

### Commands (run in order)

**Repo root — frontend**

```bash
npm ci
npx vue-tsc --noEmit
npm test
npm run build
```

`npm run build` runs `vue-tsc --noEmit` then `vite build` (production bundle to `dist/`).

**`src-tauri/` — Rust**

Whisper uses a compile-time backend feature. Resolve the platform default (or `OTERM_WHISPER_BACKEND`) once, then pass it to every `cargo` command:

```bash
WHISPER_FEATURE=$(node ../scripts/whisper-backend.mjs)   # bash
# PowerShell: $env:WHISPER_FEATURE = node ..\scripts\whisper-backend.mjs

cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets --features "$WHISPER_FEATURE" -- -D warnings
cargo test --lib --features "$WHISPER_FEATURE"
cargo test --features "$WHISPER_FEATURE"
cd ..
```

`npm run tauri dev|build` injects the feature automatically via `scripts/tauri.mjs`.

- `cargo fmt --check` — formatting drift fails the gate; run `cargo fmt --all` to fix.
- `cargo clippy … -D warnings` — Clippy warnings are treated as errors.
- `cargo test --lib` — unit tests in `src-tauri/src/` (fast).
- `cargo test` — includes `tests/pty_integration.rs` (spawns real shells; slower on Windows).

**Repo root — full desktop app**

```bash
npm run tauri build
```

Runs `beforeBuildCommand` (`npm run build`) then compiles and bundles the Tauri app (`src-tauri/tauri.conf.json`).

### One-shot scripts

**PowerShell (repo root)**

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx vue-tsc --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$WhisperFeature = node scripts/whisper-backend.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not $env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR = "C:\oterm-t" }
Push-Location src-tauri
cargo fmt --all -- --check
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
cargo clippy --all-targets --features $WhisperFeature -- -D warnings
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
cargo test --lib --features $WhisperFeature
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
cargo test --features $WhisperFeature
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location
npm run tauri build
exit $LASTEXITCODE
```

**Bash (repo root)**

```bash
npm ci && \
npx vue-tsc --noEmit && \
npm test && \
npm run build && \
WHISPER_FEATURE=$(node scripts/whisper-backend.mjs) && \
( cd src-tauri && \
  cargo fmt --all -- --check && \
  cargo clippy --all-targets --features "$WHISPER_FEATURE" -- -D warnings && \
  cargo test --lib --features "$WHISPER_FEATURE" && \
  cargo test --features "$WHISPER_FEATURE" ) && \
npm run tauri build
```

### Quick reference

| Step | Command | Validates |
|------|---------|-----------|
| 1 | `npm ci` | Lockfile install |
| 2 | `npx vue-tsc --noEmit` | Vue/TS types |
| 3 | `npm test` | Vitest (`vitest run`) |
| 4 | `npm run build` | Typecheck + Vite production build |
| 5 | `cargo fmt --all -- --check` | Rust formatting |
| 6 | `cargo clippy --all-targets --features <whisper-backend> -- -D warnings` | Rust lints (warnings denied) |
| 7 | `cargo test --lib --features <whisper-backend>` | Rust unit tests |
| 8 | `cargo test --features <whisper-backend>` | Rust unit + integration tests |
| 9 | `npm run tauri build` | End-to-end desktop build |

### Optional (not part of default gate)

| Command | Purpose |
|---------|---------|
| `cargo check` | Fast Rust compile check (subset of `clippy`/`test`) |
| `npm run tauri dev` | Manual smoke test (dev server + Tauri) |
| `npx fallow dead-code --fail-on-issues` | TS/JS unused-code audit (devDependency; no `fallow.toml` yet) |
| `npx @dependency-check-updates/cli -u` | Complete project dependency update (treat as breaking changes; only run if there are no git changes and the user explicitly requests a complete dependency update) |

### Success criteria

- All nine gate commands exit **0**.
- No TypeScript errors from `vue-tsc`.
- No Vitest failures.
- No Vite/Rollup build errors.
- No `rustfmt` diff output.
- No Clippy warnings (`-D warnings`).
- All Rust tests green, including PTY integration tests when `pwsh` is available.
- `npm run tauri build` completes and produces the bundled app under `src-tauri/target/release/bundle/`.
