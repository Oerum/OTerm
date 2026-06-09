<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  parseSshConnectError,
  sshSftpConnect,
  sshSftpCreateDir,
  sshSftpDisconnect,
  sshSftpDownload,
  sshSftpListDir,
  sshSftpRemovePath,
  sshSftpUpload,
} from "../lib/sshSftpApi";
import {
  endpointsInCategory,
  loadSshSftpLibrary,
  newId,
  saveSshSftpLibrary,
  sortCategories,
} from "../lib/sshSftpStore";
import type { SshCategory, SshEndpoint, SshSftpEntry } from "../types/sshSftp";
import ConfirmDialog from "./ConfirmDialog.vue";
import PromptDialog from "./PromptDialog.vue";

const emit = defineEmits<{
  close: [];
  openSshTerminal: [endpoint: SshEndpoint];
}>();

type SecretPrompt = {
  title: string;
  label: string;
  value: string;
  onSubmit: (value: string) => void;
};

type PendingConfirm = {
  title: string;
  message: string;
  confirmLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
};

type PendingPrompt = {
  title: string;
  label: string;
  placeholder?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
};

type ActiveSession = {
  sessionId: string;
  endpointId: string;
  path: string;
  entries: SshSftpEntry[];
};

const library = ref(loadSshSftpLibrary());
const selectedCategoryId = ref<string | "all" | "uncategorized">("all");
const selectedEndpointId = ref<string | null>(null);
const search = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const panel = ref<"browse" | "edit">("browse");
const activeSession = ref<ActiveSession | null>(null);
const secretPrompt = ref<SecretPrompt | null>(null);
const confirmOpen = ref(false);
const pendingConfirm = ref<PendingConfirm | null>(null);
const promptOpen = ref(false);
const pendingPrompt = ref<PendingPrompt | null>(null);
const promptValue = ref("");
const uploadInputRef = ref<HTMLInputElement | null>(null);

const draft = ref<SshEndpoint>({
  id: "",
  categoryId: null,
  name: "",
  host: "",
  port: 22,
  username: "",
  authMethod: "password",
  keyPath: null,
  defaultPath: ".",
  notes: "",
});

const categories = computed(() => sortCategories(library.value.categories));
const filteredEndpoints = computed(() => {
  const q = search.value.trim().toLowerCase();
  let rows = library.value.endpoints;
  if (selectedCategoryId.value === "uncategorized") {
    rows = rows.filter((e) => !e.categoryId);
  } else if (selectedCategoryId.value !== "all") {
    rows = rows.filter((e) => e.categoryId === selectedCategoryId.value);
  }
  if (!q) return rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows
    .filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.host.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
});

const selectedEndpoint = computed(
  () => library.value.endpoints.find((e) => e.id === selectedEndpointId.value) ?? null,
);

const pathSegments = computed(() => {
  const path = activeSession.value?.path ?? ".";
  if (path === "." || path === "/") return [path];
  return path.split("/").filter(Boolean);
});

function persist() {
  saveSshSftpLibrary(library.value);
}

function selectEndpoint(endpoint: SshEndpoint) {
  selectedEndpointId.value = endpoint.id;
  panel.value = "browse";
}

function startNewEndpoint() {
  draft.value = {
    id: newId("ssh"),
    categoryId: selectedCategoryId.value === "all" || selectedCategoryId.value === "uncategorized"
      ? null
      : selectedCategoryId.value,
    name: "",
    host: "",
    port: 22,
    username: "",
    authMethod: "password",
    keyPath: null,
    defaultPath: ".",
    notes: "",
  };
  selectedEndpointId.value = draft.value.id;
  panel.value = "edit";
}

function startEditEndpoint(endpoint: SshEndpoint) {
  draft.value = { ...endpoint };
  selectedEndpointId.value = endpoint.id;
  panel.value = "edit";
}

function saveEndpointDraft() {
  const next = { ...draft.value };
  if (!next.name.trim() || !next.host.trim() || !next.username.trim()) {
    error.value = "Name, host, and username are required.";
    return;
  }
  const idx = library.value.endpoints.findIndex((e) => e.id === next.id);
  if (idx >= 0) {
    library.value.endpoints[idx] = next;
  } else {
    library.value.endpoints.push(next);
  }
  persist();
  selectedEndpointId.value = next.id;
  panel.value = "browse";
  error.value = null;
}

