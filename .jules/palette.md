## 2025-02-28 - Missing ARIA Labels on Empty State Buttons
**Learning:** Found that some buttons in empty states or error states within the `DockerManagerView` lacked descriptive labels, which could confuse screen reader users trying to understand the purpose of actions like "Retry Connection".
**Action:** Always ensure that call-to-action buttons, especially in error recovery or empty states, have appropriate `aria-label` attributes if their visual text isn't sufficiently descriptive out of context.
