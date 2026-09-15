## 2025-02-28 - Missing ARIA Labels on Empty State Buttons
**Learning:** Found that some buttons in empty states or error states within the `DockerManagerView` lacked descriptive labels, which could confuse screen reader users trying to understand the purpose of actions like "Retry Connection".
**Action:** Always ensure that call-to-action buttons, especially in error recovery or empty states, have appropriate `aria-label` attributes if their visual text isn't sufficiently descriptive out of context.

## 2024-05-19 - Add Loading Spinner and Focus States to PR Dialog
**Learning:** Found an interactive UI state (PR creation) missing visual feedback for async operations, and buttons missing keyboard focus outlines, common accessibility gaps that are easy to fix but highly impactful for user confidence.
**Action:** Always check async submit buttons for a loading state (`busy` prop) and ensure dialog buttons have proper `focus-visible` styles mapped to theme accent colors.

## 2026-09-09 - [Add focus-visible states to standard dialog buttons]
**Learning:** Found that several standard dialogs (like `CreateBranchDialog`, `CreateTagDialog`, `MergeBranchDialog`, etc.) have buttons lacking consistent `focus-visible` styles which were present on `ConfirmDialog` and `CreatePullRequestDialog`. This makes keyboard navigation less clear and less accessible.
**Action:** Applied the standard tailwind focus classes (`focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--oterm-accent)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--oterm-elevated)]`) to all dialog buttons for consistent keyboard accessibility.

## 2024-05-24 - Headless Browser UI Verification
**Learning:** The Vite dev server (`http://localhost:1420`) may load a blank screen during headless Playwright tests because the Vue application heavily depends on Tauri backend APIs (like window state, fs, etc.) which aren't available in a standard browser environment.
**Action:** Do not rely on visual screenshots from the raw Vite server for layout/focus verification unless mock data or a Tauri-compatible testing harness is explicitly set up. Rely on reading the code and running unit tests.

## 2025-02-26 - Add focus state and aria-label to Jump button
**Learning:** Found an opportunity to improve accessibility on a Jump button for the `AgentOpsRow` component. The button previously had no focus indicator, which is confusing for keyboard users, and lacked an ARIA label.
**Action:** Always add keyboard focus states (`focus-visible`) and descriptive `aria-label` attributes to interactive elements, especially icon-like or context-specific buttons that might not be fully self-explanatory from text alone. Use `var(--oterm-accent)` consistently for the ring color.
