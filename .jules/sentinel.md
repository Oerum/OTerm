## 2025-02-18 - XSS Attribute Injection in Markdown Link Renderer
**Vulnerability:** The custom `marked` renderer in `src/lib/markdown.ts` directly interpolated the `href` variable into an HTML string without HTML-encoding double quotes (`"`). This allowed attribute injection via crafted markdown links (e.g., `[link](" onclick="alert(1)"))`).
**Learning:** Custom markdown renderers that manually construct HTML strings must always HTML-encode user input (especially double quotes in attributes) to prevent attribute breakout, even if a downstream sanitizer like `DOMPurify` is used. This is defense-in-depth.
**Prevention:** Always use `.replace(/"/g, "&quot;")` on attribute values before string interpolation in custom renderers.

## 2024-05-24 - Arbitrary URI Scheme Execution via Markdown Links
**Vulnerability:** The Markdown renderer component allowed any URL scheme parsed by DOMPurify (which strips `javascript:` but allows `file://`, `smb://`, or custom application schemes) to be passed directly to the Tauri `openUrl` API, potentially allowing arbitrary code execution, local file access, or unexpected application behaviors.
**Learning:** Sanitizing HTML/Markdown for XSS (e.g. DOMPurify) is insufficient when integrating with desktop APIs like Tauri's `openUrl`. Desktop APIs can handle many more URI schemes natively, which requires explicit validation/allowlisting at the point of API invocation.
**Prevention:** Always validate and allowlist URL protocols (e.g., `http:`, `https:`, `mailto:`) before passing them to native/shell APIs like `openUrl` or `openExternal`.

## 2026-07-27 - Fix command injection in shellQuote
**Vulnerability:** The `shellQuote` function in `src/lib/sshOpenSshArgs.ts` used a weak regex `!/[\s"'\\$\`]/` that did not escape critical shell metacharacters like `;`, `&`, `|`, `<` and `>`. This allowed for potential command injection if user-controlled input (like environment variables or proxy hosts) contained these characters when building SSH/mosh commands.
**Learning:** Shell escaping must cover all metacharacters or use a completely safe approach like wrapping everything in single quotes (`'`) and escaping internal single quotes. A blacklist of characters is often incomplete and unsafe.
**Prevention:** Always use a single-quote based quoting mechanism for shell strings instead of trying to selectively escape or double-quote strings, because double-quotes still allow some forms of interpolation and metacharacters if not perfectly escaped.
