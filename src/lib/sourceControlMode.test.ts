import { describe, expect, it } from "vitest";
import { nextSourceControlPresentation } from "./sourceControlMode";

describe("nextSourceControlPresentation", () => {
  it("toggles hidden <-> ephemeral", () => {
    expect(nextSourceControlPresentation("hidden", "toggle")).toBe("ephemeral");
    expect(nextSourceControlPresentation("ephemeral", "toggle")).toBe("hidden");
  });

  it("dismisses on escape, committed, pushed, leave-repo", () => {
    for (const event of ["escape", "committed", "pushed", "leave-repo"] as const) {
      expect(nextSourceControlPresentation("ephemeral", event)).toBe("hidden");
      expect(nextSourceControlPresentation("hidden", event)).toBe("hidden");
    }
  });

  it("leaves presentation unchanged on open-palette", () => {
    expect(nextSourceControlPresentation("ephemeral", "open-palette")).toBe("ephemeral");
    expect(nextSourceControlPresentation("hidden", "open-palette")).toBe("hidden");
  });
});
