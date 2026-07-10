import { createApp } from "vue";
import App from "./App.vue";
import { initCommitAiSettings } from "./lib/commitAiSettings";
import { initSftpTransferSettings } from "./lib/sshSftpSettings";
import { initSettingsStore } from "./lib/settingsStore";
import { initTerminalAutocompleteSettings } from "./lib/terminalAutocompleteSettings";
import {
  applyTerminalThemeCssVars,
  initTerminalAppearanceSettings,
  useTerminalAppearanceSettings,
} from "./lib/terminalAppearanceSettings";
import "./style.css";

initSettingsStore()
  .then(() => initCommitAiSettings())
  .then(() => initTerminalAutocompleteSettings())
  .then(() => initSftpTransferSettings())
  .then(() => initTerminalAppearanceSettings())
  .then(() => {
    applyTerminalThemeCssVars(useTerminalAppearanceSettings().activeTheme.value);
    createApp(App).mount("#app");
  });
