import { ref } from "vue";
import { createPullRequest } from "../lib/pullRequestApi";

export function useCreatePullRequestForm() {
  const createPrOpen = ref(false);
  const createPrTitle = ref("");
  const createPrBody = ref("");
  const createPrBase = ref("");
  const createPrHead = ref("");
  const createPrDraft = ref(false);
  const createPrBusy = ref(false);
  const createPrError = ref<string | null>(null);

  function resetCreatePrForm() {
    createPrTitle.value = "";
    createPrBody.value = "";
    createPrBase.value = "";
    createPrHead.value = "";
    createPrDraft.value = false;
    createPrError.value = null;
  }

  function closeCreatePrDialog() {
    createPrOpen.value = false;
    createPrError.value = null;
  }

  async function executeSubmitCreatePr(
    repoRoot: string,
    onSuccess?: () => void | Promise<void>,
  ) {
    if (!createPrTitle.value.trim() || !createPrBase.value || !createPrHead.value) return;
    if (createPrBase.value === createPrHead.value) {
      createPrError.value = "Base and compare branches must be different.";
      return;
    }

    createPrBusy.value = true;
    createPrError.value = null;
    try {
      await createPullRequest({
        repoRoot,
        title: createPrTitle.value.trim(),
        body: createPrBody.value,
        base: createPrBase.value,
        head: createPrHead.value,
        draft: createPrDraft.value,
      });
      closeCreatePrDialog();
      if (onSuccess) {
        await onSuccess();
      }
    } catch (err) {
      createPrError.value = err instanceof Error ? err.message : String(err);
    } finally {
      createPrBusy.value = false;
    }
  }

  return {
    createPrOpen,
    createPrTitle,
    createPrBody,
    createPrBase,
    createPrHead,
    createPrDraft,
    createPrBusy,
    createPrError,
    resetCreatePrForm,
    closeCreatePrDialog,
    executeSubmitCreatePr,
  };
}
