export function areTerminalEventListenersReady(input: {
  outputListenerReady: boolean;
  exitListenerReady: boolean;
}): boolean {
  return input.outputListenerReady && input.exitListenerReady;
}

export function shouldBootstrapTerminalAfterListenerSetup(input: {
  tabActive: boolean;
  outputListenerReady: boolean;
  exitListenerReady: boolean;
}): boolean {
  return input.tabActive && areTerminalEventListenersReady(input);
}
