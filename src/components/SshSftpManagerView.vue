<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useConfirmDialog } from "../composables/useConfirmDialog";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { isActionKeybind } from "../lib/keybindSettings";
import { pushAppToast, setAppToastActivity } from "../lib/appToast";
import { listDirectory, userHome } from "../lib/fsApi";
import {
  collectLocalUploadTree,
  collectRemoteDownloadTree,
  createDir,
  joinPath,
  mapWithConcurrency,
  parentPath,
  readFile,
  removePath,
  transferLocalJobToRemote,
  transferLocalToRemote,
  transferRemoteJobToLocal,
  transferRemoteToLocal,
  writeFile,
} from "../lib/fsTransferApi";
import {
  deleteHostPassword,
  loadHostPassword,
  saveHostPassword,
  saveIdentityPassphrase,
} from "../lib/sshCredentialStore";
import {
  networkHopIntegratedConnectError,
  resolveConnectSecrets,
  type ConnectSecrets,
} from "../lib/sshConnectSecrets";
import { exportSshLibrary, importSshLibrary } from "../lib/sshLibraryExport";
import {
  parseSshConnectError,
  unknownHostKeyConfirm,
  sshSftpConnect,
  sshSftpCreateDir,
  sshSftpDisconnect,
  sshSftpDownload,
  sshSftpListDir,
  sshSftpRemovePath,
  sshSftpUpload,
} from "../lib/sshSftpApi";
import {
  defaultSshEndpoint,
  endpointAuthMethod,
  endpointDisplayLabel,
  endpointKeyPath,
  type SshConnectRequest,
  type SshEndpoint,
  type SshGroup,
  type SshSftpEntry,
} from "../types/sshSftp";
import type { SshIdentity } from "../types/sshIdentity";
import {
  discoverSshIdentities,
  mergeDiscoveredIdentities,
} from "../lib/sshIdentityDiscovery";
import {
  cloneSshEndpoint,
  loadSshSftpLibrary,
  newId,
  saveSshSftpLibrary,
} from "../lib/sshSftpStore";
import { useSftpTransferSettings } from "../lib/sshSftpSettings";
import ConfirmDialog from "./ConfirmDialog.vue";
import PromptDialog from "./PromptDialog.vue";
import SftpDualPane from "./ssh/SftpDualPane.vue";
import type { FilePaneEntry } from "./ssh/SftpFilePane.vue";
import SshHostDetailBar from "./ssh/SshHostDetailBar.vue";
import SshHostEditor from "./ssh/SshHostEditor.vue";
import SshHostSidebar from "./ssh/SshHostSidebar.vue";
import SshSecretPrompt from "./ssh/SshSecretPrompt.vue";

const emit = defineEmits<{
  close: [];
  openSshTerminal: [endpoint: SshEndpoint];
}>();

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
  remotePath: string;
  remoteEntries: SshSftpEntry[];
};

type SecretKind = "password" | "passphrase";

const library = ref(loadSshSftpLibrary());
const { settings: sftpTransferSettings } = useSftpTransferSettings();
const selectedGroupId = ref<string | "all" | "uncategorized">("all");
const selectedTagFilters = ref<string[]>([]);
const selectedEndpointId = ref<string | null>(null);
const search = ref("");
const busy = ref(false);
const error = ref<string | null>(null);
const panel = ref<"browse" | "edit">("browse");
const activeSession = ref<ActiveSession | null>(null);
const localPath = ref(".");
const localEntries = ref<FilePaneEntry[]>([]);
const selectedLocalEntry = ref<FilePaneEntry | null>(null);
const selectedRemoteEntry = ref<FilePaneEntry | null>(null);
const focusedPane = ref<"local" | "remote">("remote");

const activeWatches = new Map<string, {
  intervalId: ReturnType<typeof setInterval>;
  lastModifiedTime: number;
  lastSize: number;
}>();

function clearAllWatches() {
  for (const watch of activeWatches.values()) {
    clearInterval(watch.intervalId);
  }
  activeWatches.clear();
}

const { confirmOpen, pendingConfirm, askConfirm, resolveConfirm } = useConfirmDialog();
const promptOpen = ref(false);
const pendingPrompt = ref<PendingPrompt | null>(null);
const promptValue = ref("");

const secretOpen = ref(false);
const secretKind = ref<SecretKind>("password");
const secretValue = ref("");
const secretSave = ref(false);
const secretTitle = ref("");
const secretLabel = ref("");
const secretSaveLabel = ref("Save in OS credential store");
const uploadConfirmForPath = ref<string | null>(null);
let secretResolve: ((value: string) => void) | null = null;
let secretReject: ((reason?: unknown) => void) | null = null;
const secretEndpoint = ref<SshEndpoint | null>(null);

const draft = ref<SshEndpoint>(defaultSshEndpoint({ id: newId("ssh") }));
const draftPassword = ref("");
const draftHasStoredPassword = ref(false);
const savingDraft = ref(false);
const testingConnection = ref(false);

