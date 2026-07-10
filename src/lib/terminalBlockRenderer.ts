import type { IDisposable, Terminal } from "@xterm/xterm";
import type { TerminalTheme } from "../types/terminalTheme";
import {
  commandColumnOnLine,
  commandInputStartColumn,
  extractInputAfterPrompt,
  inferLastCommandBlock,
  mergeTerminalDraftSources,
  readTerminalCurrentInput,
} from "./terminalCurrentInput";
import { extractCwdFromPromptLine } from "./terminalPrompt";
import { resolveLiveInputTokenColor } from "./terminalThemes";
import { readTerminalCellMetrics } from "./terminalBlockMetrics";
import {
  blockLineSpan,
  createTerminalBlock,
  expandBlockEndLine,
  finishTerminalBlock,
  formatBlockMeta,
  looksLikeTerminalClear,
  parseOsc133Payload,
  parseOsc7Payload,
  resolveBlockExitCode,
  type Osc133Event,
  type TerminalBlock,
} from "./terminalBlocks";
import { tokenizeCommandLine } from "./terminalCommandTokens";

type DecorationEntry = {
  dispose: () => void;
};

export type TerminalBlockRendererOptions = {
  enabled?: boolean;
  shellId?: string | null;
  onBlockFinished?: (block: TerminalBlock) => void;
};

export class TerminalBlockRenderer {
  private terminal: Terminal;
  private theme: TerminalTheme;
  private shellId: string | null;
  private enabled: boolean;
  private onBlockFinished?: (block: TerminalBlock) => void;
  private blocks: TerminalBlock[] = [];
  private activeBlock: TerminalBlock | null = null;
  private decorations: DecorationEntry[] = [];
  private alternateBufferActive = false;
  private pendingCommand = "";
  private pendingDraft = "";
  private pendingOscExitCode: number | null = null;
  private paneCwd: string | null = null;
  private refreshTimer: number | undefined;
  private disposables: IDisposable[] = [];

  constructor(terminal: Terminal, theme: TerminalTheme, options: TerminalBlockRendererOptions = {}) {
    this.terminal = terminal;
    this.theme = theme;
    this.shellId = options.shellId ?? null;
    this.enabled = options.enabled ?? true;
    this.onBlockFinished = options.onBlockFinished;
  }

  setTheme(theme: TerminalTheme): void {
    this.theme = theme;
    this.scheduleRefresh();
  }

  setShellId(shellId: string | null): void {
    this.shellId = shellId;
  }

