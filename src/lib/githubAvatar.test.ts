import { describe, expect, it } from "vitest";
import { githubAvatarLogin, githubAvatarUrl, getInitials } from "./githubAvatar";

describe("githubAvatar", () => {
  it("builds github png url and strips [bot] suffix", () => {
    expect(githubAvatarLogin("gemini-code-assist[bot]")).toBe("gemini-code-assist");
    expect(githubAvatarUrl("Oerum", 64)).toBe("https://github.com/Oerum.png?size=64");
    expect(githubAvatarUrl("gemini-code-assist[bot]", 40)).toBe(
      "https://github.com/gemini-code-assist.png?size=40",
    );
  });

  it("returns empty url for blank login", () => {
    expect(githubAvatarUrl("   ")).toBe("");
  });

  it("computes initials", () => {
    expect(getInitials("Oerum")).toBe("OE");
    expect(getInitials("gemini-code-assist")).toBe("GA");
  });
});
