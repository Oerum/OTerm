import { describe, expect, it } from "vitest";
import { nextSourceControlPresentation } from "./sourceControlMode";

describe("nextSourceControlPresentation", () => {
  it("toggles hidden <-> ephemeral", () => {
    expect(nextSourceControlPresentation("hidden", "toggle")).toBe("ephemeral");
    expect(nextSourceControlPresentation("ephemeral", "toggle")).toBe("hidden");
  });

  it("dismisses on escape and leave-repo", () => {
    for (const event of ["escape", "leave-repo"] as const) {
      expect(nextSourceControlPresentation("ephemeral", event)).toBe("hidden");
      expect(nextSourceControlPresentation("hidden", event)).toBe("hidden");
    }
  });

  it.each(["committed", "pushed", "open-palette"] as const)("leaves presentation unchanged on %s", (event) => {
    expect(nextSourceControlPresentation("ephemeral", event)).toBe("ephemeral");
    expect(nextSourceControlPresentation("hidden", event)).toBe("hidden");
  });
});
