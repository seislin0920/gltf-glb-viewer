<script setup lang="ts">
import { ref } from "vue";
import RotorTargetConfigFields from "./RotorTargetConfigFields.vue";
import type { RotorTargetConfig } from "../types/glb-viewer";

const props = defineProps<{
  targets: Array<{ nodeId: string; nodeName: string; config: RotorTargetConfig }>;
  canApplyRotorAnimation: boolean;
  applying: boolean;
}>();

const animationName = defineModel<string>("animationName", { required: true });

const emit = defineEmits<{
  "update-config": [nodeId: string, patch: Partial<RotorTargetConfig>];
  detect: [nodeId: string, kind: "pivot" | "axis" | "both"];
  apply: [];
}>();

const expandedNodeIds = ref<Set<string>>(new Set());

function toggleExpanded(nodeId: string) {
  const next = new Set(expandedNodeIds.value);
  if (next.has(nodeId)) {
    next.delete(nodeId);
  } else {
    next.add(nodeId);
  }
  expandedNodeIds.value = next;
}

function isExpanded(nodeId: string) {
  return expandedNodeIds.value.size === 0 || expandedNodeIds.value.has(nodeId);
}
</script>

<template>
  <section v-if="targets.length > 0" class="panel rotor-panel">
    <div class="panel-heading">
      <span>旋翼動畫</span>
      <span class="target-count">{{ targets.length }} 個目標</span>
    </div>

    <template v-if="canApplyRotorAnimation && targets.length > 0">
      <div class="target-list">
        <article
          v-for="target in targets"
          :key="target.nodeId"
          class="target-card"
        >
          <button
            class="target-card__header"
            type="button"
            @click="toggleExpanded(target.nodeId)"
          >
            <span>{{ target.nodeName }}</span>
            <small>{{ isExpanded(target.nodeId) ? "收合" : "展開" }}</small>
          </button>

          <div v-show="isExpanded(target.nodeId)" class="target-card__body">
            <RotorTargetConfigFields
              :node-id="target.nodeId"
              :config="target.config"
              @update-config="
                (patch) => emit('update-config', target.nodeId, patch)
              "
              @detect="(kind) => emit('detect', target.nodeId, kind)"
            />
          </div>
        </article>
      </div>

      <div class="apply-row">
        <label class="inline-field animation-name">
          <span>動畫名稱</span>
          <input v-model="animationName" class="position-input" type="text" />
        </label>
        <button
          class="export-button"
          type="button"
          :disabled="applying"
          @click="emit('apply')"
        >
          {{ applying ? "套用中…" : "套用旋翼動畫" }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
@reference "../style.css";

.rotor-panel {
  @apply min-w-0;
}

.panel-heading {
  @apply flex min-h-[42px] items-center justify-between gap-2.5 border-b border-line px-3 py-2.5 text-[13px] font-extrabold uppercase text-text;
}

.target-count {
  @apply text-xs font-bold normal-case text-text-muted;
}

.target-list {
  @apply flex flex-col gap-2 p-2.5;
}

.target-card {
  @apply overflow-hidden rounded-button border border-line bg-surface-2;
}

.target-card__header {
  @apply flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-2.5 py-2 text-left text-sm font-bold text-text;
}

.target-card__header small {
  @apply text-xs font-normal text-text-muted;
}

.target-card__body {
  @apply flex flex-col gap-2.5 border-t border-line px-2.5 py-2.5;
}

.inline-field {
  @apply flex min-w-[88px] flex-1 flex-col gap-1 text-xs text-text-muted;
}

.inline-field span {
  @apply font-bold uppercase;
}

.position-input {
  @apply h-8 w-full rounded-small border border-line bg-surface px-2 text-sm text-text;
}

.apply-row {
  @apply flex flex-col gap-2 border-t border-line px-2.5 py-2.5;
}

.animation-name {
  @apply min-w-0 flex-none;
}

.export-button {
  @apply min-h-[38px] w-full cursor-pointer rounded-button border border-line-strong bg-surface-2 px-3 text-[13px] font-bold text-text transition-opacity duration-150;
}

.export-button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.export-button:not(:disabled):hover {
  border-color: rgba(76, 201, 166, 0.65);
}
</style>
