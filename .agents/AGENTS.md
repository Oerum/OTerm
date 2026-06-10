# OTerm — agent notes

## Stack
- **Frontend**: Vue 3 + TypeScript + Vite + Tailwind
- **Desktop**: Tauri 2 (Rust backend in `src-tauri/`)
- **Tests**: Vitest — `npm test`

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
