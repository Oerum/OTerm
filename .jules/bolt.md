## 2024-05-24 - Vue Computed Property Array Iteration
**Learning:** In Vue computed properties that process large datasets (like git diffs with thousands of lines), chaining array operations like `.filter().length` causes a new array to be allocated on every evaluation. This creates significant garbage collection pressure.
**Action:** When calculating summaries or counts over large arrays in computed properties, use a single `for` loop to increment counters instead of `.filter(...).length`. This is an (n)$ operation with zero array allocations.

## 2024-07-20 - GitCommitGraph rendering bottleneck
**Learning:** Calling string parsing methods (like parseDecorations and regex replacements) directly in Vue templates for long lists is extremely expensive because Vue triggers a full re-render on hover effects.
**Action:** Always pre-calculate complex string operations or array filtering in a `computed` property for list items instead of doing it inline in the template.

## 2026-07-24 - ShallowRefs for Large Lists
**Learning:** Large arrays of complex objects in Vue 3 (like thousands of git commits) cause massive reactivity overhead and memory bloat when using `ref`, because Vue deeply proxies every property.
**Action:** Use `shallowRef` for state variables that hold large lists where the entire array is replaced rather than mutated in-place.

## 2024-11-20 - SVG VDOM Patching Bottleneck on Hover
**Learning:** In large SVG graphs with thousands of nodes, applying dynamic opacity or stroke widths based on hover state (e.g., `hoveredRowIndex`) causes Vue to re-evaluate and patch every single node on every mouse movement. This leads to severe UI lag.
**Action:** Use Vue's `v-memo` directive in loops to explicitly declare dependencies for list items. E.g., `v-memo="[hoveredRowIndex === index, hoveredColor === row.color]"`. This instructs Vue to skip re-rendering nodes whose hover state hasn't changed.

## 2024-07-30 - Optimize Array.includes + String.split for file type parsing
**Learning:** Checking file extensions with `String.prototype.split('.')` and `Array.prototype.includes()` creates significant overhead inside loops or directory traversals due to O(N) array allocation for every file name and O(N) linear lookups in extension arrays.
**Action:** Replace `String.split('.')` with fast slicing using `String.lastIndexOf('.')`. Replace arrays with `Set.has()` lookups to achieve O(1) time complexity when checking file extensions against static predefined lists.