function openPrompt(options: PendingPrompt) {
  pendingPrompt.value = options;
  promptValue.value = "";
  promptOpen.value = true;
}

function resolvePrompt(confirmed: boolean) {
  const pending = pendingPrompt.value;
  const value = promptValue.value.trim();
  promptOpen.value = false;
  pendingPrompt.value = null;
  promptValue.value = "";
  if (confirmed && pending && value) pending.onSubmit(value);
}

function addCategory() {
  openPrompt({
    title: "New category",
    label: "Category name",
    placeholder: "e.g. Production, Staging",
    confirmLabel: "Create",
    onSubmit: (name) => {
      const category: SshCategory = {
        id: newId("cat"),
        name,
        order: library.value.categories.length,
      };
      library.value.categories.push(category);
      persist();
      selectedCategoryId.value = category.id;
    },
  });
}

function askConfirm(options: PendingConfirm) {
  pendingConfirm.value = options;
  confirmOpen.value = true;
}

function resolveConfirm(confirmed: boolean) {
  const pending = pendingConfirm.value;
  confirmOpen.value = false;
  pendingConfirm.value = null;
  if (confirmed) pending?.onConfirm();
}

function deleteEndpoint(endpoint: SshEndpoint) {
  askConfirm({
    title: "Delete endpoint?",
    message: `Remove "${endpoint.name}" from your library?`,
    confirmLabel: "Delete",
    dangerous: true,
    onConfirm: () => {
      library.value.endpoints = library.value.endpoints.filter((e) => e.id !== endpoint.id);
      if (activeSession.value?.endpointId === endpoint.id) {
        void disconnectSftp();
      }
      if (selectedEndpointId.value === endpoint.id) {
        selectedEndpointId.value = null;
      }
      persist();
    },
  });
}

let secretReject: ((reason?: unknown) => void) | null = null;

function askSecret(title: string, label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    secretReject = reject;
    secretPrompt.value = {
      title,
      label,
      value: "",
      onSubmit: (value) => {
        secretPrompt.value = null;
        secretReject = null;
        resolve(value);
      },
    };
  });
}

function cancelSecretPrompt() {
  secretPrompt.value = null;
  secretReject?.(new Error("Cancelled"));
  secretReject = null;
}

async function runBusy<T>(action: () => Promise<T>): Promise<T | undefined> {
  busy.value = true;
  error.value = null;
  try {
    return await action();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    return undefined;
  } finally {
    busy.value = false;
  }
}

type ConnectSecrets = {
  password?: string;
  keyPassphrase?: string;
};

async function connectSftp(
  endpoint: SshEndpoint,
  acceptHostKey = false,
  secrets?: ConnectSecrets,
) {
  let password = secrets?.password;
  let keyPassphrase = secrets?.keyPassphrase;

  if (!acceptHostKey) {
    if (endpoint.authMethod === "password" && password === undefined) {
      try {
        password = await askSecret(
          "SSH password",
          `Password for ${endpoint.username}@${endpoint.host}`,
        );
      } catch {
        return;
      }
    } else if (endpoint.authMethod === "publicKey" && endpoint.keyPath && keyPassphrase === undefined) {
      try {
        keyPassphrase = await askSecret(
          "Key passphrase",
          "Passphrase (leave empty if none)",
        );
      } catch {
        return;
      }
    }
  }

  const connectSecrets: ConnectSecrets = { password, keyPassphrase };
  busy.value = true;
  error.value = null;
  let result: Awaited<ReturnType<typeof sshSftpConnect>> | undefined;
  try {
    result = await sshSftpConnect({
      host: endpoint.host,
      port: endpoint.port,
      username: endpoint.username,
      authMethod: endpoint.authMethod,
      password: password ?? null,
      keyPath: endpoint.keyPath,
      keyPassphrase: keyPassphrase || null,
      acceptHostKey,
    });
  } catch (err) {
    const hostKeyError = parseSshConnectError(err instanceof Error ? err.message : String(err));
    if (hostKeyError?.code === "HOST_KEY_UNKNOWN") {
      askConfirm({
        title: "Trust this host?",
        message: `The server ${endpoint.host}:${endpoint.port} is not in your known_hosts file.\n\n${hostKeyError.algorithm}\n${hostKeyError.fingerprint}\n\nOnly continue if you trust this server.`,
        confirmLabel: "Trust and connect",
        onConfirm: () => void connectSftp(endpoint, true, connectSecrets),
      });
      return;
    }
    if (hostKeyError?.code === "HOST_KEY_CHANGED") {
      error.value =
        hostKeyError.message ??
        `Host key changed for ${endpoint.host}. Remove the old entry from ~/.ssh/known_hosts before reconnecting.`;
      return;
    }
    error.value = err instanceof Error ? err.message : String(err);
    return;
  } finally {
    busy.value = false;
  }

  const path = endpoint.defaultPath.trim() || ".";
  const entries = await sshSftpListDir(result.sessionId, path).catch(() => []);
  activeSession.value = {
    sessionId: result.sessionId,
    endpointId: endpoint.id,
    path: result.homePath || path,
    entries,
  };
  selectedEndpointId.value = endpoint.id;
  panel.value = "browse";
}

