## 2025-02-18 - XSS Attribute Injection in Markdown Link Renderer
**Vulnerability:** The custom `marked` renderer in `src/lib/markdown.ts` directly interpolated the `href` variable into an HTML string without HTML-encoding double quotes (`"`). This allowed attribute injection via crafted markdown links (e.g., `[link](" onclick="alert(1)"))`).
**Learning:** Custom markdown renderers that manually construct HTML strings must always HTML-encode user input (especially double quotes in attributes) to prevent attribute breakout, even if a downstream sanitizer like `DOMPurify` is used. This is defense-in-depth.
**Prevention:** Always use `.replace(/"/g, "&quot;")` on attribute values before string interpolation in custom renderers.
