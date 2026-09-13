## 2024-05-24 - Headless Browser UI Verification
**Learning:** The Vite dev server (`http://localhost:1420`) may load a blank screen during headless Playwright tests because the Vue application heavily depends on Tauri backend APIs (like window state, fs, etc.) which aren't available in a standard browser environment.
**Action:** Do not rely on visual screenshots from the raw Vite server for layout/focus verification unless mock data or a Tauri-compatible testing harness is explicitly set up. Rely on reading the code and running unit tests.
