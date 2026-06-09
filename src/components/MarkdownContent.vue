<script setup lang="ts">
import { computed } from "vue";
import { renderMarkdown } from "../lib/markdown";

const props = withDefaults(
  defineProps<{
    source: string;
    emptyText?: string;
  }>(),
  {
    emptyText: "No content.",
  },
);

const html = computed(() => renderMarkdown(props.source));
const isEmpty = computed(() => !props.source.trim());
</script>

<template>
  <p v-if="isEmpty" class="text-sm text-[var(--warp-muted)]">{{ emptyText }}</p>
  <div v-else class="markdown-content text-sm leading-relaxed" v-html="html" />
</template>

<style scoped>
.markdown-content :deep(p) {
  margin: 0.75em 0;
}

.markdown-content :deep(p:first-child) {
  margin-top: 0;
}

.markdown-content :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  margin: 1.25em 0 0.5em;
  font-weight: 600;
  line-height: 1.3;
  color: var(--warp-text);
}

.markdown-content :deep(h1) {
  font-size: 1.25rem;
}

.markdown-content :deep(h2) {
  font-size: 1.125rem;
}

.markdown-content :deep(h3) {
  font-size: 1rem;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.75em 0;
  padding-left: 1.5em;
}

.markdown-content :deep(ul) {
  list-style: disc outside;
}

.markdown-content :deep(ol) {
  list-style: decimal outside;
}

.markdown-content :deep(ul ul) {
  list-style-type: circle;
}

.markdown-content :deep(ul ul ul) {
  list-style-type: square;
}

.markdown-content :deep(li) {
  display: list-item;
  margin: 0.25em 0;
}

.markdown-content :deep(blockquote) {
  margin: 0.75em 0;
  padding-left: 0.75em;
  border-left: 3px solid var(--warp-border-strong);
  color: var(--warp-muted);
}

.markdown-content :deep(a) {
  color: var(--warp-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-content :deep(a:hover) {
  opacity: 0.9;
}

.markdown-content :deep(code) {
  font-family: var(--warp-font-mono);
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}

.markdown-content :deep(pre) {
  margin: 0.75em 0;
  padding: 0.75em 1em;
  overflow-x: auto;
  border-radius: 6px;
  border: 1px solid var(--warp-border);
  background: var(--warp-elevated);
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: 0.85em;
}

.markdown-content :deep(table) {
  margin: 0.75em 0;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875em;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  padding: 0.35em 0.6em;
  border: 1px solid var(--warp-border);
}

.markdown-content :deep(th) {
  background: rgba(255, 255, 255, 0.04);
  text-align: left;
}

.markdown-content :deep(hr) {
  margin: 1em 0;
  border: none;
  border-top: 1px solid var(--warp-border);
}

.markdown-content :deep(input[type="checkbox"]) {
  margin-right: 0.35em;
  accent-color: var(--warp-accent);
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}
</style>
