import { ref } from "vue";

export type AppToastVariant = "info" | "warning" | "error" | "success";

type AppToastItem = {
  id: number;
  message: string;
  variant: AppToastVariant;
  durationMs: number;
};

export const appToasts = ref<AppToastItem[]>([]);
export const appToastActivity = ref<string | null>(null);

let nextId = 0;
const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();

const TOAST_DURATION_MS: Record<AppToastVariant, number> = {
  success: 5_000,
  error: 20_000,
  info: 10_000,
  warning: 10_000,
};

export function setAppToastActivity(message: string | null) {
  const trimmed = message?.trim();
  appToastActivity.value = trimmed || null;
}

export function pushAppToast(
  message: string,
  variant: AppToastVariant = "info",
  durationMs?: number,
) {
  const trimmed = message.trim();
  if (!trimmed) return;

  const id = ++nextId;
  const dismissMs = durationMs ?? TOAST_DURATION_MS[variant];
  appToasts.value = [...appToasts.value, { id, message: trimmed, variant, durationMs: dismissMs }];

  const timer = setTimeout(() => dismissAppToast(id), dismissMs);
  dismissTimers.set(id, timer);
}

export function dismissAppToast(id: number) {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
  appToasts.value = appToasts.value.filter((toast) => toast.id !== id);
}