  setPaneCwd(cwd: string | null): void {
    this.paneCwd = cwd?.trim() || null;
    if (this.activeBlock && !this.activeBlock.cwd) {
      this.activeBlock.cwd = this.paneCwd;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clearDecorations();
    else this.scheduleRefresh();
  }

  setAlternateBuffer(active: boolean): void {
    if (this.alternateBufferActive === active) return;
    this.alternateBufferActive = active;
    if (active) this.clearDecorations();
    else this.scheduleRefresh();
  }

  /** ponytail: kept for TerminalPane wiring; blocks render via xterm decorations. */
  installOverlay(_anchor: HTMLElement): void {
    (window as unknown as { __otermBlocks?: () => unknown }).__otermBlocks = () => this.debugState();
    this.scheduleRefresh();
  }

  private debugState(): unknown {
    const allowProposedApi = Boolean(
      (this.terminal as Terminal & { options?: { allowProposedApi?: boolean } }).options
        ?.allowProposedApi,
    );
    return {
      enabled: this.enabled,
      alternateBufferActive: this.alternateBufferActive,
      allowProposedApi,
      decorationCount: this.decorations.length,
      domBodyCount: document.querySelectorAll(".terminal-block-body").length,
      domMetaCount: document.querySelectorAll(".terminal-block-meta--attached").length,
      shellId: this.shellId,
      pendingCommand: this.pendingCommand,
      total: this.blocks.length,
      active: this.activeBlock
        ? {
            command: this.activeBlock.command,
            status: this.activeBlock.status,
            commandMarkerLine: this.activeBlock.commandMarkerLine,
            endMarkerLine: this.activeBlock.endMarkerLine,
          }
        : null,
      finished: this.blocks
        .filter((b) => b.status !== "running")
        .map((b) => ({
          command: b.command,
          status: b.status,
          exitCode: b.exitCode,
          span: blockLineSpan(b),
          oscFinished: b.oscFinished,
        })),
      inferred: inferLastCommandBlock(this.terminal),
      cell: readTerminalCellMetrics(this.terminal),
    };
  }

  register(): void {
    this.disposables.push(
      this.terminal.parser.registerOscHandler(133, (data) => {
        this.handleOsc133(data);
        return true;
      }),
      this.terminal.parser.registerOscHandler(7, (data) => {
        this.handleOsc7(data);
        return true;
      }),
      this.terminal.onWriteParsed(() => {
        this.syncAlternateBuffer();
        // ponytail: echo refresh must not defer behind 50ms while draft is ahead of buffer
        this.scheduleRefresh(Boolean(this.pendingDraft.trim()));
      }),
      this.terminal.onScroll(() => this.scheduleRefresh()),
      this.terminal.onResize(() => this.scheduleRefresh()),
    );
  }

  noteSubmittedCommand(command: string): void {
    this.pendingCommand = command.trim();
    this.pendingDraft = "";
    if (!this.pendingCommand || !this.enabled || this.alternateBufferActive) return;
    this.beginBlock(this.pendingCommand, this.currentBufferLine());
  }

  /** Keystroke from TerminalPane — cmd echo can lag behind local draft. */
  notifyDraftInputChanged(draft: string): void {
    this.pendingDraft = draft;
    this.scheduleRefresh(true);
  }

  appendOutput(data: string): void {
    if (looksLikeTerminalClear(data)) {
      this.resetAfterScreenClear();
      return;
    }
    if (!this.enabled || this.alternateBufferActive || !this.activeBlock) return;
    this.activeBlock.outputText += data;
  }

  resetAfterScreenClear(): void {
    this.blocks = [];
    this.activeBlock = null;
    this.pendingCommand = "";
    this.pendingDraft = "";
    this.pendingOscExitCode = null;
    this.clearDecorations();
  }

  finalizeOnPromptReady(promptLine?: number): void {
    if (!this.enabled || this.alternateBufferActive) return;

    const promptLineNum = promptLine ?? this.currentBufferLine();
    const inferred = inferLastCommandBlock(this.terminal, promptLineNum);
    if (!inferred) return;

    const existing = this.findFinishedBlock(inferred.command, inferred.commandLine);
    if (existing) {
      this.reconcileFinishedBlock(existing, inferred);
      return;
    }

    if (this.activeBlock?.oscFinished) return;

    if (!this.activeBlock) {
      this.beginBlock(inferred.command, inferred.commandLine);
    }

    this.hydrateBlockFromBuffer(this.activeBlock!, promptLineNum);
    this.expandActiveBlockEnd(promptLineNum);
    this.completeActiveBlock(
      this.activeBlock!,
      this.activeBlock!.endMarkerLine ?? inferred.endLine,
      this.pendingOscExitCode,
    );
    this.pendingOscExitCode = null;
  }

  dispose(): void {
    window.clearTimeout(this.refreshTimer);
    this.clearDecorations();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
  }

  getBlocks(): TerminalBlock[] {
    return [...this.blocks];
  }

  private expandActiveBlockEnd(cursorLine?: number): void {
    const block = this.activeBlock;
    if (!block || block.commandMarkerLine === null) return;
    const buffer = this.terminal.buffer.active;
    const promptLine = cursorLine ?? buffer.baseY + buffer.cursorY;
    const expanded = expandBlockEndLine(buffer, block.commandMarkerLine, promptLine);
    block.endMarkerLine = Math.max(block.endMarkerLine ?? block.commandMarkerLine, expanded);
    block.cwd = this.resolveBlockCwd(block, this.terminal.buffer.active);
  }

  private resolveBlockCwd(
    block: TerminalBlock,
    buffer: { getLine: (line: number) => { translateToString: (trimRight: boolean) => string } | undefined },
  ): string | null {
    if (block.cwd) return block.cwd;
    if (block.commandMarkerLine !== null) {
      const line = buffer.getLine(block.commandMarkerLine)?.translateToString(false) ?? "";
      const fromPrompt = extractCwdFromPromptLine(line);
      if (fromPrompt) return fromPrompt;
    }
    return this.paneCwd;
  }

  private syncBlockFromBuffer(block: TerminalBlock, cursorLine: number): void {
    if (block.commandMarkerLine === null) return;
    const buffer = this.terminal.buffer.active;
    // ponytail: finished spans must stay frozen — expanding on every refresh stacked failure tints.
    if (block.status === "running") {
      const expanded = expandBlockEndLine(buffer, block.commandMarkerLine, cursorLine);
      block.endMarkerLine = Math.max(block.endMarkerLine ?? block.commandMarkerLine, expanded);
    }
    block.cwd = this.resolveBlockCwd(block, buffer);
  }

  private beginBlock(command: string, commandLine: number): void {
    if (!command.trim() || this.alternateBufferActive) return;
    this.activeBlock = createTerminalBlock(command.trim());
    this.activeBlock.commandMarkerLine = commandLine;
    this.activeBlock.cwd = this.paneCwd;
    this.blocks.push(this.activeBlock);
  }

  private findFinishedBlock(command: string, commandLine: number): TerminalBlock | undefined {
    return this.blocks.find(
      (block) =>
        block.status !== "running" &&
        block.command === command &&
        block.commandMarkerLine === commandLine,
    );
  }

  private reconcileFinishedBlock(
    block: TerminalBlock,
    inferred: { command: string; commandLine: number; endLine: number },
  ): void {
    const cursorLine = this.currentBufferLine();
    const nextEnd = Math.max(
      block.endMarkerLine ?? block.commandMarkerLine ?? 0,
      inferred.endLine,
      expandBlockEndLine(this.terminal.buffer.active, inferred.commandLine, cursorLine),
    );
    const exitCode = resolveBlockExitCode(
      block.outputText,
      this.pendingOscExitCode ?? block.exitCode,
      this.shellId,
    );
    const updated = finishTerminalBlock(
      {
        ...block,
        commandMarkerLine: block.commandMarkerLine ?? inferred.commandLine,
        endMarkerLine: nextEnd,
        cwd: block.cwd ?? this.paneCwd,
        startMarkerLine: block.commandMarkerLine ?? inferred.commandLine,
      },
      exitCode,
    );
    const index = this.blocks.findIndex((item) => item.id === block.id);
    if (index >= 0) this.blocks[index] = updated;
    this.pendingOscExitCode = null;
    this.scheduleRefresh();
  }

  private hydrateBlockFromBuffer(block: TerminalBlock, promptLine?: number): void {
    const inferred = inferLastCommandBlock(this.terminal, promptLine);
    if (inferred) {
      if (!block.command.trim()) block.command = inferred.command;
      block.commandMarkerLine ??= inferred.commandLine;
      if (inferred.endLine >= (block.endMarkerLine ?? -1)) {
        block.endMarkerLine = inferred.endLine;
      }
    }
    if (!block.command.trim()) {
      const fromBuffer = readTerminalCurrentInput(this.terminal).trim();
      if (fromBuffer) block.command = fromBuffer;
    }
    block.commandMarkerLine ??= inferred?.commandLine ?? this.currentBufferLine();
    block.endMarkerLine ??= inferred?.endLine ?? Math.max(0, this.currentBufferLine() - 1);
    block.cwd ??= this.paneCwd;
  }

  private handleOsc133(payload: string): void {
    if (!this.enabled || this.alternateBufferActive) return;
    const event = parseOsc133Payload(payload);
    if (!event) return;
    this.applyOsc133(event);
    this.scheduleRefresh();
  }

  private handleOsc7(payload: string): void {
    if (!this.enabled) return;
    const path = parseOsc7Payload(payload);
    if (!path) return;
    this.paneCwd = path;
    if (this.activeBlock) this.activeBlock.cwd = path;
    for (const block of this.blocks) {
      if (!block.cwd) block.cwd = path;
    }
    this.scheduleRefresh();
  }

  private applyOsc133(event: Osc133Event): void {
    switch (event.kind) {
      case "prompt-start":
        if (this.activeBlock?.status === "running") {
          this.bumpActiveBlockEndLine(Math.max(0, this.currentBufferLine() - 1));
        }
        break;
      case "command-start": {
        const command = this.pendingCommand || readTerminalCurrentInput(this.terminal).trim();
        if (!command) break;
        if (!this.activeBlock || this.activeBlock.oscFinished) {
          this.beginBlock(command, this.currentBufferLine());
        } else {
          this.activeBlock.command = command;
          this.activeBlock.commandMarkerLine ??= this.currentBufferLine();
        }
        break;
      }
      case "command-finish": {
        if (!this.activeBlock) {
          const command = this.pendingCommand || readTerminalCurrentInput(this.terminal).trim();
          if (!command) return;
          this.beginBlock(command, Math.max(0, this.currentBufferLine() - 1));
        }
        if (!this.activeBlock || this.activeBlock.oscFinished) return;
        this.pendingOscExitCode = event.exitCode;
        this.bumpActiveBlockEndLine(Math.max(0, this.currentBufferLine() - 1));
        break;
      }
      case "prompt-end":
        break;
      default:
        break;
    }
  }

  private completeActiveBlock(block: TerminalBlock, endMarkerLine: number, oscExitCode: number | null): void {
    this.hydrateBlockFromBuffer(block);
    if (!block.command.trim() || block.commandMarkerLine === null) {
      this.dropBlock(block);
      this.activeBlock = null;
      this.pendingCommand = "";
      return;
    }

    block.endMarkerLine = Math.max(block.endMarkerLine ?? block.commandMarkerLine, endMarkerLine);
    this.syncBlockFromBuffer(block, this.currentBufferLine());

    const exitCode = resolveBlockExitCode(block.outputText, oscExitCode, this.shellId);
    const finished = finishTerminalBlock(
      {
        ...block,
        cwd: block.cwd ?? this.paneCwd,
        endMarkerLine: block.endMarkerLine,
        startMarkerLine: block.commandMarkerLine,
      },
      exitCode,
    );
    const index = this.blocks.findIndex((item) => item.id === finished.id);
    if (index >= 0) this.blocks[index] = finished;
    else this.blocks.push(finished);
    this.onBlockFinished?.(finished);
    this.activeBlock = null;
    this.pendingCommand = "";
    this.pendingDraft = "";
    this.pendingOscExitCode = null;
    this.pruneEmptyBlocks();
    this.scheduleRefresh();
  }

  private bumpActiveBlockEndLine(endLine: number): void {
    if (!this.activeBlock || this.activeBlock.oscFinished) return;
    const commandLine = this.activeBlock.commandMarkerLine;
    if (commandLine === null || endLine < commandLine) return;
    if (endLine >= (this.activeBlock.endMarkerLine ?? -1)) {
      this.activeBlock.endMarkerLine = endLine;
    }
  }

  private dropBlock(block: TerminalBlock): void {
    const index = this.blocks.findIndex((item) => item.id === block.id);
    if (index >= 0) this.blocks.splice(index, 1);
  }

  private pruneEmptyBlocks(): void {
    this.blocks = this.blocks.filter(
      (block) => block.status === "running" || (block.command.trim() && blockLineSpan(block)),
    );
  }

  private syncAlternateBuffer(): void {
    this.setAlternateBuffer(this.terminal.buffer.active.type === "alternate");
  }

  private currentBufferLine(): number {
    const buffer = this.terminal.buffer.active;
    return buffer.baseY + buffer.cursorY;
  }

  private cursorRelativeLine(line: number): number {
    return line - this.currentBufferLine();
  }

  private scheduleRefresh(immediate = false): void {
    if (!this.enabled || this.alternateBufferActive) return;
    const fast = immediate || Boolean(this.pendingDraft.trim());
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => this.refreshDecorations(), fast ? 0 : 50);
  }

