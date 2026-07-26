<script setup lang="ts">
import { computed, useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    name:
      | "search"
      | "list-search"
      | "alert"
      | "terminal"
      | "branch"
      | "spinner-ring"
      | "spinner-arc";
    size?: number;
  }>(),
  { size: 12 },
);

const attrs = useAttrs();

const isSpinner = computed(
  () => props.name === "spinner-ring" || props.name === "spinner-arc",
);

const svgClass = computed(() => {
  const extra = attrs.class;
  return isSpinner.value ? ["animate-spin", extra] : extra;
});

const passthrough = computed(() => {
  const { class: _class, ...rest } = attrs as Record<string, unknown>;
  return rest;
});
</script>

<template>
  <!-- ponytail: one glyph switch instead of N icon SFCs; add names only when a third copy appears -->
  <svg
    v-if="name === 'search'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
  <svg
    v-else-if="name === 'list-search'"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <path
      d="M11.5 11.5L14.5 14.5M13 7.5a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0z"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
  <svg
    v-else-if="name === 'alert'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
  <svg
    v-else-if="name === 'terminal'"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
  <svg
    v-else-if="name === 'branch'"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <path
      d="M5 4.5a2.5 2.5 0 100 5v2.5M11 11.5a2.5 2.5 0 100-5v-2.5M5 7h6"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <svg
    v-else-if="name === 'spinner-ring'"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <circle cx="8" cy="8" r="6" stroke-opacity="0.15" stroke-width="2" />
    <path d="M14 8a6 6 0 0 0-6-6" stroke-width="2" stroke-linecap="round" />
  </svg>
  <svg
    v-else
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    aria-hidden="true"
    :class="svgClass"
    v-bind="passthrough"
  >
    <path
      d="M13.5 8a5.5 5.5 0 11-1.61-3.89L13.5 5.5"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
</template>