async function disconnectSftp() {
  const session = activeSession.value;
  if (!session) return;
  await runBusy(() => sshSftpDisconnect(session.sessionId));
  activeSession.value = null;
}

async function loadRemoteDir(path: string) {
  const session = activeSession.value;
  if (!session) return;
  const entries = await runBusy(() => sshSftpListDir(session.sessionId, path));
  if (!entries) return;
  activeSession.value = { ...session, path, entries };
}

function openRemoteEntry(entry: SshSftpEntry) {
  if (!entry.isDir) return;
  void loadRemoteDir(entry.path);
}

function goRemoteUp() {
  const session = activeSession.value;
  if (!session) return;
  const path = session.path;
  if (path === "." || path === "/") return;
  const parent = path.includes("/") ? path.replace(/\/[^/]+$/, "") || "/" : ".";
  void loadRemoteDir(parent);
}

function goRemoteSegment(index: number) {
  const session = activeSession.value;
  if (!session) return;
  const segments = pathSegments.value;
  if (index < 0 || index >= segments.length) return;
  const next =
    segments[0] === "."
      ? segments.slice(0, index + 1).join("/") || "."
      : `/${segments.slice(0, index + 1).join("/")}`;
  void loadRemoteDir(next);
}

function createRemoteFolder() {
  const session = activeSession.value;
  if (!session) return;
  openPrompt({
    title: "New folder",
    label: "Folder name",
    placeholder: "e.g. uploads",
    confirmLabel: "Create",
    onSubmit: (name) => {
      void (async () => {
        const base = session.path === "." ? "" : session.path.replace(/\/$/, "");
        const path = base ? `${base}/${name}` : name;
        const ok = await runBusy(() => sshSftpCreateDir(session.sessionId, path));
        if (ok !== undefined) await loadRemoteDir(session.path);
      })();
    },
  });
}

function joinRemotePath(base: string, name: string) {
  if (base === "." || base === "") return name;
  return `${base.replace(/\/$/, "")}/${name}`;
}

function pickUploadFiles() {
  uploadInputRef.value?.click();
}

async function onUploadFilesSelected(event: Event) {
  const session = activeSession.value;
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!session || !files?.length) return;
  input.value = "";

  for (const file of Array.from(files)) {
    const remotePath = joinRemotePath(session.path, file.name);
    const data = new Uint8Array(await file.arrayBuffer());
    const ok = await runBusy(() => sshSftpUpload(session.sessionId, remotePath, data));
    if (ok === undefined) return;
  }
  await loadRemoteDir(session.path);
}

