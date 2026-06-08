import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export function useWindowDrag() {
  function startDrag(event: MouseEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".no-drag, button, a, input, select, label, option")) return;
    event.preventDefault();
    void appWindow.startDragging();
  }

  return { startDrag };
}
