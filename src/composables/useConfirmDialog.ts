import { ref } from "vue";

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function useConfirmDialog() {
  const confirmOpen = ref(false);
  const pendingConfirm = ref<PendingConfirm | null>(null);

  function askConfirm(options: PendingConfirm) {
    pendingConfirm.value = options;
    confirmOpen.value = true;
  }

  function resolveConfirm(confirmed: boolean) {
    const pending = pendingConfirm.value;
    confirmOpen.value = false;
    pendingConfirm.value = null;
    if (confirmed) {
      pending?.onConfirm();
    } else {
      pending?.onCancel?.();
    }
  }

  return {
    confirmOpen,
    pendingConfirm,
    askConfirm,
    resolveConfirm,
  };
}
