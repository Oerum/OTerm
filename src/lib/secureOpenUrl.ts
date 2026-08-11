import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * A secure wrapper around Tauri's `openUrl` that validates the URL scheme.
 * Only allows safe protocols: http:, https:, and mailto:.
 */
export async function openUrl(url: string, baseUrl?: string): Promise<void> {
  let parsed: URL;
  try {
    const base = baseUrl || (typeof window !== "undefined" && window.location?.href ? window.location.href : undefined);
    parsed = base ? new URL(url, base) : new URL(url);
  } catch (error) {
    console.warn("Failed to parse URL in openUrl:", url, error);
    return;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    console.warn("Blocked attempt to open unsafe URL scheme:", protocol, url);
    return;
  }

  await tauriOpenUrl(parsed.href);
}