const selectedEndpoint = computed(
  () => library.value.endpoints.find((e) => e.id === selectedEndpointId.value) ?? null,
);

const isEditingNew = computed(
  () => panel.value === "edit" && !library.value.endpoints.some((e) => e.id === draft.value.id),
);

const sftpConnected = computed(() => activeSession.value !== null);

function persist() {
  saveSshSftpLibrary(library.value);
}

function toFileEntries(entries: Awaited<ReturnType<typeof listDirectory>>): FilePaneEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    isDir: entry.isDir,
    size: entry.size ?? 0,
    modified: entry.modified ?? null,
  }));
}

function toRemoteEntries(entries: SshSftpEntry[]): FilePaneEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    path: entry.path,
    isDir: entry.isDir,
    size: entry.size,
    modified: entry.modified ?? null,
  }));
}

async function loadLocalDir(path: string) {
  const result = await runBusy(async () => {
    const entries = await listDirectory(path === "." ? undefined : path);
    localPath.value = path;
    localEntries.value = toFileEntries(entries);
    return true;
  });
  if (result === undefined) {
    pushAppToast(error.value ?? "Failed to open local folder", "error");
  }
}

async function ensureLocalHome(endpoint: SshEndpoint | null) {
  if (endpoint?.localStartPath.trim()) {
    await loadLocalDir(endpoint.localStartPath.trim());
    return;
  }
  const home = await userHome();
  await loadLocalDir(home);
}

async function loadRemoteDir(path: string) {
  const session = activeSession.value;
  if (!session) return;
  const entries = await runBusy(() => sshSftpListDir(session.sessionId, path));
  if (!entries) return;
  activeSession.value = {
    ...session,
    remotePath: path,
    remoteEntries: entries,
  };
}

function selectEndpoint(endpoint: SshEndpoint) {
  selectedEndpointId.value = endpoint.id;
  panel.value = "browse";
}

function resetDraftPasswordState() {
  draftPassword.value = "";
  draftHasStoredPassword.value = false;
}

async function refreshDraftPasswordState(endpoint: SshEndpoint) {
  resetDraftPasswordState();
  if (endpoint.auth.method !== "password" || !endpoint.auth.savePassword) return;
  const stored = await loadHostPassword(endpoint.id).catch(() => null);
  draftHasStoredPassword.value = Boolean(stored);
}

function startNewEndpoint() {
  draft.value = defaultSshEndpoint({
    id: newId("ssh"),
    groupId:
      selectedGroupId.value === "all" || selectedGroupId.value === "uncategorized"
        ? null
        : selectedGroupId.value,
  });
  resetDraftPasswordState();
  selectedEndpointId.value = draft.value.id;
  panel.value = "edit";
  error.value = null;
}

async function startEditEndpoint(endpoint: SshEndpoint) {
  draft.value = cloneSshEndpoint(endpoint);
  resetDraftPasswordState();
  selectedEndpointId.value = endpoint.id;
  panel.value = "edit";
  error.value = null;
  await refreshDraftPasswordState(endpoint);
}

function editSelectedEndpoint() {
  const endpoint = selectedEndpoint.value;
  if (!endpoint) {
    pushAppToast("Select a host to edit", "warning");
    return;
  }
  void startEditEndpoint(endpoint);
}

async function saveEndpointDraft() {
  if (savingDraft.value) return;

  savingDraft.value = true;
  setAppToastActivity("Saving host…");

  try {
    const next = cloneSshEndpoint(draft.value);
    if (!next.label.trim() || !next.host.trim() || !next.username.trim()) {
      const message = "Label, host, and username are required.";
      error.value = message;
      pushAppToast(message, "error");
      return;
    }
    if (next.auth.method === "password" && next.auth.savePassword) {
      const password = draftPassword.value;
      if (!password && !draftHasStoredPassword.value) {
        const message = "Enter a password or disable “Save password in OS credential store”.";
        error.value = message;
        pushAppToast(message, "error");
        return;
      }
    }

    const passwordToStore = draftPassword.value;

    if (next.auth.method === "password") {
      if (next.auth.savePassword) {
        if (passwordToStore) {
          await saveHostPassword(next.id, passwordToStore);
        } else if (!draftHasStoredPassword.value) {
          const message = "Enter a password to store in the OS credential store.";
          error.value = message;
          pushAppToast(message, "error");
          return;
        }
      } else {
        await deleteHostPassword(next.id).catch(() => undefined);
      }
    } else {
      await deleteHostPassword(next.id).catch(() => undefined);
    }

    const idx = library.value.endpoints.findIndex((e) => e.id === next.id);
    const isNew = idx < 0;
    if (idx >= 0) {
      library.value.endpoints[idx] = next;
    } else {
      library.value.endpoints.push(next);
    }

    persist();
    selectedEndpointId.value = next.id;
    panel.value = "browse";
    error.value = null;
    draftPassword.value = "";
    draftHasStoredPassword.value =
      next.auth.method === "password" && Boolean(next.auth.savePassword);
    pushAppToast(isNew ? "Host saved" : "Host updated", "success");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error.value = message;
    pushAppToast(`Could not save host: ${message}`, "error");
  } finally {
    savingDraft.value = false;
    setAppToastActivity(null);
  }
}

