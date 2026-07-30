## 2024-05-18 - [Missing aria-labels on icon-only buttons]
**Learning:** Found multiple icon-only action buttons relying solely on `title` attributes for tooltips, which negatively impacts screen reader compatibility. A consistent pattern across Vue components like DockerManagerView requires `aria-label` mirroring the tooltip intent.
**Action:** Audit and enforce `aria-label` additions proactively on all SVG-only `<button>`s regardless of tooltip implementations.
