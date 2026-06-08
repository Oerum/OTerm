import { createApp } from "vue";
import App from "./App.vue";
import { initCommitAiSettings } from "./lib/commitAiSettings";
import { initSettingsStore } from "./lib/settingsStore";
import "./style.css";

initSettingsStore()
  .then(() => initCommitAiSettings())
  .then(() => {
    createApp(App).mount("#app");
  });