function buildSftpConnectRequest(
  endpoint: SshEndpoint,
  resolved: { password?: string | null; keyPassphrase?: string | null },
  acceptHostKey: boolean,
): SshConnectRequest {
  return {
    host: endpoint.host,
    port: endpoint.port,
    username: endpoint.username,
    authMethod: endpointAuthMethod(endpoint),
    password: resolved.password ?? null,
    keyPath: endpointKeyPath(endpoint, library.value.identities),
    keyPassphrase: resolved.keyPassphrase || null,
    acceptHostKey,
  };
}

function askUnknownHostKeyTrust(
  endpoint: SshEndpoint,
  err: unknown,
  action: "test" | "connect",
  onConfirm: () => void | Promise<void>,
): boolean {
  const hostKeyError = parseSshConnectError(err instanceof Error ? err.message : String(err));
  if (hostKeyError?.code !== "HOST_KEY_UNKNOWN") return false;
  askConfirm({
    ...unknownHostKeyConfirm(endpoint.host, endpoint.port, hostKeyError, action),
    onConfirm,
  });
  return true;
}

function resolveSftpSecrets(ep: SshEndpoint, secretsOverride?: ConnectSecrets) {
  return resolveConnectSecrets(
    ep,
    library.value,
    {
      askSecret: ({ kind, endpoint: epItem, title, label, defaultSave }) =>
        askSecret(kind, epItem, title, label, defaultSave),
      toast: (message, kind) => pushAppToast(message, kind),
      agentUnsupported: () => {
        error.value = "SFTP does not support SSH agent auth. Use a key file or password for SFTP.";
      },
    },
    secretsOverride,
    { context: "sftp" },
  );
}

async function testConnection() {
  if (testingConnection.value) return;

  const endpoint = draft.value;
  if (!endpoint) return;

  const hopError = networkHopIntegratedConnectError(endpoint, "sftp");
  if (hopError) {
    error.value = hopError;
    pushAppToast(hopError, "error");
    return;
  }

  testingConnection.value = true;
  setAppToastActivity("Testing connection…");
  error.value = null;

  async function runTest(acceptHostKey: boolean) {
    let inputPassword: string | undefined = draftPassword.value;
    if (inputPassword === "" && draftHasStoredPassword.value) {
      inputPassword = undefined;
    }
    const resolved = await resolveSftpSecrets(endpoint, { password: inputPassword });
    if (!resolved) return false;

    const result = await sshSftpConnect(buildSftpConnectRequest(endpoint, resolved, acceptHostKey));

    await sshSftpDisconnect(result.sessionId);
    pushAppToast("Connection successful!", "success");
    return true;
  }

  try {
    const success = await runTest(false);
    if (!success) return;
  } catch (err) {
    if (
      askUnknownHostKeyTrust(endpoint, err, "test", async () => {
        testingConnection.value = true;
        setAppToastActivity("Testing connection…");
        try {
          await runTest(true);
        } catch (innerErr) {
          const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
          error.value = msg;
          pushAppToast(msg, "error");
        } finally {
          testingConnection.value = false;
          setAppToastActivity(null);
        }
      })
    ) {
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    error.value = msg;
    pushAppToast(msg, "error");
  } finally {
    testingConnection.value = false;
    setAppToastActivity(null);
  }
}

async function duplicateEndpoint(endpoint: SshEndpoint) {
  setAppToastActivity("Duplicating host…");
  try {
    const copy = cloneSshEndpoint(endpoint);
    copy.id = newId("ssh");
    copy.label = `${endpointDisplayLabel(endpoint)} copy`;
    library.value.endpoints.push(copy);
    persist();
    draft.value = cloneSshEndpoint(copy);
    resetDraftPasswordState();
    selectedEndpointId.value = copy.id;
    panel.value = "edit";
    error.value = null;
    pushAppToast("Host duplicated — review and save", "success");

    if (endpoint.auth.savePassword) {
      const password = await loadHostPassword(endpoint.id).catch(() => null);
      if (password) {
        await saveHostPassword(copy.id, password);
        copy.auth = { ...copy.auth, savePassword: true };
        const idx = library.value.endpoints.findIndex((e) => e.id === copy.id);
        if (idx >= 0) library.value.endpoints[idx] = copy;
        persist();
        draft.value = cloneSshEndpoint(copy);
        draftHasStoredPassword.value = true;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error.value = message;
    pushAppToast(`Could not duplicate host: ${message}`, "error");
  } finally {
    setAppToastActivity(null);
  }
}

function duplicateSelectedEndpoint() {
  const endpoint = selectedEndpoint.value;
  if (!endpoint) {
    pushAppToast("Select a host to duplicate", "warning");
    return;
  }
  void duplicateEndpoint(endpoint);
}

function cancelEdit() {
  if (isEditingNew.value) {
    selectedEndpointId.value = null;
  }
  panel.value = "browse";
  resetDraftPasswordState();
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

function addGroup() {
  openPrompt({
    title: "New group",
    label: "Group name",
    placeholder: "e.g. Production",
    confirmLabel: "Create",
    onSubmit: (name) => {
      const group: SshGroup = {
        id: newId("group"),
        name,
        parentId: selectedGroupId.value !== "all" && selectedGroupId.value !== "uncategorized"
          ? selectedGroupId.value
          : null,
        order: library.value.groups.length,
      };
      library.value.groups.push(group);
      persist();
      selectedGroupId.value = group.id;
    },
  });
}

function deleteEndpoint(endpoint: SshEndpoint) {
  askConfirm({
    title: "Delete host?",
    message: `Remove "${endpointDisplayLabel(endpoint)}" from your library?`,
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
      void deleteHostPassword(endpoint.id).catch(() => undefined);
      persist();
    },
  });
}

function askSecret(
  kind: SecretKind,
  endpoint: SshEndpoint,
  title: string,
  label: string,
  defaultSave: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    secretKind.value = kind;
    secretEndpoint.value = endpoint;
    secretTitle.value = title;
    secretLabel.value = label;
    secretValue.value = "";
    secretSave.value = defaultSave;
    secretSaveLabel.value =
      kind === "password"
        ? "Save password in OS credential store"
        : "Save passphrase in OS credential store";
    secretOpen.value = true;
    secretResolve = resolve;
    secretReject = reject;
  });
}

function submitSecret() {
  const value = secretValue.value;
  const endpoint = secretEndpoint.value;
  secretOpen.value = false;
  secretResolve?.(value);
  secretResolve = null;
  secretReject = null;
  if (endpoint && secretSave.value) {
    if (secretKind.value === "password") {
      void saveHostPassword(endpoint.id, value).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        pushAppToast(`Could not save password: ${message}`, "error");
      });
      const idx = library.value.endpoints.findIndex((item) => item.id === endpoint.id);
      if (idx >= 0) {
        library.value.endpoints[idx] = {
          ...library.value.endpoints[idx],
          auth: { ...library.value.endpoints[idx].auth, savePassword: true },
        };
        persist();
      }
    } else if (secretKind.value === "passphrase" && endpoint.auth.identityId) {
      void saveIdentityPassphrase(endpoint.auth.identityId, value);
    }
  }
  secretEndpoint.value = null;
}

