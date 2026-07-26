import { ref, type Ref } from "vue";
import { createPullRequest } from "../lib/pullRequestApi";

type CreatePrFormRefs = {
  createPrOpen: Ref<boolean>;
  createPrTitle: Ref<string>;
  createPrBody: Ref<string>;
  createPrBase: Ref<string>;
  createPrHead: Ref<string>;
  createPrDraft: Ref<boolean>;
  createPrBusy: Ref<boolean>;
  createPrError: Ref<string | null>;
};

function resetCreatePrForm(form: CreatePrFormRefs) {
  form.createPrTitle.value = "";
  form.createPrBody.value = "";
  form.createPrBase.value = "";
  form.createPrHead.value = "";
  form.createPrDraft.value = false;
  form.createPrError.value = null;
}

function closeCreatePrDialog(form: CreatePrFormRefs) {
  form.createPrOpen.value = false;
  form.createPrError.value = null;
}

async function executeSubmitCreatePr(
  form: CreatePrFormRefs,
  repoRoot: string,
  onSuccess?: () => void | Promise<void>,
) {
  if (!form.createPrTitle.value.trim() || !form.createPrBase.value || !form.createPrHead.value) return;
  if (form.createPrBase.value === form.createPrHead.value) {
    form.createPrError.value = "Base and compare branches must be different.";
    return;
  }

  form.createPrBusy.value = true;
  form.createPrError.value = null;
  try {
    await createPullRequest({
      repoRoot,
      title: form.createPrTitle.value.trim(),
      body: form.createPrBody.value,
      base: form.createPrBase.value,
      head: form.createPrHead.value,
      draft: form.createPrDraft.value,
    });
    closeCreatePrDialog(form);
    if (onSuccess) await onSuccess();
  } catch (err) {
    form.createPrError.value = err instanceof Error ? err.message : String(err);
  } finally {
    form.createPrBusy.value = false;
  }
}

export function useCreatePullRequestForm() {
  const form: CreatePrFormRefs = {
    createPrOpen: ref(false),
    createPrTitle: ref(""),
    createPrBody: ref(""),
    createPrBase: ref(""),
    createPrHead: ref(""),
    createPrDraft: ref(false),
    createPrBusy: ref(false),
    createPrError: ref<string | null>(null),
  };

  return {
    ...form,
    resetCreatePrForm: () => resetCreatePrForm(form),
    closeCreatePrDialog: () => closeCreatePrDialog(form),
    executeSubmitCreatePr: (repoRoot: string, onSuccess?: () => void | Promise<void>) =>
      executeSubmitCreatePr(form, repoRoot, onSuccess),
  };
}
