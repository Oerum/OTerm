import { createApp } from "vue";
import App from "./App.vue";
import { initCommitAiSettings } from "./lib/commitAiSettings";
import { initSftpTransferSettings } from "./lib/sshSftpSettings";
import { initSettingsStore } from "./lib/settingsStore";
import { initTerminalAutocompleteSettings } from "./lib/terminalAutocompleteSettings";
import "./style.css";

initSettingsStore()
  .then(() => initCommitAiSettings())
  .then(() => initTerminalAutocompleteSettings())
  .then(() => initSftpTransferSettings())
  .then(() => {
    createApp(App).mount("#app");
  });
