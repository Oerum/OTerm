<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { openUrl } from "../lib/secureOpenUrl";
import { useOutsideDismiss } from "../composables/useOutsideDismiss";
import { getGitHubUserProfile } from "../lib/githubProfileApi";
import type { GitHubUserProfile } from "../types/githubProfile";

defineProps<{
  appVersion: string;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const profile = ref<GitHubUserProfile | null>(null);
const menuStyle = ref({ top: "0px", left: "0px" });

const displayName = computed(
  () => profile.value?.name?.trim() || profile.value?.login || null,
);

const profileUrl = computed(() =>
  profile.value ? `https://github.com/${profile.value.login}` : null,
);

const avatarInitials = computed(() => {
  const label = profile.value?.name?.trim() || profile.value?.login;
  if (!label) return "";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
});

function updateMenuPosition() {
  const anchor = rootRef.value;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  menuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(8, rect.right - 168)}px`,
  };
}

function toggle() {
  if (!open.value) {
    updateMenuPosition();
  }
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function onSettings() {
  emit("openSettings");
  close();
}

async function openProfile() {
  if (!profileUrl.value) return;
  try {
    await openUrl(profileUrl.value);
  } catch {
    // Ignore opener failures; the href remains available for fallback.
  }
  close();
}

useOutsideDismiss(() => open.value, close, [rootRef, menuRef]);

onMounted(() => {
  window.addEventListener("resize", updateMenuPosition);
  void getGitHubUserProfile()
    .then((value) => {
      profile.value = value;
    })
    .catch(() => {
      profile.value = null;
    });
});

onUnmounted(() => {
  window.removeEventListener("resize", updateMenuPosition);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border transition"
      :class="
        open
          ? 'border-[#42D96B]/50 bg-[var(--oterm-accent-dim)] text-[#7EF2D1]'
          : 'border-white/10 text-[var(--oterm-muted)] hover:border-white/20 hover:text-[#F5F5F7]'
      "
      :title="displayName ? `${displayName} (@${profile?.login})` : 'User menu'"
      aria-label="User menu"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <img
        v-if="profile?.avatarUrl"
        :src="profile.avatarUrl"
        :alt="displayName ?? profile.login"
        class="h-full w-full object-cover"
        draggable="false"
      />
      <span
        v-else-if="avatarInitials"
        class="text-[9px] font-semibold tracking-wide text-[var(--oterm-text)]"
      >
        {{ avatarInitials }}
      </span>
      <svg
        v-else
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
      >
        <circle cx="8" cy="5.5" r="2.25" stroke-width="1.4" />
        <path
          d="M3.5 13.5c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        role="menu"
        class="no-drag fixed z-[10000] min-w-[10.5rem] overflow-hidden rounded-lg border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] py-1 shadow-xl"
        :style="menuStyle"
        @mousedown.stop
      >
        <a
          v-if="profile && profileUrl"
          :href="profileUrl"
          class="block border-b border-[var(--oterm-border)] px-3 py-2 transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
          @click.prevent="openProfile"
        >
          <p class="truncate text-xs font-medium text-[var(--oterm-text)]">
            {{ displayName }}
          </p>
          <p class="truncate font-mono text-[10px] text-[var(--oterm-faint)]">
            @{{ profile.login }}
          </p>
        </a>
        <p
          v-else
          class="border-b border-[var(--oterm-border)] px-3 py-2 text-[10px] leading-snug text-[var(--oterm-faint)]"
        >
          Sign in with <span class="font-mono">gh auth login</span> to show your GitHub profile.
        </p>

        <button
          type="button"
          role="menuitem"
          class="flex w-full px-3 py-1.5 text-left text-xs text-[var(--oterm-text)] transition hover:bg-white/[0.06] focus:bg-white/[0.06] focus:outline-none"
          @click="onSettings"
        >
          Settings
        </button>
        <div role="separator" class="mt-1 border-t border-[var(--oterm-border)]" />

        <p class="px-3 py-1.5 text-center font-mono text-[10px] tracking-wide text-[var(--oterm-faint)]">
          v{{ appVersion }}
        </p>
      </div>
    </Teleport>
  </div>
</template>