  private purgeStaleBlocks(): void {
    const buffer = this.terminal.buffer.active;
    this.blocks = this.blocks.filter((block) => {
      if (block.status === "running") return true;
      return this.blockStillAnchored(block, buffer);
    });
    if (this.activeBlock && !this.blockStillAnchored(this.activeBlock, buffer) && this.activeBlock.oscFinished) {
      this.activeBlock = null;
    }
  }

  private blockStillAnchored(
    block: TerminalBlock,
    buffer: { getLine: (index: number) => { translateToString: (trimRight: boolean) => string } | undefined },
  ): boolean {
    const cmdLine = block.commandMarkerLine;
    const command = block.command.trim();
    if (cmdLine === null || !command) return false;
    const line = buffer.getLine(cmdLine);
    if (!line) return false;
    return line.translateToString(false).includes(command);
  }

  private clearDecorations(): void {
    for (const entry of this.decorations) entry.dispose();
    this.decorations = [];
  }

  private refreshDecorations(): void {
    if (!this.enabled || this.alternateBufferActive) {
      this.clearDecorations();
      return;
    }

    try {
      this.clearDecorations();
      this.purgeStaleBlocks();
      const buffer = this.terminal.buffer.active;
      const cursorLine = buffer.baseY + buffer.cursorY;
      const viewportStart = Math.max(0, buffer.viewportY - 2);
      const viewportEnd = Math.min(buffer.length - 1, buffer.viewportY + this.terminal.rows + 2);
      const metrics = readTerminalCellMetrics(this.terminal);

      for (const block of this.blocks) {
        if (block.status === "running") continue;
        this.syncBlockFromBuffer(block, cursorLine);
        const span = blockLineSpan(block);
        if (!span) continue;
        if (span.end < viewportStart || span.start > viewportEnd) continue;
        this.renderBlockDecorations(block, span.start, span.end, metrics);
      }

      this.renderActiveInputDecorations(metrics);
    } catch (error) {
      console.error("[oterm] block decoration render failed", error);
    }
  }

