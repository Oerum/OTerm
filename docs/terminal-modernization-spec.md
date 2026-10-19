# Terminal modernization

Date: 2026-10-19. Base: `0a4e3b41d8ecac406c6e89b2a2dd25626ff395cc` (`main`).
Status: implemented; local verification and acceptance limits are recorded below.

## 1. Goal and scope

Improve measured terminal hot paths, add verified CLI-agent integrations, and modernize the existing application with compact, readable, Orca-inspired chrome. Preserve terminal instances, keyboard shortcuts, custom themes, local/SSH workflows, full command output/history, singleton worktree nesting, and source-control presentation. Follow the established Vue/Tauri architecture. No new dependency, database migration, or automatic tool installation is required.

The finite supported roster is 25 agent IDs, with Unsloth as an additional launch runtime. Other command-line programs remain usable in the ordinary terminal. Compatibility does not assert that a tool is installed, authenticated, or available on every operating system.

## 2. Evidence and selected performance changes

Baseline `npm run build`: main JavaScript 884.71 kB / 251.76 kB gzip; xterm 332.39 / 83.43 kB; CSS 146.37 / 22.62 kB. Baseline frontend tests: 591 passing. Native library tests: 78 passing, one pre-existing `dictation::transcribe::backend_tests::compiled_backend_is_not_unknown` failure because this build selects no Whisper backend.

A controlled Rust microprobe used actual `agent_process.rs` code and idle child roots, 3 cold / 7 warm samples, approximately 516–570 host processes. Median aggregate warm scan: current one root 26.331 ms, eight roots 235.180 ms; reduced one-root snapshot 5.982 ms; one shared reduced snapshot for eight roots 5.624 ms. These are process-scan measurements, not whole-app CPU or native frame-rate measurements. Retain and repeat the probe against final code.

Implement:

1. One manager-owned monitor for all local sessions, preserving the 1500 ms interval. Refresh one `System` per nonempty sweep using `ProcessRefreshKind::nothing().with_cmd(UpdateKind::OnlyIfNotSet)`, and build one child index. Classify all copied session roots outside the session-map lock. Keep only monitor-owned last-observed values; check per-session cancellation before publication. Stop/avoid work for no sessions, release monitor on manager destruction, and do not accumulate stale session state. Preserve shallowest agent selection and process-label semantics; use deterministic tie ordering. Remove repeated descendant membership scans with a set or single traversal where the same semantics are retained. Fix UTF-8-unsafe command-label truncation.
2. Explicit active-agent queries remain fresh, use the reduced snapshot, and release the sessions lock before OS scanning. Dispatch the blocking query outside Tauri's UI IPC thread using the supported command dispatch mechanism. Do not use the 1500 ms cache for exit reconciliation.
3. Replace lifetime output retention with the bounded startup/attachment contract in section 3.
4. Watch the existing durable workspace snapshot, not the entire volatile workspace graph: `watch(getSnapshot, scheduleSave)`. Remove the five obsolete watcher-source parameters from `useWorkspacePersistence` and its single App caller. Preserve debounce, close/page-hide flush, empty-workspace persistence, teardown, and timeout behavior. Verify zero saves on status/process/session-only mutations.
5. Load secondary application views/dialogs asynchronously from `App.vue`, using existing Vue facilities and preserving events, refs, error behavior, and terminal mounting. Compare final production bundles. Keep terminal/chrome critical components eager.

Do not add WebGL, timed transport batching, output truncation, background Git suppression, or a second persisted-state projection. Hidden-decoration optimization and git-output mirror changes require an additional concrete trace before inclusion. Removing decorative chrome blur is requested visual design, not a claimed benchmark result.

## 3. Lossless startup attachment and bounded exit contract

Lossless here describes the startup attachment boundary and decoded output accepted before stream completion. It does not promise unlimited live rendering: the existing xterm write queue has a 50-million-character discard watermark. No new truncation is introduced into command history or copy output.

Replace the old return-value drain API, including all registrations and callers:

```ts
attachTerminalOutput(sessionId: string): Promise<{ ended: boolean }> // terminal_attach_output
attachSshTerminalOutput(sessionId: string): Promise<{ ended: boolean }> // ssh_terminal_attach_output
// Existing events remain unchanged:
type TerminalOutputEvent = { sessionId: string; data: string };
type TerminalExitEvent = { sessionId: string; exitCode: number | null };
```

