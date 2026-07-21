<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { avatarColor, getInitials, githubAvatarUrl } from "../lib/githubAvatar";

const props = withDefaults(
  defineProps<{
    login: string;
    sizeClass?: string;
    textClass?: string;
    sizePx?: number;
  }>(),
  {
    sizeClass: "h-7 w-7",
    textClass: "text-[10px]",
    sizePx: 64,
  },
);

const failed = ref(false);

watch(
  () => props.login,
  () => {
    failed.value = false;
  },
);

const src = computed(() => githubAvatarUrl(props.login, props.sizePx));
const showImage = computed(() => Boolean(src.value) && !failed.value);
const initials = computed(() => getInitials(props.login));
const colorClass = computed(() => avatarColor(props.login || "?"));

function onError() {
  failed.value = true;
}
</script>

<template>
  <div
    class="relative shrink-0 overflow-hidden rounded-full shadow-sm"
    :class="sizeClass"
    :title="login ? `Author: ${login}` : undefined"
  >
    <img
      v-if="showImage"
      :src="src"
      :alt="login"
      class="h-full w-full object-cover"
      draggable="false"
      @error="onError"
    />
    <div
      v-else
      class="flex h-full w-full items-center justify-center bg-gradient-to-br font-bold text-white"
      :class="[colorClass, textClass]"
    >
      {{ initials }}
    </div>
  </div>
</template>
