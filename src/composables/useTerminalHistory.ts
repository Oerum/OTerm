import { ref } from "vue";

export function useTerminalHistory() {
  const entries = ref<string[]>([]);

  function addEntry(line: string) {
    const trimmed = line.trim();
    if (!trimmed || entries.value[entries.value.length - 1] === trimmed) return;
    entries.value.push(trimmed);
    if (entries.value.length > 500) {
      entries.value.shift();
    }
  }

  return {
    entries,
    addEntry,
  };
}