  private renderBlockDecorations(
    block: TerminalBlock,
    startLine: number,
    endLine: number,
    metrics: { width: number; height: number },
  ): void {
    const isFailure = block.status === "failure";
    const height = Math.max(1, endLine - startLine + 1);
    this.renderBodyDecoration(block, startLine, height, isFailure);

    if (this.shellId !== "pwsh" && this.shellId !== "powershell") {
      const commandLine = block.commandMarkerLine ?? startLine;
      this.renderCommandTokenDecorations(block, commandLine, metrics);
    }
  }

  private blockEdgeInsetPx(): number {
    return 14;
  }

  private blockInsetCols(): number {
    return 0;
  }

  private renderBodyDecoration(
    block: TerminalBlock,
    startLine: number,
    height: number,
    isFailure: boolean,
  ): void {
    const inset = this.blockInsetCols();
    const marker = this.terminal.registerMarker(this.cursorRelativeLine(startLine));
    if (!marker || marker.isDisposed) return;

    const decoration = this.terminal.registerDecoration({
      marker,
      x: inset,
      width: Math.max(1, this.terminal.cols - inset * 2),
      height,
      layer: "bottom",
    });
    if (!decoration) {
      marker.dispose();
      return;
    }

    const renderDisposable = decoration.onRender((element) => {
      element.classList.add("terminal-block-body");
      element.classList.toggle("terminal-block-body--failure", isFailure);
      element.classList.toggle("terminal-block-body--success", !isFailure);
      element.style.pointerEvents = "none";
      element.style.boxSizing = "border-box";
      element.style.borderRadius = "8px";
      const edgeInset = this.blockEdgeInsetPx();
      element.style.margin = `1px 10px 1px 0`;
      element.style.marginLeft = `-${edgeInset}px`;
      element.style.width = `calc(100% + ${edgeInset}px)`;
      element.style.overflow = "visible";
      element.style.backgroundColor = isFailure
        ? this.theme.blocks.failureBackground
        : this.theme.blocks.successBackground;

      let meta = element.querySelector(".terminal-block-meta") as HTMLElement | null;
      if (!meta) {
        meta = document.createElement("div");
        meta.className = "terminal-block-meta terminal-block-meta--attached";
        element.appendChild(meta);
      }
      meta.textContent = formatBlockMeta(block);
      meta.style.color = isFailure ? this.theme.blocks.failureText : this.theme.blocks.meta;
    });

    this.decorations.push({
      dispose: () => {
        renderDisposable.dispose();
        decoration.dispose();
        marker.dispose();
      },
    });
  }

