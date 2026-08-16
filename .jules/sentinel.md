## 2025-02-18 - Restrict global DOMPurify attribute injection
**Vulnerability:** The global DOMPurify `ADD_ATTR` configuration permitted arbitrary attribute injection on any element.
**Learning:** Adding attributes to the global `ADD_ATTR` list, even relatively safe ones like `target` and `rel`, allows them to be applied to any HTML tag during markdown rendering. This can introduce subtle HTML injection vectors.
**Prevention:** Instead of using global attribute allowlists, use DOMPurify hooks (e.g., `uponSanitizeElement`) to explicitly restrict attributes like `target="_blank"` and `rel="noopener noreferrer"` to specific elements (e.g., `<a>`).
