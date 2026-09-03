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

## 2025-02-14 - Arbitrary URI Scheme Execution via openUrl
**Vulnerability:** Calls to `@tauri-apps/plugin-opener` `openUrl` lacked protocol validation in multiple components.
**Learning:** By default, OS-level URL openers will attempt to handle any URI scheme passed to them (e.g., `file://`, custom handlers), which can lead to arbitrary program execution if user-controlled inputs (like PR check links) are passed.
**Prevention:** Centralize URL opening into a secure wrapper (`src/lib/secureOpenUrl.ts`) that explicitly allows only safe schemes (like `http:`, `https:`, and `mailto:`). Use this wrapper universally instead of importing the Tauri plugin directly.

## 2026-08-16 - Restrict global DOMPurify attribute injection
**Vulnerability:** The global DOMPurify `ADD_ATTR` configuration permitted arbitrary attribute injection on any element.
**Learning:** Adding attributes to the global `ADD_ATTR` list, even relatively safe ones like `target` and `rel`, allows them to be applied to any HTML tag during markdown rendering. This can introduce subtle HTML injection vectors.
**Prevention:** Instead of using global attribute allowlists, use DOMPurify hooks (e.g., `afterSanitizeAttributes`) to explicitly restrict attributes like `target="_blank"` and `rel="noopener noreferrer"` to specific elements (e.g., `<a>`).


## 2024-05-18 - Docker Exec Command Injection
**Vulnerability:** The application was concatenating an externally-provided ID (`container.id`) directly into shell commands (`docker logs ...` and `docker exec ...`) without proper sanitization.
**Learning:** Even internal or local identifiers like Docker container IDs should not be trusted if they come from an external process, as a crafted name or ID might contain shell characters allowing command injection.
**Prevention:** Always quote and escape external values using a function like `shellQuote` before passing them to the shell.
## 2026-08-24 - [HIGH] Command Injection in Terminal Navigation
**Vulnerability:** Command injection in `openPathInTerminal` in `src/App.vue`. The path was directly interpolated into the `cd` command without proper quoting or escaping.
**Learning:** Shell commands constructed by string interpolation must be carefully sanitized based on the target shell. What's safe for `pwsh` is not necessarily safe for `cmd` or `bash`. Additionally, newlines must be stripped to prevent multi-line execution in terminal PTY payloads.
**Prevention:** Always use `shellQuote` for POSIX shells, shell-specific escaping (like stripping quotes for `cmd`, or using `-LiteralPath` for PowerShell), and strip newlines (`[\r\n]`) when passing user-controlled data to terminal inputs.

## 2024-10-24 - OS-Specific Command Injection in Terminal Payloads
**Vulnerability:** Shell commands (e.g. `docker logs` and SSH launches) interpolated values using a POSIX-only `shellQuote` method (single quotes) which failed to protect against command injection when executed in Windows `cmd.exe` or PowerShell environments via PTY inputs.
**Learning:** Quoting strategies must be aware of the target shell environment. While single-quoting is robust for POSIX, `cmd.exe` only respects double quotes, and PowerShell has different single-quote escaping (`''`). Passing POSIX-quoted strings into a Windows PTY allows trivial command breakout.
**Prevention:** Implement and use a shell-aware quoting utility (like `quoteForShell`) that takes the target `shellId` into account when sanitizing values destined for terminal commands.

## 2026-08-27 - [CRITICAL] Command Injection in SSH Shell Environment Initialization
**Vulnerability:** The application was interpolating environment variable keys (`endpoint.environment`) and proxy hostnames directly into shell initialization commands (`buildEnvPrefix` and `ProxyCommand` in `src/lib/sshOpenSshArgs.ts`) without sufficient sanitization.
**Learning:** Even if the values of environment variables are safely quoted via `quoteForShell`, the variable *keys* themselves can contain shell metacharacters (e.g. `;`, `&`) that trigger command injection during the shell assignment phase (`set "KEY=value"` or `KEY='value' ssh ...`). Additionally, `ProxyCommand` in OpenSSH invokes the local shell, meaning unsanitized hostnames can also lead to injection.
**Prevention:** When configuring SSH connections or shells (e.g., building `ProxyCommand` arguments or setting environment variables), strictly sanitize hostnames and environment variable keys (e.g., stripping non-alphanumeric/underscore characters for env keys and invalid characters for hosts) to prevent command injection through shell execution.