  private usesShellNativeCommandColors(): boolean {
    return this.shellId === "pwsh" || this.shellId === "powershell";
  }

  private tokenColor(kind: string): string {
    switch (kind) {
      case "command":
        return this.theme.tokens.command;
      case "subcommand":
        return this.theme.tokens.subcommand;
      case "option":
        return this.theme.tokens.option;
      case "variable":
        return this.theme.tokens.variable;
      default:
        return this.theme.tokens.argument;
    }
  }

  private renderActiveInputDecorations(metrics: { width: number; height: number }): void {
    if (this.usesShellNativeCommandColors()) return;

    const buffer = this.terminal.buffer.active;
    const cursorLine = buffer.baseY + buffer.cursorY;
    const bufferLine = buffer.getLine(cursorLine);
    if (!bufferLine) return;

    const lineText = bufferLine.translateToString(false);
    const draft = this.pendingDraft.trim();
    const fromLine = extractInputAfterPrompt(lineText).trim();
    const fromBuffer = readTerminalCurrentInput(this.terminal).trim();
    const input = draft || mergeTerminalDraftSources(fromLine || fromBuffer, draft).trim();
    if (!input) return;

    const promptStart = commandInputStartColumn(lineText);
    if (promptStart === null) return;

    // ponytail: always anchor live tokens at the prompt — buffer echo can lag draft by chars
    const commandIndex = promptStart;

    this.renderActiveInputLineBody(cursorLine);
    this.renderCommandTokenSpans(cursorLine, commandIndex, input, metrics, (kind) =>
      resolveLiveInputTokenColor(kind, this.theme),
    );
  }

