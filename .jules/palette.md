## 2025-02-26 - Add focus state and aria-label to Jump button
**Learning:** Found an opportunity to improve accessibility on a Jump button for the `AgentOpsRow` component. The button previously had no focus indicator, which is confusing for keyboard users, and lacked an ARIA label.
**Action:** Always add keyboard focus states (`focus-visible`) and descriptive `aria-label` attributes to interactive elements, especially icon-like or context-specific buttons that might not be fully self-explanatory from text alone. Use `var(--oterm-accent)` consistently for the ring color.
