<script setup lang="ts">
import { computed, ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { identityKindForAuth } from "../../lib/sshIdentityDiscovery";
import { endpointHasNetworkHop } from "../../lib/sshConnectSecrets";
import { collectAllTags, newId, sortGroups } from "../../lib/sshSftpStore";
import { SSH_TERMINAL_THEMES } from "../../lib/sshTerminalThemes";
import type { SshIdentity } from "../../types/sshIdentity";
import {
  endpointDisplayLabel,
  type SshEndpoint,
  type SshSftpLibrary,
} from "../../types/sshSftp";

const props = defineProps<{
  draft: SshEndpoint;
  library: SshSftpLibrary;
  isNew: boolean;
  password: string;
  hasStoredPassword?: boolean;
}>();

const emit = defineEmits<{
  "update:draft": [value: SshEndpoint];
  "update:password": [value: string];
  addIdentity: [identity: SshIdentity];
  removeIdentity: [identityId: string];
}>();

const activeTab = ref<"general" | "auth" | "sftp" | "ssh" | "appearance" | "notes">("general");
const tagInput = ref("");

const groups = computed(() => sortGroups(props.library.groups));
const tagSuggestions = computed(() => collectAllTags(props.library));
const otherHosts = computed(() =>
  props.library.endpoints.filter((item) => item.id !== props.draft.id),
);

const filteredIdentities = computed(() => {
  const kind = identityKindForAuth(props.draft.auth.method);
  if (!kind) return props.library.identities;
  return props.library.identities.filter((item) => item.kind === kind);
});

const integratedDirectConnect = computed(
  () => props.draft.connectionType === "ssh" && props.draft.auth.method !== "agent",
);

const networkHopBlocked = computed(
  () => integratedDirectConnect.value && endpointHasNetworkHop(props.draft),
);

function removeIdentityById(identityId: string) {
  emit("removeIdentity", identityId);
  if (props.draft.auth.identityId === identityId) {
    patchAuth({ identityId: null });
  }
}

function patch(partial: Partial<SshEndpoint>) {
  emit("update:draft", { ...props.draft, ...partial });
}

function patchAuth(partial: Partial<SshEndpoint["auth"]>) {
  emit("update:draft", {
    ...props.draft,
    auth: { ...props.draft.auth, ...partial },
  });
}

function patchProxy(partial: Partial<SshEndpoint["proxy"]>) {
  emit("update:draft", {
    ...props.draft,
    proxy: { ...props.draft.proxy, ...partial },
  });
}

function addTag(raw: string) {
  const tag = raw.trim();
  if (!tag || props.draft.tags.includes(tag)) return;
  patch({ tags: [...props.draft.tags, tag] });
  tagInput.value = "";
}

function removeTag(tag: string) {
  patch({ tags: props.draft.tags.filter((item) => item !== tag) });
}

async function pickIdentityFile(kind: SshIdentity["kind"]) {
  const selected = await open({
    multiple: false,
    filters:
      kind === "certificate"
        ? [{ name: "Certificate", extensions: ["p12", "pfx", "pem"] }]
        : [{ name: "SSH key", extensions: ["pem", "ppk", ""] }],
  });
  if (!selected || Array.isArray(selected)) return;
  const label = selected.split(/[/\\]/).pop() ?? "Identity";
  const identity: SshIdentity = {
    id: newId("identity"),
    label,
    kind,
    path: selected,
    hasPassphrase: kind !== "fido2",
  };
  emit("addIdentity", identity);
  patchAuth({ method: kind === "certificate" ? "certificate" : kind === "fido2" ? "fido2" : "publicKey", identityId: identity.id });
}

function setEnvKey(key: string, value: string) {
  patch({ environment: { ...props.draft.environment, [key]: value } });
}

function removeEnvKey(key: string) {
  const next = { ...props.draft.environment };
  delete next[key];
  patch({ environment: next });
}

const envRows = computed(() => Object.entries(props.draft.environment));
const newEnvKey = ref("");
const newEnvValue = ref("");

function addEnvRow() {
  const key = newEnvKey.value.trim();
  if (!key) return;
  setEnvKey(key, newEnvValue.value);
  newEnvKey.value = "";
  newEnvValue.value = "";
}

const tabs = [
  { id: "general", label: "General" },
  { id: "auth", label: "Auth" },
  { id: "sftp", label: "SFTP" },
  { id: "ssh", label: "SSH" },
  { id: "appearance", label: "Appearance" },
  { id: "notes", label: "Notes" },
] as const;
</script>

<template>
  <div class="oterm-scroll min-h-0 flex-1 overflow-auto p-4">
    <h3 class="text-sm font-medium">{{ isNew ? "New host" : `Edit ${endpointDisplayLabel(draft)}` }}</h3>

    <div class="mt-4 flex flex-wrap gap-1 border-b border-[var(--oterm-border)] pb-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="rounded px-2 py-1 text-xs"
        :class="
          activeTab === tab.id
            ? 'bg-[var(--oterm-accent)]/10 text-[var(--oterm-accent)]'
            : 'text-[var(--oterm-muted)] hover:bg-white/5'
        "
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'general'" class="mt-4 grid max-w-xl gap-3">
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Label
        <input
          :value="draft.label"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="patch({ label: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Host
        <input
          :value="draft.host"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="patch({ host: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Port
          <input
            :value="draft.port"
            type="number"
            min="1"
            max="65535"
            class="oterm-input-number rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
            @input="patch({ port: Number(($event.target as HTMLInputElement).value) || 22 })"
          />
        </label>
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Username
          <input
            :value="draft.username"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
            @input="patch({ username: ($event.target as HTMLInputElement).value })"
          />
        </label>
      </div>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Group
        <select
          :value="draft.groupId ?? ''"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="patch({ groupId: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">Uncategorized</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ group.name }}
          </option>
        </select>
      </label>
      <div class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Tags
        <div class="flex flex-wrap gap-1">
          <span
            v-for="tag in draft.tags"
            :key="tag"
            class="inline-flex items-center gap-1 rounded-full border border-[var(--oterm-border)] px-2 py-0.5 text-[10px]"
          >
            {{ tag }}
            <button type="button" class="text-[var(--oterm-danger)]" @click="removeTag(tag)">×</button>
          </span>
        </div>
        <input
          v-model="tagInput"
          list="ssh-tag-suggestions"
          placeholder="Add tag"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @keydown.enter.prevent="addTag(tagInput)"
        />
        <datalist id="ssh-tag-suggestions">
          <option v-for="tag in tagSuggestions" :key="tag" :value="tag" />
        </datalist>
      </div>
    </div>

    <div v-else-if="activeTab === 'auth'" class="mt-4 grid max-w-xl gap-3">
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Authentication
        <select
          :value="draft.auth.method"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="patchAuth({ method: ($event.target as HTMLSelectElement).value as SshEndpoint['auth']['method'] })"
        >
          <option value="password">Password</option>
          <option value="publicKey">Private key</option>
          <option value="certificate">Certificate (path)</option>
          <option value="agent">SSH agent</option>
          <option value="fido2">FIDO2 / security key file</option>
        </select>
      </label>
      <template v-if="draft.auth.method === 'password'">
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Password
          <input
            :value="password"
            type="password"
            autocomplete="new-password"
            :placeholder="hasStoredPassword ? 'Saved in credential store (leave blank to keep)' : 'Enter password'"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
            @input="emit('update:password', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex items-center gap-2 text-xs text-[var(--oterm-muted)]">
          <input
            type="checkbox"
            :checked="draft.auth.savePassword"
            @change="patchAuth({ savePassword: ($event.target as HTMLInputElement).checked })"
          />
          Save password in OS credential store
        </label>
      </template>
      <template v-if="draft.auth.method !== 'password' && draft.auth.method !== 'agent'">
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Identity
          <select
            :value="draft.auth.identityId ?? ''"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
            @change="patchAuth({ identityId: ($event.target as HTMLSelectElement).value || null })"
          >
            <option value="">
              {{ filteredIdentities.length ? "Select identity" : "No identities — add key file or import from ~/.ssh" }}
            </option>
            <option
              v-for="identity in filteredIdentities"
              :key="identity.id"
              :value="identity.id"
            >
              {{ identity.label }} ({{ identity.path }})
            </option>
          </select>
        </label>
        <ul v-if="filteredIdentities.length" class="grid gap-1 text-xs">
          <li
            v-for="identity in filteredIdentities"
            :key="identity.id"
            class="flex items-center justify-between gap-2 rounded border border-[var(--oterm-border)] px-2 py-1"
          >
            <span class="min-w-0 truncate text-[var(--oterm-muted)]">
              {{ identity.label }} — {{ identity.path }}
            </span>
            <button
              type="button"
              class="shrink-0 text-[var(--oterm-danger)] hover:underline"
              @click="removeIdentityById(identity.id)"
            >
              Remove
            </button>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
            @click="pickIdentityFile('privateKey')"
          >
            Add key file
          </button>
          <button
            type="button"
            class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
            @click="pickIdentityFile('certificate')"
          >
            Add certificate
          </button>
          <button
            type="button"
            class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
            @click="pickIdentityFile('fido2')"
          >
            Add FIDO2 key file
          </button>
        </div>
        <p v-if="draft.auth.method === 'fido2'" class="text-[10px] text-[var(--oterm-muted)]">
          FIDO2 hardware touch is handled by OpenSSH for terminal sessions. Integrated SFTP uses the
          key file path when russh supports it; otherwise use password or a standard key.
        </p>
        <p v-if="draft.auth.method === 'certificate'" class="text-[10px] text-[var(--oterm-muted)]">
          PKCS#12 unlock for integrated SFTP is limited in Phase 1; terminal auth uses OpenSSH with
          the selected path.
        </p>
      </template>
      <p v-if="draft.auth.method === 'agent'" class="text-[10px] text-[var(--oterm-muted)]">
        SSH agent works for terminal sessions via OpenSSH. Integrated SFTP requires a key file or
        password.
      </p>
    </div>

    <div v-else-if="activeTab === 'sftp'" class="mt-4 grid max-w-xl gap-3">
      <p class="text-xs text-[var(--oterm-muted)]">
        SFTP connects directly to the host (integrated). Jump hosts and proxies on the SSH tab are not used for SFTP.
      </p>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Default remote path
        <input
          :value="draft.defaultPath"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="patch({ defaultPath: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Default local path (left pane)
        <input
          :value="draft.localStartPath"
          placeholder="Leave empty for home directory"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="patch({ localStartPath: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>

    <div v-else-if="activeTab === 'ssh'" class="mt-4 grid max-w-xl gap-3">
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Connection type
        <select
          :value="draft.connectionType"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="patch({ connectionType: ($event.target as HTMLSelectElement).value as 'ssh' | 'mosh' })"
        >
          <option value="ssh">SSH</option>
          <option value="mosh">Mosh (terminal only)</option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-xs text-[var(--oterm-muted)]">
        <input
          type="checkbox"
          :checked="draft.agentForwarding"
          @change="patch({ agentForwarding: ($event.target as HTMLInputElement).checked })"
        />
        Agent forwarding (-A)
      </label>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Jump host
        <select
          :value="draft.jumpHostId ?? ''"
          :disabled="integratedDirectConnect"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm disabled:opacity-50"
          @change="patch({ jumpHostId: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">None</option>
          <option v-for="host in otherHosts" :key="host.id" :value="host.id">
            {{ endpointDisplayLabel(host) }}
          </option>
        </select>
      </label>
      <p
        v-if="networkHopBlocked"
        class="text-xs text-amber-600 dark:text-amber-400"
      >
        Jump hosts and proxies are only supported via the external OpenSSH terminal (SSH agent auth). Clear these settings for integrated SSH and SFTP.
      </p>
      <div class="grid grid-cols-3 gap-2">
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Proxy
          <select
            :value="draft.proxy.type"
            :disabled="integratedDirectConnect"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm disabled:opacity-50"
            @change="patchProxy({ type: ($event.target as HTMLSelectElement).value as SshEndpoint['proxy']['type'] })"
          >
            <option value="none">None</option>
            <option value="socks5">SOCKS5</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Proxy host
          <input
            :value="draft.proxy.host"
            :disabled="draft.proxy.type === 'none' || integratedDirectConnect"
            class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm disabled:opacity-50"
            @input="patchProxy({ host: ($event.target as HTMLInputElement).value })"
          />
        </label>
        <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
          Proxy port
          <input
            :value="draft.proxy.port"
            type="number"
            :disabled="draft.proxy.type === 'none' || integratedDirectConnect"
            class="oterm-input-number rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm disabled:opacity-50"
            @input="patchProxy({ port: Number(($event.target as HTMLInputElement).value) || 1080 })"
          />
        </label>
      </div>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Encoding
        <select
          :value="draft.encoding"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="patch({ encoding: ($event.target as HTMLSelectElement).value as SshEndpoint['encoding'] })"
        >
          <option value="utf-8">UTF-8</option>
          <option value="latin1">Latin-1</option>
          <option value="ascii">ASCII</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Backspace mode
        <select
          :value="draft.backspace"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="patch({ backspace: ($event.target as HTMLSelectElement).value as SshEndpoint['backspace'] })"
        >
          <option value="default">Default</option>
          <option value="ctrl-h">Ctrl-H</option>
          <option value="del">Delete</option>
        </select>
      </label>
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Startup snippet
        <textarea
          :value="draft.startupSnippet"
          rows="3"
          placeholder="Runs after connect via bash -lc"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="patch({ startupSnippet: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>
      <div class="grid gap-2">
        <div class="text-xs text-[var(--oterm-muted)]">Environment variables</div>
        <div
          v-for="[key, value] in envRows"
          :key="key"
          class="grid grid-cols-[1fr_1fr_auto] gap-2"
        >
          <input
            :value="key"
            class="rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1 text-xs"
            disabled
          />
          <input
            :value="value"
            class="rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1 text-xs"
            @input="setEnvKey(key, ($event.target as HTMLInputElement).value)"
          />
          <button type="button" class="text-xs text-[var(--oterm-danger)]" @click="removeEnvKey(key)">
            Remove
          </button>
        </div>
        <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            v-model="newEnvKey"
            placeholder="KEY"
            class="rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1 text-xs"
          />
          <input
            v-model="newEnvValue"
            placeholder="value"
            class="rounded border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1 text-xs"
          />
          <button type="button" class="text-xs text-[var(--oterm-accent)]" @click="addEnvRow">
            Add
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'appearance'" class="mt-4 grid max-w-xl gap-3">
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Terminal theme
        <select
          :value="draft.themeId ?? ''"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @change="patch({ themeId: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">App default</option>
          <option v-for="theme in SSH_TERMINAL_THEMES" :key="theme.id" :value="theme.id">
            {{ theme.label }}
          </option>
        </select>
      </label>
    </div>

    <div v-else class="mt-4 grid max-w-xl gap-3">
      <label class="grid gap-1 text-xs text-[var(--oterm-muted)]">
        Notes
        <textarea
          :value="draft.notes"
          rows="6"
          class="rounded-md border border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-2 py-1.5 text-sm"
          @input="patch({ notes: ($event.target as HTMLTextAreaElement).value })"
        />
      </label>
    </div>

  </div>
</template>