  /** ponytail: single-line running tint so cmd input matches finished block chrome. */
  private renderActiveInputLineBody(line: number): void {
    const inset = this.blockInsetCols();
    const marker = this.terminal.registerMarker(this.cursorRelativeLine(line));
    if (!marker || marker.isDisposed) return;

    const decoration = this.terminal.registerDecoration({
      marker,
      x: inset,
      width: Math.max(1, this.terminal.cols - inset * 2),
      height: 1,
      layer: "bottom",
    });
    if (!decoration) {
      marker.dispose();
      return;
    }

    const renderDisposable = decoration.onRender((element) => {
      element.classList.add(
        "terminal-block-body",
        "terminal-block-body--success",
        "terminal-block-body--active",
      );
      element.style.pointerEvents = "none";
      element.style.boxSizing = "border-box";
      element.style.borderRadius = "8px";
      const edgeInset = this.blockEdgeInsetPx();
      element.style.margin = "1px 10px 1px 0";
      element.style.marginLeft = `-${edgeInset}px`;
      element.style.width = `calc(100% + ${edgeInset}px)`;
      element.style.overflow = "visible";
      element.style.backgroundColor = this.theme.blocks.successBackground;
    });

    this.decorations.push({
      dispose: () => {
        renderDisposable.dispose();
        decoration.dispose();
        marker.dispose();
      },
    });
  }

  private renderCommandTokenDecorations(
    block: TerminalBlock,
    line: number,
    metrics: { width: number; height: number },
  ): void {
    const command = block.command.trim();
    if (!command) return;

    const buffer = this.terminal.buffer.active;
    const bufferLine = buffer.getLine(line);
    if (!bufferLine) return;

    const lineText = bufferLine.translateToString(false);
    const commandIndex = commandColumnOnLine(lineText, command);
    this.renderCommandTokenSpans(line, commandIndex, command, metrics);
  }

  private renderCommandTokenSpans(
    line: number,
    commandIndex: number,
    command: string,
    _metrics: { width: number; height: number },
    colorFor: (kind: string) => string = (kind) => this.tokenColor(kind),
  ): void {
    for (const span of tokenizeCommandLine(command)) {
      const x = commandIndex + span.start;
      const width = Math.max(1, span.end - span.start);
      const marker = this.terminal.registerMarker(this.cursorRelativeLine(line));
      if (!marker || marker.isDisposed) continue;

      // ponytail: cell fg only — DOM textContent overlays drift vs xterm cells (ghost glyphs).
      const decoration = this.terminal.registerDecoration({
        marker,
        x,
        width,
        height: 1,
        layer: "top",
        foregroundColor: colorFor(span.kind),
      });
      if (!decoration) {
        marker.dispose();
        continue;
      }

      const renderDisposable = decoration.onRender((element) => {
        element.style.pointerEvents = "none";
      });

      this.decorations.push({
        dispose: () => {
          renderDisposable.dispose();
          decoration.dispose();
          marker.dispose();
        },
      });
    }
  }
}
