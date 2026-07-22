## 2024-05-24 - Vue Computed Property Array Iteration
**Learning:** In Vue computed properties that process large datasets (like git diffs with thousands of lines), chaining array operations like `.filter().length` causes a new array to be allocated on every evaluation. This creates significant garbage collection pressure.
**Action:** When calculating summaries or counts over large arrays in computed properties, use a single `for` loop to increment counters instead of `.filter(...).length`. This is an (n)$ operation with zero array allocations.
