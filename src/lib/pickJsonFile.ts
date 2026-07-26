import { open } from "@tauri-apps/plugin-dialog";

/** Open a single JSON file picker; returns null if cancelled. */
export async function pickJsonFile(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return null;
  return path;
}
