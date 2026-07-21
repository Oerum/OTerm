import { describe, expect, it } from "vitest";
import { ALL_KEYBIND_ACTIONS, getKeybind } from "./keybindSettings";

describe("keybind defaults", () => {
  it("defines a default for every KeybindAction", () => {
    for (const action of ALL_KEYBIND_ACTIONS) {
      const bind = getKeybind(action);
      expect(bind.key, action).toBeTruthy();
    }
  });
});
