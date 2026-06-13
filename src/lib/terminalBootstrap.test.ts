import { describe, expect, it } from "vitest";
import {
  areTerminalEventListenersReady,
  shouldBootstrapTerminalAfterListenerSetup,
} from "./terminalBootstrap";

describe("areTerminalEventListenersReady", () => {
  it("requires both output and exit listeners before bootstrap can spawn", () => {
    expect(
      areTerminalEventListenersReady({
        outputListenerReady: true,
        exitListenerReady: true,
      }),
    ).toBe(true);
    expect(
      areTerminalEventListenersReady({
        outputListenerReady: true,
        exitListenerReady: false,
      }),
    ).toBe(false);
    expect(
      areTerminalEventListenersReady({
        outputListenerReady: false,
        exitListenerReady: true,
      }),
    ).toBe(false);
  });
});

describe("shouldBootstrapTerminalAfterListenerSetup", () => {
  it("blocks startup until the tab is active and listeners are ready", () => {
    expect(
      shouldBootstrapTerminalAfterListenerSetup({
        tabActive: true,
        outputListenerReady: true,
        exitListenerReady: true,
      }),
    ).toBe(true);
    expect(
      shouldBootstrapTerminalAfterListenerSetup({
        tabActive: false,
        outputListenerReady: true,
        exitListenerReady: true,
      }),
    ).toBe(false);
    expect(
      shouldBootstrapTerminalAfterListenerSetup({
        tabActive: true,
        outputListenerReady: true,
        exitListenerReady: false,
      }),
    ).toBe(false);
  });
});
