## 2026-07-20 - Added aria-expanded to collapsible sections
**Learning:** Collapsible accordion buttons in SourceControlPanel and GitCommitGraph lacked `aria-expanded` attributes, which are essential for screen readers to know if a section is open or closed.
**Action:** Always ensure any toggle button that expands/collapses content has a dynamically bound `aria-expanded` attribute.
