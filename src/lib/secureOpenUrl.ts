import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

/**
 * A secure wrapper around Tauri's `openUrl` that validates the URL scheme.
 * Only allows safe protocols: http:, https:, and mailto:.
 */
export async function openUrl(url: string, baseUrl?: string): Promise<void> {
  try {
    const parsed = new URL(url, baseUrl || window.location.href);
    const protocol = parsed.protocol.toLowerCase();

    if (["http:", "https:", "mailto:"].includes(protocol)) {
      await tauriOpenUrl(url);
    } else {
      console.warn("Blocked attempt to open unsafe URL scheme:", protocol);
    }
  } catch (error) {
    // Ignore invalid URLs
    console.warn("Failed to parse URL in openUrl:", error);
  }
}