1. Frontend registers listeners before spawning and binds the returned session ID before awaiting attachment. Existing-restored sessions follow the same path.
2. Before attachment, readers buffer startup output and do not emit output or exit. Use a 64 KiB startup budget plus at most one in-flight transport chunk. At capacity, wait for attach/cancel instead of discarding bytes. Local waits use a condition variable; SSH waits must be asynchronous and cancellation-aware. Do not block an async executor on a condition variable.
3. A per-session delivery gate serializes startup replay, live output, and exit. Attachment emits retained startup output through the same `terminal-output` stream, then switches to live delivery and wakes the reader. Its response carries only `{ ended: boolean }` lifecycle metadata sampled under the same gate; no response carries output and no frontend replay queue is needed. Tauri events use webview evaluation while invoke responses can use a custom protocol, so event publication before command return does not prove JavaScript processed the exit first. The ended flag closes that cross-transport bootstrap race. No output is retained after successful live delivery. Never emit/wait while holding the global sessions-map lock.
4. Repeated attachment is harmless. Unknown/killed sessions return the existing unknown-session error. Failed startup publication must return an error and retain unsent data; do not mark attachment successful after a failed emit.
5. Decode UTF-8 incrementally across reads with a small shared decoder. Preserve incomplete sequences until the next chunk and flush an incomplete tail as replacement characters only at EOF. Use separate decoder carry for SSH stdout and extended data. Do not alter ANSI/OSC bytes or truncate command blocks/history.
6. The local child watcher records status. Drain until reader EOF, or at most 500 ms after the shell exit status is observed: an inherited slave descriptor in a background descendant must not keep the tab alive forever. Completion is serialized through the delivery gate, flushes accepted decoder carry, and suppresses later output. Keep decoder state accessible to this completion operation; never wait for a blocked OS read while holding the delivery lock. Publish exactly one exit after attachment and final accepted output. Kill cancels all waits and suppresses later publication. Avoid holding global locks during child teardown. Output from descendants arriving after the bounded root-exit drain is outside the completed session, matching the existing root-shell lifetime.
7. SSH ExitStatus records the exit code and continues draining Data/ExtendedData. Eof alone is a half-close, not final session exit: allow a later ExitStatus before Close. Complete on Eof plus known exit status, Close/channel end, or a 500 ms grace after ExitStatus if the server never completes the stream. Preserve known status, flush separate decoder tails, and emit one exit through the delivery gate. Kill wakes an attachment wait and the reader wait.
8. Frontend exit handling sets a pending-end guard and queues `terminal.write("", callback)` as an xterm parse barrier. Finalize lifecycle and emit `sessionEnded` only in that callback, guarded against disposed/stale session generations. App closes tabs on this event, so receiving an exit event alone is insufficient. After awaiting attachment, bootstrap rechecks disposal, generation, session identity, the returned ended flag, and pending end before sessionCreated or queued launch input. An ended attachment still waits for its event-driven output/parse/exit path to finish; it does not close the pane before replay arrives. Clean up a session created after disposal.

Use a small shared output/decoder module only where it removes duplicated local/SSH behavior. Tests must exercise the actual gate/state machine, not a duplicate test-only model. Explicitly test output-before-attach, concurrent attach/read, repeated attach, attach failure, startup backpressure, kill waking waiters, never-attached disposal, immediate exit, split UTF-8, malformed bytes, final output before exit, Eof-before-ExitStatus, a descendant/remote stream that stays open after root exit (bounded completion), and frontend parse completion/stale bootstrap. Resolve an ended attachment's invoke response before dispatching its output/exit events in a regression test; verify no sessionCreated or queued input, and output parses before closure. A blocking OS reader with inherited descriptors must not be joined by completion; cancellation gates later reads, while native reader reclamation remains an acceptance limit.

## 4. Agent registry and launch contract

Preserve existing IDs/aliases: claude, gemini, codex, opencode, copilot, cursor, amp, droid, pi, auggie, goose, hermes, vibe, agy.

Add the following verified entries to both frontend and Rust classification:

| ID | Name | Launch | Package / official documentation |
| --- | --- | --- | --- |
| cline | Cline | `cline` | `cline`; https://docs.cline.bot/getting-started/installing-cline |
| aider | Aider | `aider` | `aider-chat`; https://aider.chat/docs/install.html |
| kilo | Kilo Code | `kilo` | `@kilocode/cli`; https://kilo.ai/docs/code-with-ai/platforms/cli |
| kimi | Kimi Code | `kimi` | `@moonshot-ai/kimi-code`; https://moonshotai.github.io/kimi-code/en/guides/getting-started |
| kiro | Kiro CLI | `kiro-cli` | https://kiro.dev/docs/cli/reference/cli-commands/ |
| qwen | Qwen Code | `qwen` | `@qwen-code/qwen-code`; https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/ |
| continue | Continue | `cn` | `@continuedev/cli`; https://github.com/continuedev/continue/tree/main/extensions/cli |
| codebuff | Codebuff | `codebuff` | `codebuff`; https://www.codebuff.com/docs/help/quick-start |
| crush | Crush | `crush` | `@charmland/crush`; https://github.com/charmbracelet/crush |
| rovodev | Rovo Dev | `acli rovodev run` | https://developer.atlassian.com/cloud/acli/guides/how-to-get-started/ |
| omp | oh-my-pi | `omp` | `@oh-my-pi/pi-coding-agent`; https://github.com/can1357/oh-my-pi/blob/main/docs/cli-reference.md |

