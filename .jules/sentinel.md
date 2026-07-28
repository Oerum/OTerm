## 2025-02-18 - XSS Attribute Injection in Markdown Link Renderer
**Vulnerability:** The custom `marked` renderer in `src/lib/markdown.ts` directly interpolated the `href` variable into an HTML string without HTML-encoding double quotes (`"`). This allowed attribute injection via crafted markdown links (e.g., `[link](" onclick="alert(1)"))`).
**Learning:** Custom markdown renderers that manually construct HTML strings must always HTML-encode user input (especially double quotes in attributes) to prevent attribute breakout, even if a downstream sanitizer like `DOMPurify` is used. This is defense-in-depth.
**Prevention:** Always use `.replace(/"/g, "&quot;")` on attribute values before string interpolation in custom renderers.
## 2024-05-24 - Arbitrary URI Scheme Execution via Markdown Links
**Vulnerability:** The Markdown renderer component allowed any URL scheme parsed by DOMPurify (which strips `javascript:` but allows `file://`, `smb://`, or custom application schemes) to be passed directly to the Tauri `openUrl` API, potentially allowing arbitrary code execution, local file access, or unexpected application behaviors.
**Learning:** Sanitizing HTML/Markdown for XSS (e.g. DOMPurify) is insufficient when integrating with desktop APIs like Tauri's `openUrl`. Desktop APIs can handle many more URI schemes natively, which requires explicit validation/allowlisting at the point of API invocation.
**Prevention:** Always validate and allowlist URL protocols (e.g., `http:`, `https:`, `mailto:`) before passing them to native/shell APIs like `openUrl` or `openExternal`.
