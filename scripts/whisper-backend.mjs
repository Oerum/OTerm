import { fileURLToPath } from "node:url";

export const WHISPER_BACKENDS = {
  metal: "whisper-metal",
  vulkan: "whisper-vulkan",
  cuda: "whisper-cuda",
  openblas: "whisper-openblas",
};

export function defaultWhisperBackend() {
  if (process.platform === "darwin") {
    return "metal";
  }
  return "vulkan";
}

export function resolveWhisperBackend() {
  const override = process.env.OTERM_WHISPER_BACKEND?.trim().toLowerCase();
  if (!override) {
    return defaultWhisperBackend();
  }

  if (!Object.hasOwn(WHISPER_BACKENDS, override)) {
    throw new Error(
      `Invalid OTERM_WHISPER_BACKEND="${override}". Use: ${Object.keys(WHISPER_BACKENDS).join(", ")}.`,
    );
  }

  if (override === "openblas" && process.platform !== "linux") {
    throw new Error("OTERM_WHISPER_BACKEND=openblas is only supported on Linux.");
  }

  if (override === "metal" && process.platform !== "darwin") {
    throw new Error("OTERM_WHISPER_BACKEND=metal is only supported on macOS.");
  }

  return override;
}

export function whisperCargoFeature(backend = resolveWhisperBackend()) {
  return WHISPER_BACKENDS[backend];
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  try {
    console.log(whisperCargoFeature());
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
