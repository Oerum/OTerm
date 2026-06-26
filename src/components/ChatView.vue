<template>
  <div class="relative flex h-full w-full items-center justify-center bg-[var(--oterm-bg)] overflow-hidden">
    <!-- Premium background glowing orbs -->
    <div class="pointer-events-none absolute h-[350px] w-[350px] rounded-full bg-[var(--oterm-accent)]/8 blur-[100px]" />
    
    <!-- Glassmorphic Card -->
    <div class="relative z-10 flex max-w-sm flex-col items-center rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-10 text-center shadow-2xl backdrop-blur-xl">
      <!-- Chat Icon with pulse effect -->
      <div class="relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-[var(--oterm-accent)]/5 opacity-50" />
        <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path
            d="M2.5 3.5h11a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H5.2L2.5 13V4.5a1 1 0 0 1 1-1Z"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
          <path d="M5 6.5h6M5 9h4" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </div>

      <!-- Feature Pill -->
      <span class="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--oterm-accent)]/30 bg-[var(--oterm-accent)]/10 px-3.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--oterm-accent)]">
        <span class="h-1.5 w-1.5 rounded-full bg-[var(--oterm-accent)] animate-pulse" />
        Coming Soon
      </span>

      <!-- Title -->
      <h2 class="text-xl font-bold tracking-tight text-[var(--oterm-text)] mb-3">
        Chat
      </h2>

      <!-- Description -->
      <p class="text-xs leading-relaxed text-[var(--oterm-muted)] px-2">
        A high-fidelity agentic chat interface.
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Sleek animations if needed */
</style>
