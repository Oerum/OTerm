import { computed, type Ref } from "vue";
import { ENTRY_COLORS } from "../lib/sidebarEntries";
import type { TerminalEntryColor } from "../types/terminal";


export function useTabColor(
  colorRef: Ref<string>,
  emit: (event: "colorChange", value: TerminalEntryColor) => void,
) {
  const isCustomColor = computed(() => {
    return (
      colorRef.value !== "none" &&
      !ENTRY_COLORS.some((c: { id: string }) => c.id === colorRef.value)
    );
  });

  const customColorHex = computed(() => {
    if (
      isCustomColor.value &&
      colorRef.value.startsWith("#") &&
      colorRef.value.length === 7
    ) {
      return colorRef.value;
    }
    return "#00e5ba";
  });

  function onColorPickerInput(event: Event) {
    const value = (event.target as HTMLInputElement).value as TerminalEntryColor;
    emit("colorChange", value);
  }

  function onCustomColorTextChange(event: Event) {
    const value = (event.target as HTMLInputElement).value.trim();
    if (!value) {
      emit("colorChange", "none" as TerminalEntryColor);
    } else {
      emit("colorChange", value as TerminalEntryColor);
    }
  }

  return {
    ENTRY_COLORS,
    isCustomColor,
    customColorHex,
    onColorPickerInput,
    onCustomColorTextChange,
  };
}
