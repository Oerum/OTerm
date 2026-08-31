## 2025-02-28 - Missing ARIA Labels on Empty State Buttons
**Learning:** Found that some buttons in empty states or error states within the `DockerManagerView` lacked descriptive labels, which could confuse screen reader users trying to understand the purpose of actions like "Retry Connection".
**Action:** Always ensure that call-to-action buttons, especially in error recovery or empty states, have appropriate `aria-label` attributes if their visual text isn't sufficiently descriptive out of context.
## 2024-05-19 - Add Loading Spinner and Focus States to PR Dialog
**Learning:** Found an interactive UI state (PR creation) missing visual feedback for async operations, and buttons missing keyboard focus outlines, common accessibility gaps that are easy to fix but highly impactful for user confidence.
**Action:** Always check async submit buttons for a loading state (`busy` prop) and ensure dialog buttons have proper `focus-visible` styles mapped to theme accent colors.
