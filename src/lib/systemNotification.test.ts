import { describe, expect, it } from "vitest";
import {
  APP_NOTIFICATION_TITLE,
  buildTerminalNotificationContent,
} from "./systemNotification";

describe("buildTerminalNotificationContent", () => {
  const basePane = {
    customTitle: null,
    oscTitle: null,
    activeAgentId: null,
    cwd: "~/projects/oterm",
    shellId: "pwsh",
  } as const;

  it("brands notifications as OTerm with agent headline and cwd detail", () => {
    const content = buildTerminalNotificationContent(
      { ...basePane, activeAgentId: "claude" },
      "Windows PowerShell",
    );
    expect(content.title).toBe(APP_NOTIFICATION_TITLE);
    expect(content.body).toBe("Claude Code is ready · oterm");
  });

  it("uses terminal-ready copy without shell label when cwd is home", () => {
    const content = buildTerminalNotificationContent(
      { ...basePane, cwd: "~" },
      "Windows PowerShell",
    );
    expect(content.title).toBe(APP_NOTIFICATION_TITLE);
    expect(content.body).toBe("Terminal ready");
  });

  it("includes cwd folder for shell sessions", () => {
    const content = buildTerminalNotificationContent(basePane, "Windows PowerShell");
    expect(content.title).toBe(APP_NOTIFICATION_TITLE);
    expect(content.body).toBe("Terminal ready · oterm");
  });

  it("prefers osc title in the body detail", () => {
    const content = buildTerminalNotificationContent(
      { ...basePane, oscTitle: "Fix auth bug" },
      "Windows PowerShell",
    );
    expect(content.title).toBe(APP_NOTIFICATION_TITLE);
    expect(content.body).toBe("Terminal ready · Fix auth bug");
  });

  it("uses completed agent identity after activeAgentId was cleared", () => {
    const content = buildTerminalNotificationContent(
      basePane,
      "Windows PowerShell",
      "cursor",
    );
    expect(content.title).toBe(APP_NOTIFICATION_TITLE);
    expect(content.body).toBe("Cursor is ready · oterm");
  });
});
