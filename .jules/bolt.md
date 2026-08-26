## 2024-05-18 - [Fix reactivity issues with shallowRef on Vue collections]
**Learning:** Using `shallowRef` to optimize large collections (like `Map` and `Set`) bypasses deep proxying but means that mutations via `.add()`, `.set()`, `.delete()`, or array `.push()` are no longer tracked. Vue requires explicit re-assignment (e.g., `mySet.value = new Set(mySet.value)`) for components to re-render.
**Action:** When migrating `ref` to `shallowRef` for collections, audit all call sites. Replace direct mutations with explicit reassignments (e.g., `map.value = new Map(map.value).set(...)`).
