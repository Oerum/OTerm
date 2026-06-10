export function appendTranscriptionToDraft(
  existing: string,
  transcription: string,
): string {
  const left = existing.trimEnd();
  const right = transcription.trim();
  if (!right) return existing;
  if (!left) return right;
  return `${left} ${right}`;
}

export function applyLiveDictationToDraft(
  baseDraft: string,
  partial: string,
): string {
  return appendTranscriptionToDraft(baseDraft, partial);
}