Do not add speculative aliases (`kilocode`, `qwen-code`, `kimi-cli`, bare `kiro`, `continue`, `freebuff`). Omit the real but ambiguous Codebuff alias `cb`, also used by the Clipboard CLI (https://github.com/slackadays/Clipboard). Current Kimi uses the Node package; the older Python Kimi CLI is archived. Use existing monogram/fallback badge behavior where no vetted logo is present.

Extend the existing `CliAgentDefinition` minimally with optional `launchCommand` and `docsUrl`; keep existing shape/callers compatible. `launchCommand` is needed for Rovo's token sequence; default to the existing first prefix for other agents. Export these shared helpers/contracts from `terminalAgentMode.ts`:

```ts
type AgentLaunchRequest = { agentId: CliAgentId; runtime?: "native" | "unsloth" };
function supportsUnslothRuntime(agentId: CliAgentId): boolean;
function buildAgentLaunchCommand(request: AgentLaunchRequest): string;
```

The launch helper constructs fixed registry-controlled commands only. Reject unsupported runtime combinations. `AgentsView` emits `launchAgent(request: AgentLaunchRequest)`. App accepts the request, retains existing shell/CWD/group selection, and queues the constructed command using the existing pending-command path. Command-palette launch actions wrap their existing agent ID in a native request. No editable command interpolation, install/auth execution, shell-secret discovery, PATH availability badges, or fallback package runners.

Unsloth is a runtime, not an agent ID: https://unsloth.ai/docs/integrations/unsloth-start . Enable it only for claude, codex, opencode, hermes, pi. Launch `unsloth start <id>`, adding documented `--persist` for codex/hermes/pi to preserve managed home/history from first use. UI shows the exact command and a setup link. `unsloth studio` is not an agent. Keep the underlying ID for composer/status/reconciliation.

Detection must recognize actual executable tokens, quoted executable paths and Windows extensions, supported package-runner executable/package positions, Rovo's exact subcommand sequence, and documented `unsloth start` commands. Do not match an agent merely because a prompt, model flag, workspace path, or unrelated argument mentions its name. Rust Node/Bun/Python script classification examines the executable/script/package location, not arbitrary trailing prompt arguments. Preserve documented existing package invocations with regression tests; avoid a general-purpose shell parser. Keep frontend/Rust IDs and cases in parity with tests. New agents use existing default submit behavior unless authoritative evidence requires a change.

Negative cases include `node server.js --model codex`, `python train.py --model claude`, `cb copy foo`, unrelated `npx` packages with agent names in arguments, `acli jira`, `acli rovodev auth`, `unsloth studio`, and unknown Unsloth targets. Python detection examines only script-path or `-m <module>` position, with `python -m aider` positive. Test all 25 launch commands, Windows paths/extensions, package forms, wrapper forms, ordinary shell negatives, and existing 14-agent regressions.

## 5. UI and UX

Use Orca as a visual reference, not a replacement architecture: https://www.onorca.dev/ . Modernize the existing app through its current tokens and components.

- Establish matte neutral surfaces, restrained accent color, readable typography, consistent borders/radii, compact hierarchy, and clear active/focus states. Remove excessive permanent docked-chrome blur, decorative gradients, broad transition-all, and forced decorative transforms without breaking terminal overflow/containment. Preserve custom themes and terminal font metrics. Honor reduced motion.
- Make title bar, sidebar/worktree rows, status bar, tool panels, menus/dialogs, agent composer, and secondary views read as one interface through shared tokens and narrowly scoped component changes. Keep controls reachable at smaller windows; no clipped actions or horizontal overflow introduced by the launcher.
- Replace the agent select with a searchable compact launcher using existing UI patterns or semantic native controls. Keyboard users can filter, select, start, and close; use labels, visible focus, appropriate selected state, and a no-results state. Preserve the active/needs-input sections and jump-to-pane behavior.
- Show agent name, exact launch command, official setup link where available, and an Unsloth runtime choice for compatible agents. Reset/disable incompatible runtime choices when selection changes. Show launch progress/error states; prevent duplicate launches while a launch is pending. Do not present configured/installed/authenticated indicators without real evidence.
- Retain all existing tabs and PTYs when opening/closing views, singleton linked-worktree nesting, drag/reorder/context menus, source-control staying open after successful actions, shortcuts, accessibility labels, and custom theme controls.

Browser verification uses an isolated mock-Tauri preview of real Vue components at `http://127.0.0.1:1422/__preview`. It proves UI behavior only. Native terminal rendering/input, real SSH, provider login/model execution, GPU/audio, and other platforms require separate acceptance.

## 6. Integration points

- Native session output and process detection live in `src-tauri/src/terminal/`, with SSH integration in `src-tauri/src/ssh_terminal/` and matching command registrations in `src-tauri/src/lib.rs`.
- `TerminalPane.vue` integrates output attachment, exit parsing and late-spawn cleanup. It reports `sessionLaunchFailed(paneId, message)` through App's existing lifecycle handling.
- `App.vue` integrates `AgentLaunchRequest`, command-palette dispatch, lazy secondary views and persistence. The persistence signature is `useWorkspacePersistence(getSnapshot: () => PersistedTerminalWorkspaceV2 | null, options: WorkspacePersistenceOptions = {})`; returned flush/scheduleSave/isClosing behavior stays unchanged.
- `AgentsView.vue` uses shared registry launch helpers. Theme tokens come from `style.css` and `applyChromeTheme.ts`; custom-theme editing reuses `cloneTerminalTheme`.

## 7. Verification and delivery

- Frontend: focused new behavior tests, then `npm.cmd test`, `npm.cmd run build`, and `git diff --check`. Record final main/xterm/CSS sizes; confirm lazy view failures are handled and all modified callers typecheck.
- Native: focused output/detection/manager tests, then the library suite excluding only the documented pre-existing audio assertion. Windows builds require the configured Visual Studio and LLVM system include paths.
- Measure final process scan with the retained probe; test one/many roots, empty monitor, cancellation, and process-change semantics. Report workload and limitations.
- Test persistence against the real snapshot for durable changes and runtime noise, including empty workspace and close flush.
- Browser: launcher search/no results/keyboard, all registry names, native vs Unsloth preview, unsupported choice transition, launch error/pending/success, pane retention/focus, sidebar/worktrees, secondary views/theme controls, compact viewport, console errors, source-control presentation. A mocked provider cannot establish real agent/SSH acceptance.
- Deployment: no database migration, Docker Compose environment variable, or new dependency is required. Ship the native and frontend command-contract changes together.

## 8. Measurements

The retained process probe was rerun against the original source snapshot and the implemented `refresh_processes`/`ProcessTree` path in the same process. Optimized probe, 3 cold and 7 warm samples, 476–481 host processes, idle child roots:

| Workload | Original median | Implemented median |
| --- | ---: | ---: |
| One root, cold | 31.050 ms | 7.266 ms |
| One root, warm | 22.663 ms | 5.132 ms |
| Eight roots, cold | 253.233 ms | 7.813 ms |
| Eight roots, warm | 181.290 ms | 4.605 ms |

The warm eight-root scan is 97.5% shorter in this workload. This measures aggregate process scanning and classification only; it does not establish whole-app CPU, native frame rate, or busy-agent throughput. Probe source and raw results are retained in local measurement artifacts.

Integrated verification before final UI repairs: 739 frontend tests passed. The native library suite passed 91 tests with only the exact pre-existing audio-backend assertion excluded. A new monitor test initially depended on the concurrently changing test-runner process tree; it was isolated with an owned idle child and then passed the full suite. No production workaround or suite-wide serialization was introduced.

After review repairs, all 748 frontend tests across 75 files pass; production typecheck/build and whitespace checks pass. The native library suite still passes 91 tests with the exact pre-existing audio assertion excluded. Main JavaScript is 460.07 kB (137.57 kB gzip), down from 884.71 kB (251.76 kB gzip). Xterm remains 332.39 kB (83.43 kB gzip). Main CSS is 126.44 kB (19.67 kB gzip); secondary-view chunks load on demand. These are build artifact measurements, not measured startup latency.

Mocked-Tauri browser checks verified 25-agent search/empty results, scoped keyboard navigation, Native/Unsloth command selection and unsupported-agent reset, pending-launch exclusion, spawn/write/early-exit feedback, retained terminal panes, and a failed lazy view returning to the terminal. At 600 x 700 the launcher has no horizontal overflow and keyboard focus scrolls the launch action into view. A custom light theme with a black cursor can now be saved through Settings; the launch button stays readable and the Unsloth guide has a visible focus underline. These checks do not execute external CLI agents.