function cancelSecret() {
  secretOpen.value = false;
  secretReject?.(new Error("Cancelled"));
  secretResolve = null;
  secretReject = null;
  secretEndpoint.value = null;
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

function sftpDownloadFn(sessionId: string) {
  const maxTransferBytes = sftpTransferSettings.value.maxFileSizeBytes;
  return (path: string) => sshSftpDownload(sessionId, path, maxTransferBytes);
}

function sftpUploadFn(sessionId: string) {
  const maxTransferBytes = sftpTransferSettings.value.maxFileSizeBytes;
  return (remotePath: string, data: Uint8Array) =>
    sshSftpUpload(sessionId, remotePath, data, maxTransferBytes);
}

async function uploadLocalTree(
  sessionId: string,
  localPath: string,
  remoteParentDir: string,
  folderName: string,
): Promise<{ fileCount: number; failures: number }> {
  const { remoteDirs, files } = await collectLocalUploadTree(
    localPath,
    remoteParentDir,
    folderName,
  );
  for (const dir of remoteDirs) {
    await sshSftpCreateDir(sessionId, dir);
  }
  const maxFileSizeBytes = sftpTransferSettings.value.maxFileSizeBytes;
  const upload = sftpUploadFn(sessionId);
  const { failures } = await mapWithConcurrency(
    files,
    sftpTransferSettings.value.parallelFiles,
    (job) => transferLocalJobToRemote(job, upload, maxFileSizeBytes),
  );
  return { fileCount: files.length, failures };
}

async function downloadRemoteTree(
  sessionId: string,
  remotePath: string,
  localParentDir: string,
  folderName: string,
): Promise<{ fileCount: number; failures: number }> {
  const listRemoteDir = async (path: string) => {
    const entries = await sshSftpListDir(sessionId, path);
    return entries.map((entry) => ({
      path: entry.path,
      name: entry.name,
      isDir: entry.isDir,
    }));
  };
  const { localDirs, files } = await collectRemoteDownloadTree(
    listRemoteDir,
    remotePath,
    localParentDir,
    folderName,
  );
  for (const dir of localDirs) {
    await createDir(dir);
  }
  const download = sftpDownloadFn(sessionId);
  const { failures } = await mapWithConcurrency(
    files,
    sftpTransferSettings.value.parallelFiles,
    (job) => transferRemoteJobToLocal(job, download),
  );
  return { fileCount: files.length, failures };
}

async function connectSftp(endpoint: SshEndpoint, acceptHostKey = false, secrets?: ConnectSecrets) {
  const hopError = networkHopIntegratedConnectError(endpoint, "sftp");
  if (hopError) {
    error.value = hopError;
    return;
  }

  const resolved = await resolveSftpSecrets(endpoint, secrets);
  if (!resolved) return;

  busy.value = true;
  error.value = null;
  let result: Awaited<ReturnType<typeof sshSftpConnect>> | undefined;

  try {
    result = await sshSftpConnect(buildSftpConnectRequest(endpoint, resolved, acceptHostKey));
  } catch (err) {
    if (askUnknownHostKeyTrust(endpoint, err, "connect", () => void connectSftp(endpoint, true, resolved))) {
      return;
    }
    const hostKeyError = parseSshConnectError(err instanceof Error ? err.message : String(err));
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

  if (!result) return;

  const remotePath = endpoint.defaultPath.trim() || result.homePath || ".";
  const entries = await sshSftpListDir(result.sessionId, remotePath).catch(() => []);
  activeSession.value = {
    sessionId: result.sessionId,
    endpointId: endpoint.id,
    remotePath,
    remoteEntries: entries,
  };
  selectedEndpointId.value = endpoint.id;
  panel.value = "browse";
  await ensureLocalHome(endpoint);
  pushAppToast("SFTP connected", "success");
}

async function disconnectSftp() {
  const session = activeSession.value;
  if (!session) return;
  clearAllWatches();
  await runBusy(() => sshSftpDisconnect(session.sessionId));
  activeSession.value = null;
}

function onConnectSftp() {
  const endpoint = selectedEndpoint.value;
  if (!endpoint) return;
  void connectSftp(endpoint);
}

function onLocalUp() {
  void loadLocalDir(parentPath(localPath.value));
}

function onRemoteUp() {
  const session = activeSession.value;
  if (!session) return;
  const parent = parentPath(session.remotePath);
  if (parent === session.remotePath) return;
  void loadRemoteDir(parent);
}

function onLocalNavigate(path: string) {
  void loadLocalDir(path);
}

function onRemoteNavigate(path: string) {
  void loadRemoteDir(path);
}

function onLocalOpen(entry: FilePaneEntry) {
  if (entry.isDir) {
    void loadLocalDir(entry.path);
  } else {
    void openPath(entry.path);
  }
}

async function onRemoteOpen(entry: FilePaneEntry) {
  if (entry.isDir) {
    void loadRemoteDir(entry.path);
    return;
  }
  const session = activeSession.value;
  if (!session) return;

  const home = await userHome();
  const localTempDir = joinPath(home, ".oterm/sftp_temp/" + session.sessionId);
  const localTempPath = joinPath(localTempDir, entry.name);

  await runBusy(async () => {
    await createDir(localTempDir);

    await transferRemoteToLocal(
      sftpDownloadFn(session.sessionId),
      entry.path,
      localTempDir,
      entry.name,
    );

    const entries = await listDirectory(localTempDir);
    const tempEntry = entries.find((e) => e.name === entry.name);
    let lastModifiedTime = tempEntry?.modified ?? "0";
    let lastSize = tempEntry?.size ?? 0;

    await openPath(localTempPath);

    if (activeWatches.has(localTempPath)) {
      clearInterval(activeWatches.get(localTempPath)!.intervalId);
    }

    let consecutiveMissing = 0;
    const intervalId = setInterval(async () => {
      if (!activeSession.value || activeSession.value.sessionId !== session.sessionId) {
        clearInterval(intervalId);
        activeWatches.delete(localTempPath);
        return;
      }

      try {
        const currentEntries = await listDirectory(localTempDir);
        const currentEntry = currentEntries.find((e) => e.name === entry.name);
        if (!currentEntry) {
          consecutiveMissing += 1;
          // Only clear if the file has been missing for 10 seconds (7 ticks)
          if (consecutiveMissing > 7) {
            clearInterval(intervalId);
            activeWatches.delete(localTempPath);
          }
          return;
        }
        consecutiveMissing = 0;

        const currentModified = currentEntry.modified ?? "0";
        const currentSize = currentEntry.size ?? 0;

        if (currentModified !== lastModifiedTime || currentSize !== lastSize) {
          lastModifiedTime = currentModified;
          lastSize = currentSize;

          if (uploadConfirmForPath.value === localTempPath || confirmOpen.value) return;
          uploadConfirmForPath.value = localTempPath;

          askConfirm({
            title: "File Changed",
            message: `"${entry.name}" was modified locally. Would you like to upload it back to the remote server?`,
            confirmLabel: "Upload",
            onConfirm: async () => {
              uploadConfirmForPath.value = null;
              await runBusy(async () => {
                await transferLocalToRemote(
                  localTempPath,
                  sftpUploadFn(session.sessionId),
                  parentPath(entry.path),
                  entry.name,
                  sftpTransferSettings.value.maxFileSizeBytes,
                );
                await loadRemoteDir(session.remotePath);
                pushAppToast(`Uploaded changes for ${entry.name}`, "success");
              });
            },
            onCancel: () => {
              uploadConfirmForPath.value = null;
              pushAppToast("Changes discarded (not uploaded)", "info");
            },
          });
        }
      } catch {
        // Ignore errors checking temp file
      }
    }, 1500);

    activeWatches.set(localTempPath, {
      intervalId,
      lastModifiedTime: typeof lastModifiedTime === "number" ? lastModifiedTime : parseInt(lastModifiedTime, 10) || 0,
      lastSize,
    });
  });
}

function onRemoteDownload(entry: FilePaneEntry) {
  if (entry.isDir) {
    void loadRemoteDir(entry.path);
    return;
  }
  void transferRemote(entry);
}

async function isLocalPathDir(path: string): Promise<boolean> {
  try {
    await listDirectory(path);
    return true;
  } catch {
    return false;
  }
}

async function transferRemote(entry: FilePaneEntry) {
  const session = activeSession.value;
  if (!session) return;
  await runBusy(async () => {
    if (entry.isDir) {
      const { failures } = await downloadRemoteTree(
        session.sessionId,
        entry.path,
        localPath.value,
        entry.name,
      );
      if (failures > 0) {
        pushAppToast(`Downloaded ${entry.name} with ${failures} failed file(s)`, "error");
      } else {
        pushAppToast(`Downloaded ${entry.name}`, "success");
      }
    } else {
      await transferRemoteToLocal(
        sftpDownloadFn(session.sessionId),
        entry.path,
        localPath.value,
        entry.name,
      );
      pushAppToast(`Downloaded ${entry.name}`, "success");
    }
    await loadLocalDir(localPath.value);
  });
}

async function transferLocalPaths(paths: string[]) {
  const session = activeSession.value;
  if (!session || !paths.length) return;
  let uploaded = 0;
  let failed = 0;
  await runBusy(async () => {
    for (const localFile of paths) {
      const name = localFile.split(/[/\\]/).pop() ?? "upload.bin";
      const isDir = await isLocalPathDir(localFile);
      try {
        if (isDir) {
          const { failures } = await uploadLocalTree(
            session.sessionId,
            localFile,
            session.remotePath,
            name,
          );
          if (failures > 0) failed += 1;
          else uploaded += 1;
        } else {
          await transferLocalToRemote(
            localFile,
            sftpUploadFn(session.sessionId),
            session.remotePath,
            name,
            sftpTransferSettings.value.maxFileSizeBytes,
          );
          uploaded += 1;
        }
      } catch {
        failed += 1;
      }
    }
    await loadRemoteDir(session.remotePath);
  });
  if (!uploaded && failed > 0) {
    pushAppToast("Failed to upload items", "error");
    return;
  }
  if (failed > 0) {
    pushAppToast(`Uploaded ${uploaded} item(s), ${failed} failed`, "error");
    return;
  }
  pushAppToast(`Uploaded ${uploaded} item(s)`, "success");
}

async function onDropRemoteOnLocal(entry: FilePaneEntry) {
  if (entry.side && entry.side !== "remote") return;
  await transferRemote(entry);
}

async function onDropLocalEntryOnRemote(entry: FilePaneEntry) {
  if (entry.side && entry.side !== "local") return;
  const session = activeSession.value;
  if (!session) return;
  await runBusy(async () => {
    if (entry.isDir) {
      const { failures } = await uploadLocalTree(
        session.sessionId,
        entry.path,
        session.remotePath,
        entry.name,
      );
      if (failures > 0) {
        pushAppToast(`Uploaded ${entry.name} with ${failures} failed file(s)`, "error");
      } else {
        pushAppToast(`Uploaded ${entry.name}`, "success");
      }
    } else {
      await transferLocalToRemote(
        entry.path,
        sftpUploadFn(session.sessionId),
        session.remotePath,
        entry.name,
        sftpTransferSettings.value.maxFileSizeBytes,
      );
      pushAppToast(`Uploaded ${entry.name}`, "success");
    }
    await loadRemoteDir(session.remotePath);
  });
}

function createLocalFolder() {
  openPrompt({
    title: "New local folder",
    label: "Folder name",
    confirmLabel: "Create",
    onSubmit: (name) => {
      void runBusy(async () => {
        await createDir(joinPath(localPath.value, name));
        await loadLocalDir(localPath.value);
      });
    },
  });
}

function createRemoteFolder() {
  const session = activeSession.value;
  if (!session) return;
  openPrompt({
    title: "New remote folder",
    label: "Folder name",
    confirmLabel: "Create",
    onSubmit: (name) => {
      void runBusy(async () => {
        const path = joinPath(session.remotePath === "." ? "" : session.remotePath, name);
        await sshSftpCreateDir(session.sessionId, path);
        await loadRemoteDir(session.remotePath);
      });
    },
  });
}

function deleteLocalEntry(entry: FilePaneEntry) {
  askConfirm({
    title: entry.isDir ? "Delete local folder?" : "Delete local file?",
    message: `Remove "${entry.name}" from your computer?`,
    confirmLabel: "Delete",
    dangerous: true,
    onConfirm: () => {
      void runBusy(async () => {
        await removePath(entry.path, entry.isDir);
        await loadLocalDir(localPath.value);
      });
    },
  });
}

function deleteRemoteEntry(entry: FilePaneEntry) {
  const session = activeSession.value;
  if (!session) return;
  askConfirm({
    title: entry.isDir ? "Delete remote folder?" : "Delete remote file?",
    message: `Remove "${entry.name}" from the server?`,
    confirmLabel: "Delete",
    dangerous: true,
    onConfirm: () => {
      void runBusy(async () => {
        await sshSftpRemovePath(session.sessionId, entry.path, entry.isDir);
        await loadRemoteDir(session.remotePath);
      });
    },
  });
}

async function pickRemoteUpload() {
  const selected = await open({ multiple: true });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  await transferLocalPaths(paths);
}

function addIdentity(identity: SshIdentity) {
  library.value.identities.push(identity);
  persist();
}

function removeIdentity(identityId: string) {
  library.value.identities = library.value.identities.filter((item) => item.id !== identityId);
  for (const endpoint of library.value.endpoints) {
    if (endpoint.auth.identityId === identityId) {
      endpoint.auth = { ...endpoint.auth, identityId: null };
    }
  }
  if (draft.value.auth.identityId === identityId) {
    draft.value = {
      ...draft.value,
      auth: { ...draft.value.auth, identityId: null },
    };
  }
  persist();
}

async function exportLibrary() {
  const path = await save({
    filters: [{ name: "JSON", extensions: ["json"] }],
    defaultPath: "oterm-ssh-hosts.json",
  });
  if (!path) return;
  const payload = JSON.stringify(exportSshLibrary(library.value), null, 2);
  await writeFile(path, new TextEncoder().encode(payload));
  pushAppToast("Hosts exported (no secrets)", "success");
}

async function importLibraryFile() {
  const path = await open({
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path || Array.isArray(path)) return;
  const data = await readFile(path);
  const text = new TextDecoder().decode(data);
  library.value = importSshLibrary(text);
  persist();
  pushAppToast("Hosts imported", "success");
}

function onKeydown(event: KeyboardEvent) {
  if (!activeSession.value) return;
  if (isActionKeybind(event, "refresh")) {
    event.preventDefault();
    void loadLocalDir(localPath.value);
    void loadRemoteDir(activeSession.value.remotePath);
    return;
  }
  if (isActionKeybind(event, "delete-item")) {
    const target = focusedPane.value === "local" ? selectedLocalEntry.value : selectedRemoteEntry.value;
    if (!target) return;
    event.preventDefault();
    if (focusedPane.value === "local") {
      deleteLocalEntry(target);
    } else {
      deleteRemoteEntry(target);
    }
  }
}

function selectLocalEntry(entry: FilePaneEntry) {
  selectedLocalEntry.value = entry;
  focusedPane.value = "local";
}

function selectRemoteEntry(entry: FilePaneEntry) {
  selectedRemoteEntry.value = entry;
  focusedPane.value = "remote";
}

watch(selectedEndpoint, async (endpoint) => {
  if (!endpoint || panel.value === "edit") return;
  if (activeSession.value?.endpointId !== endpoint.id) {
    panel.value = "browse";
  }
});

onMounted(async () => {
  library.value = loadSshSftpLibrary();
  const discovered = await discoverSshIdentities();
  const merged = mergeDiscoveredIdentities(library.value.identities, discovered);
  if (merged.length !== library.value.identities.length) {
    library.value.identities = merged;
    persist();
  }
  window.addEventListener("keydown", onKeydown);
  await ensureLocalHome(null);
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  void disconnectSftp();
});
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-[var(--oterm-bg)] text-[var(--oterm-text)]">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-[var(--oterm-border)] px-4 py-2"
    >
      <h2 class="text-sm font-medium">SSH / SFTP</h2>
      <span class="truncate text-xs text-[var(--oterm-muted)]">Saved hosts and dual-pane SFTP</span>
      <div class="flex-1" />
      <button
        type="button"
        class="rounded border border-[var(--oterm-border)] px-2 py-1 text-xs hover:bg-white/5"
        @click="emit('close')"
      >
        Close
      </button>
    </header>

    <p v-if="error" class="shrink-0 border-b border-[var(--oterm-danger)]/30 bg-[var(--oterm-danger)]/10 px-4 py-2 text-xs text-[var(--oterm-danger)]">
      {{ error }}
    </p>

    <div class="flex min-h-0 flex-1">
      <SshHostSidebar
        class="w-72 shrink-0"
        :library="library"
        :selected-group-id="selectedGroupId"
        :selected-tag-filters="selectedTagFilters"
        :selected-endpoint-id="selectedEndpointId"
        :search="search"
        @update:search="search = $event"
        @update:selected-group-id="selectedGroupId = $event"
        @update:selected-tag-filters="selectedTagFilters = $event"
        @select-endpoint="selectEndpoint"
        @add-group="addGroup"
        @add-host="startNewEndpoint"
        @export-library="exportLibrary"
        @import-library="importLibraryFile"
        @open-terminal-directly="emit('openSshTerminal', $event)"
      />

      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <template v-if="panel === 'edit'">
          <p
            v-if="activeSession"
            class="shrink-0 border-b border-[var(--oterm-border)] bg-[var(--oterm-panel)]/60 px-4 py-2 text-xs text-[var(--oterm-muted)]"
          >
            SFTP stays connected in the background while you edit this host.
          </p>
          <SshHostEditor
            v-model:draft="draft"
            v-model:password="draftPassword"
            class="min-h-0 flex-1"
            :library="library"
            :is-new="isEditingNew"
            :has-stored-password="draftHasStoredPassword"
            @add-identity="addIdentity"
            @remove-identity="removeIdentity"
          />
          <div
            class="no-drag shrink-0 border-t border-[var(--oterm-border)] bg-[var(--oterm-panel)] px-4 py-3"
          >
            <p v-if="error" class="mb-2 text-xs text-[var(--oterm-danger)]">{{ error }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-accent)]/40 px-3 py-1.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="savingDraft || testingConnection"
                @click="void saveEndpointDraft()"
              >
                {{ savingDraft ? "Saving…" : "Save host" }}
              </button>
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="savingDraft || testingConnection"
                @click="void testConnection()"
              >
                {{ testingConnection ? "Testing…" : "Test connection" }}
              </button>
              <button
                type="button"
                class="rounded-md border border-[var(--oterm-border)] px-3 py-1.5 text-xs hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="savingDraft || testingConnection"
                @click="cancelEdit"
              >
                Cancel
              </button>
            </div>
          </div>
        </template>
        <template v-else-if="selectedEndpoint">
          <SshHostDetailBar
            :endpoint="selectedEndpoint"
            :sftp-connected="sftpConnected"
            :busy="busy"
            @connect-sftp="onConnectSftp"
            @disconnect-sftp="disconnectSftp"
            @open-terminal="emit('openSshTerminal', selectedEndpoint)"
            @edit="editSelectedEndpoint"
            @duplicate="duplicateSelectedEndpoint"
            @remove="deleteEndpoint(selectedEndpoint)"
          />

          <SftpDualPane
            v-if="activeSession && activeSession.endpointId === selectedEndpoint.id"
            :local-path="localPath"
            :remote-path="activeSession.remotePath"
            :local-entries="localEntries"
            :remote-entries="toRemoteEntries(activeSession.remoteEntries)"
            :busy="busy"
            :selected-local-path="selectedLocalEntry?.path ?? null"
            :selected-remote-path="selectedRemoteEntry?.path ?? null"
            @local-navigate="onLocalNavigate"
            @remote-navigate="onRemoteNavigate"
            @local-up="onLocalUp"
            @remote-up="onRemoteUp"
            @local-refresh="loadLocalDir(localPath)"
            @remote-refresh="loadRemoteDir(activeSession.remotePath)"
            @local-create-folder="createLocalFolder"
            @remote-create-folder="createRemoteFolder"
            @remote-upload-pick="pickRemoteUpload"
            @local-delete="deleteLocalEntry"
            @remote-delete="deleteRemoteEntry"
            @local-open="onLocalOpen"
            @remote-open="onRemoteOpen"
            @remote-download="onRemoteDownload"
            @drop-local-paths-on-remote="transferLocalPaths"
            @drop-remote-entry-on-local="onDropRemoteOnLocal"
            @drop-local-entry-on-remote="onDropLocalEntryOnRemote"
            @select-local="selectLocalEntry"
            @select-remote="selectRemoteEntry"
          />

          <div
            v-else
            class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-[var(--oterm-muted)]"
          >
            <p>Connect SFTP to browse local and remote files side by side.</p>
            <button
              type="button"
              class="rounded border border-[var(--oterm-accent)]/40 px-3 py-1.5 text-xs text-[var(--oterm-accent)] hover:bg-[var(--oterm-accent)]/10"
              :disabled="busy"
              @click="onConnectSftp"
            >
              Connect SFTP
            </button>
          </div>
        </template>
        <div
          v-else
          class="flex flex-1 items-center justify-center p-8 text-sm text-[var(--oterm-muted)]"
        >
          Select or create a host to get started.
        </div>
      </div>
    </div>

    <SshSecretPrompt
      v-if="secretOpen"
      v-model="secretValue"
      v-model:save-password="secretSave"
      :title="secretTitle"
      :label="secretLabel"
      :show-save-password="true"
      :save-checkbox-label="secretSaveLabel"
      @submit="submitSecret"
      @cancel="cancelSecret"
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

    <PromptDialog
      :open="promptOpen"
      :title="pendingPrompt?.title ?? ''"
      :label="pendingPrompt?.label ?? ''"
      :placeholder="pendingPrompt?.placeholder"
      :confirm-label="pendingPrompt?.confirmLabel"
      :model-value="promptValue"
      @update:model-value="promptValue = $event"
      @confirm="resolvePrompt(true)"
      @cancel="resolvePrompt(false)"
    />
  </div>
</template>
