import { ref } from "vue";

export function useTerminalHistory() {
  const entries = ref<string[]>([]);
  const query = ref("");
  const open = ref(false);

  function addEntry(line: string) {
    const trimmed = line.trim();
    if (!trimmed || entries.value[entries.value.length - 1] === trimmed) return;
    entries.value.push(trimmed);
    if (entries.value.length > 500) {
      entries.value.shift();
    }
  }

  function filteredEntries() {
    const q = query.value.trim().toLowerCase();
    if (!q) return [...entries.value].reverse();
    return entries.value.filter((entry) => entry.toLowerCase().includes(q)).reverse();
  }

  function openSearch() {
    query.value = "";
    open.value = true;
  }

  function closeSearch() {
    open.value = false;
    query.value = "";
  }

  return {
    entries,
    query,
    open,
    addEntry,
    filteredEntries,
    openSearch,
    closeSearch,
  };
}
