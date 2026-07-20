## 2024-07-20 - GitCommitGraph rendering bottleneck
**Learning:** Calling string parsing methods (like parseDecorations and regex replacements) directly in Vue templates for long lists is extremely expensive because Vue triggers a full re-render on hover effects.
**Action:** Always pre-calculate complex string operations or array filtering in a `computed` property for list items instead of doing it inline in the template.
