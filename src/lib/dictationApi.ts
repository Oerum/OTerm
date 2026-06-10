import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DictationStatus = {
  modelInstalled: boolean;
  modelName: string;
  modelPath: string | null;
  recording: boolean;
  transcribing: boolean;
};

export type DictationTranscriptionResult = {
  text: string;
};

export type DictationModelDownloadProgressEvent = {
  downloadedBytes: number;
  totalBytes: number | null;
};

export type DictationLivePartialEvent = {
  text: string;
};

export function getDictationStatus(): Promise<DictationStatus> {
  return invoke<DictationStatus>("dictation_get_status");
}

export function downloadDictationModel(): Promise<void> {
  return invoke("dictation_download_model");
}

export function startDictationRecording(): Promise<void> {
  return invoke("dictation_start_recording");
}

export function cancelDictationRecording(): Promise<void> {
  return invoke("dictation_cancel_recording");
}

export function stopDictationAndTranscribe(): Promise<DictationTranscriptionResult> {
  return invoke<DictationTranscriptionResult>("dictation_stop_and_transcribe");
}

export function listenDictationModelDownloadProgress(
  handler: (event: DictationModelDownloadProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<DictationModelDownloadProgressEvent>(
    "dictation-model-download-progress",
    (event) => {
      handler(event.payload);
    },
  );
}

export function listenDictationLivePartial(
  handler: (event: DictationLivePartialEvent) => void,
): Promise<UnlistenFn> {
  return listen<DictationLivePartialEvent>("dictation-live-partial", (event) => {
    handler(event.payload);
  });
}
