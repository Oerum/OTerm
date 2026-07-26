<script setup lang="ts">
import type {
  TerminalEntryColor,
  TerminalMenuActionId,
  TerminalSidebarEntry as TerminalSidebarEntryModel,
  TerminalTabGroup,
} from "../types/terminal";
import TerminalSidebarEntry from "./TerminalSidebarEntry.vue";

defineProps<{
  entry: TerminalSidebarEntryModel;
  groups: TerminalTabGroup[];
  menuOpen: boolean;
  renaming: boolean;
  dragging: boolean;
  dropTarget: boolean;
  dropTargetAfter: boolean;
  dragStyle: any;
  isDraggingAny: boolean;
}>();

const emit = defineEmits<{
  select: [tabId: string, paneId: string];
  menuToggle: [entryId: string, open: boolean];
  action: [entryId: string, actionId: TerminalMenuActionId];
  moveToGroup: [entryId: string, groupId: string | null];
  newGroupAndMove: [entryId: string];
  colorChange: [entryId: string, color: TerminalEntryColor];
  renameCommit: [tabId: string, title: string];
  renameCancel: [];
  dragStart: [tabId: string, tabIndex: number, event: PointerEvent, handleEl: HTMLElement];
}>();
</script>

<template>
  <TerminalSidebarEntry
    :entry="entry"
    :groups="groups"
    :menu-open="menuOpen"
    :renaming="renaming"
    :dragging="dragging"
    :drop-target="dropTarget"
    :drop-target-after="dropTargetAfter"
    :drag-style="dragStyle"
    :is-dragging-any="isDraggingAny"
    @select="(tabId, paneId) => emit('select', tabId, paneId)"
    @menu-toggle="(entryId, open) => emit('menuToggle', entryId, open)"
    @action="(actionId) => emit('action', entry.entryId, actionId)"
    @move-to-group="(groupId) => emit('moveToGroup', entry.entryId, groupId)"
    @new-group-and-move="emit('newGroupAndMove', entry.entryId)"
    @color-change="(color) => emit('colorChange', entry.entryId, color)"
    @rename-commit="(tabId, title) => emit('renameCommit', tabId, title)"
    @rename-cancel="emit('renameCancel')"
    @drag-start="(tabId, tabIndex, event, handleEl) => emit('dragStart', tabId, tabIndex, event, handleEl)"
  />
</template>