async function downloadRemoteEntry(entry: SshSftpEntry) {
  const session = activeSession.value;
  if (!session || entry.isDir) return;
  const data = await runBusy(() => sshSftpDownload(session.sessionId, entry.path));
  if (!data) return;

  const blob = new Blob([data]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = entry.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function deleteRemoteEntry(entry: SshSftpEntry) {
  const session = activeSession.value;
  if (!session) return;
  askConfirm({
    title: entry.isDir ? "Delete folder?" : "Delete file?",
    message: `Remove "${entry.name}" from the remote host?`,
    confirmLabel: "Delete",
    dangerous: true,
    onConfirm: () => {
      void runBusy(async () => {
        await sshSftpRemovePath(session.sessionId, entry.path, entry.isDir);
        await loadRemoteDir(session.path);
      });
    },
  });
}

function openTerminal(endpoint: SshEndpoint) {
  emit("openSshTerminal", endpoint);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function endpointSubtitle(endpoint: SshEndpoint) {
  return `${endpoint.username}@${endpoint.host}:${endpoint.port}`;
}

function rowClass(endpoint: SshEndpoint) {
  return selectedEndpointId.value === endpoint.id
    ? "border-[var(--oterm-accent)]/50 bg-[var(--oterm-accent)]/5"
    : "border-[var(--oterm-border)] bg-[var(--oterm-panel)]";
}

watch(selectedEndpoint, (endpoint) => {
  if (!endpoint || panel.value === "edit") return;
  if (activeSession.value?.endpointId !== endpoint.id) {
    panel.value = "browse";
  }
});

onMounted(() => {
  library.value = loadSshSftpLibrary();
});

onUnmounted(() => {
  void disconnectSftp();
});
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">SSH / SFTP</h2>
      <span class="truncate text-xs text-[var(--oterm-muted)]">Saved hosts and native SFTP</span>
      <div class="flex-1" />
      <button
        type="button"
        class="rounded-md border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close tab
      </button>
    </header>

    <p v-if="error" class="px-4 py-2 text-sm text-[var(--oterm-danger)]">{{ error }}</p>

    <div class="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside class="flex min-h-0 flex-col border-r border-[var(--oterm-border)]">
        <div class="space-y-2 border-b border-[var(--oterm-border)] p-3">
          <input
            v-model="search"
            type="search"
            placeholder="Search hosts..."
            class="w-full rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm outline-none focus:border-[var(--oterm-accent)]/50"
          />
          <div class="flex gap-1">
            <button
              type="button"
              class="flex-1 rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
              @click="addCategory"
            >
              Category
            </button>
            <button
              type="button"
              class="flex-1 rounded border border-[var(--oterm-accent)]/40 px-2 py-1 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
              @click="startNewEndpoint"
            >
              Host
            </button>
          </div>
        </div>

        <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-2">
          <button
            type="button"
            class="mb-1 w-full rounded px-2 py-1 text-left text-xs"
            :class="
              selectedCategoryId === 'all'
                ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
                : 'text-[var(--oterm-muted)] hover:bg-white/5'
            "
            @click="selectedCategoryId = 'all'"
          >
            All hosts ({{ library.endpoints.length }})
          </button>
          <button
            type="button"
            class="mb-2 w-full rounded px-2 py-1 text-left text-xs"
            :class="
              selectedCategoryId === 'uncategorized'
                ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
                : 'text-[var(--oterm-muted)] hover:bg-white/5'
            "
            @click="selectedCategoryId = 'uncategorized'"
          >
            Uncategorized ({{ endpointsInCategory(library.endpoints, null).length }})
          </button>

          <div v-for="category in categories" :key="category.id" class="mb-2">
            <button
              type="button"
              class="mb-1 w-full rounded px-2 py-1 text-left text-xs font-medium"
              :class="
                selectedCategoryId === category.id
                  ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
                  : 'text-[var(--oterm-muted)] hover:bg-white/5'
              "
              @click="selectedCategoryId = category.id"
            >
              {{ category.name }}
              ({{ endpointsInCategory(library.endpoints, category.id).length }})
            </button>
          </div>

          <div class="mt-3 space-y-1">
            <button
              v-for="endpoint in filteredEndpoints"
              :key="endpoint.id"
              type="button"
              class="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.02]"
              :class="rowClass(endpoint)"
              @click="selectEndpoint(endpoint)"
            >
              <div class="truncate font-medium">{{ endpoint.name }}</div>
              <div class="mt-0.5 truncate text-[10px] text-[var(--oterm-muted)]">
                {{ endpointSubtitle(endpoint) }}
              </div>
            </button>
            <p v-if="filteredEndpoints.length === 0" class="px-2 py-4 text-xs text-[var(--oterm-muted)]">
              No hosts in this view.
            </p>
          </div>
        </div>
      </aside>

      <section class="flex min-h-0 flex-1 flex-col">
        <div
          v-if="panel === 'edit'"
          class="oterm-scroll min-h-0 flex-1 overflow-auto p-4"
        >
          <h3 class="text-sm font-medium">{{ draft.id ? "Edit host" : "New host" }}</h3>
          <div class="mt-4 grid max-w-xl gap-3">
            <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
              Name
              <input
                v-model="draft.name"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              />
            </label>
            <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
              Host
              <input
                v-model="draft.host"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
                Port
                <input
                  v-model.number="draft.port"
                  type="number"
                  min="1"
                  max="65535"
                  class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
                />
              </label>
              <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
                Username
                <input
                  v-model="draft.username"
                  class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
                />
              </label>
            </div>
            <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
              Category
              <select
                v-model="draft.categoryId"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              >
                <option :value="null">Uncategorized</option>
                <option v-for="category in categories" :key="category.id" :value="category.id">
                  {{ category.name }}
                </option>
              </select>
            </label>
            <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
              Authentication
              <select
                v-model="draft.authMethod"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              >
                <option value="password">Password</option>
                <option value="publicKey">Public key</option>
              </select>
            </label>
            <label
              v-if="draft.authMethod === 'publicKey'"
              class="grid gap-1 text-xs text-[var(--oterm-muted)]"
            >
              Private key path
              <input
                v-model="draft.keyPath"
                placeholder="~/.ssh/id_rsa"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              />
            </label>
            <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
              Default SFTP path
              <input
                v-model="draft.defaultPath"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              />
            </label>
            <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
              Notes
              <textarea
                v-model="draft.notes"
                rows="3"
                class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm text-[var(--oterm-text)]"
              />
            </label>
            <div class="flex gap-2 pt-2">
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-accent)]/40 px-3 py-1.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
                @click="saveEndpointDraft"
              >
                Save host
              </button>
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs hover:bg-white/5"
                @click="panel = 'browse'"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        <template v-else-if="selectedEndpoint">
          <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-3">
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{{ selectedEndpoint.name }}</div>
              <div class="truncate text-xs text-[var(--oterm-muted)]">
                {{ endpointSubtitle(selectedEndpoint) }}
              </div>
            </div>
            <div class="flex-1" />
            <button
              type="button"
              class="rounded border border-[var(--oterm-accent)]/40 px-2 py-1 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10 disabled:opacity-50"
              :disabled="busy"
              @click="openTerminal(selectedEndpoint)"
            >
              SSH terminal
            </button>
            <button
              v-if="!activeSession || activeSession.endpointId !== selectedEndpoint.id"
              type="button"
              class="rounded border border-[var(--oterm-accent)]/40 px-2 py-1 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10 disabled:opacity-50"
              :disabled="busy"
              @click="connectSftp(selectedEndpoint)"
            >
              Connect SFTP
            </button>
            <button
              v-else
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-50"
              :disabled="busy"
              @click="disconnectSftp"
            >
              Disconnect
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
              @click="startEditEndpoint(selectedEndpoint)"
            >
              Edit
            </button>
            <button
              type="button"
              class="rounded border border-[var(--oterm-danger)]/40 px-2 py-1 text-xs text-[var(--oterm-danger)] hover:bg-[var(--oterm-danger)]/10"
              @click="deleteEndpoint(selectedEndpoint)"
            >
              Delete
            </button>
          </div>

          <div
            v-if="activeSession && activeSession.endpointId === selectedEndpoint.id"
            class="flex min-h-0 flex-1 flex-col"
          >
            <div class="flex flex-wrap items-center gap-1 border-b border-[var(--oterm-border)] px-4 py-2 text-xs">
              <button
                type="button"
                class="rounded px-1.5 py-0.5 hover:bg-white/5 disabled:opacity-40"
                :disabled="activeSession.path === '.' || activeSession.path === '/'"
                @click="goRemoteUp"
              >
                Up
              </button>
              <template v-for="(segment, index) in pathSegments" :key="`${segment}-${index}`">
                <span class="text-[var(--oterm-faint)]">/</span>
                <button
                  type="button"
                  class="rounded px-1.5 py-0.5 hover:bg-white/5"
                  @click="goRemoteSegment(index)"
                >
                  {{ segment }}
                </button>
              </template>
              <div class="flex-1" />
              <button
                type="button"
                class="rounded border border-[var(--oterm-border)] px-2 py-0.5 hover:bg-white/5 disabled:opacity-50"
                :disabled="busy"
                @click="pickUploadFiles"
              >
                Upload
              </button>
              <button
                type="button"
                class="rounded border border-[var(--oterm-border)] px-2 py-0.5 hover:bg-white/5 disabled:opacity-50"
                :disabled="busy"
                @click="createRemoteFolder"
              >
                New folder
              </button>
              <button
                type="button"
                class="rounded border border-[var(--oterm-border)] px-2 py-0.5 hover:bg-white/5 disabled:opacity-50"
                :disabled="busy"
                @click="loadRemoteDir(activeSession.path)"
              >
                Refresh
              </button>
              <input
                ref="uploadInputRef"
                type="file"
                multiple
                class="hidden"
                @change="onUploadFilesSelected"
              />
            </div>

            <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-4">
              <div
                v-for="entry in activeSession.entries"
                :key="entry.path"
                class="mb-1 grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-3 py-2 text-sm hover:bg-white/[0.02]"
                @click="openRemoteEntry(entry)"
              >
                <div class="min-w-0">
                  <div class="truncate font-medium">
                    {{ entry.isDir ? "📁" : "📄" }} {{ entry.name }}
                  </div>
                  <div class="truncate text-[10px] text-[var(--oterm-muted)]">{{ entry.path }}</div>
                </div>
                <div class="text-xs text-[var(--oterm-muted)]">
                  {{ entry.isDir ? "folder" : formatSize(entry.size) }}
                </div>
                <div class="flex items-center gap-1" @click.stop>
                  <button
                    v-if="!entry.isDir"
                    type="button"
                    class="rounded border border-[var(--oterm-accent)]/40 px-2 py-0.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
                    @click="downloadRemoteEntry(entry)"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    class="rounded border border-[var(--oterm-danger)]/40 px-2 py-0.5 text-xs text-[var(--oterm-danger)] hover:bg-[var(--oterm-danger)]/10"
                    @click="deleteRemoteEntry(entry)"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p
                v-if="activeSession.entries.length === 0"
                class="py-8 text-center text-sm text-[var(--oterm-muted)]"
              >
                This folder is empty.
              </p>
            </div>
          </div>

          <div
            v-else
            class="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--oterm-muted)]"
          >
            <div>
              <p class="font-medium text-[var(--oterm-text)]">{{ selectedEndpoint.name }}</p>
              <p class="mt-1">{{ selectedEndpoint.notes || "Connect SFTP to browse remote files." }}</p>
            </div>
          </div>
        </template>

        <div
          v-else
          class="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--oterm-muted)]"
        >
          Select a host or create a new one.
        </div>
      </section>
    </div>

    <div
      v-if="secretPrompt"
      class="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      @click.self="cancelSecretPrompt"
    >
      <form
        class="w-full max-w-sm rounded-xl border border-[var(--oterm-border-strong)] bg-[var(--oterm-elevated)] p-4 shadow-2xl"
        @submit.prevent="secretPrompt?.onSubmit(secretPrompt.value)"
      >
        <h3 class="text-sm font-medium">{{ secretPrompt.title }}</h3>
        <label class="mt-3 grid gap-1 text-xs text-[var(--oterm-muted)]">
          {{ secretPrompt.label }}
          <input
            v-model="secretPrompt.value"
            type="password"
            autofocus
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          />
        </label>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs hover:bg-white/5"
            @click="cancelSecretPrompt"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="rounded-md border border-[var(--oterm-accent)]/40 px-3 py-1.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
          >
            Continue
          </button>
        </div>
      </form>
    </div>

    <PromptDialog
      :open="promptOpen"
      :title="pendingPrompt?.title ?? ''"
      :label="pendingPrompt?.label ?? ''"
      :placeholder="pendingPrompt?.placeholder"
      :confirm-label="pendingPrompt?.confirmLabel"
      v-model="promptValue"
      @confirm="resolvePrompt(true)"
      @cancel="resolvePrompt(false)"
    />

    <ConfirmDialog
      :open="confirmOpen"
      :title="pendingConfirm?.title ?? ''"
      :message="pendingConfirm?.message ?? ''"
      :confirm-label="pendingConfirm?.confirmLabel"
      :dangerous="pendingConfirm?.dangerous"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />
  </div>
</template>
