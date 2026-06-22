<script setup lang="ts">
import { ref } from "vue";
import RotorTargetConfigFields from "./RotorTargetConfigFields.vue";
import type {
  AnimationLoopMode,
  RotorTargetConfig,
  SelectedAnimationDetail,
} from "../types/glb-viewer";

const props = defineProps<{
  detail: SelectedAnimationDetail;
  applyingRotorChanges: boolean;
  removing: boolean;
}>();

const emit = defineEmits<{
  "update-settings": [
    patch: {
      name?: string;
      timeScale?: number;
      loopMode?: AnimationLoopMode;
    },
  ];
  "update-rotor-target": [pivotUuid: string, patch: Partial<RotorTargetConfig>];
  "detect-rotor-target": [pivotUuid: string, kind: "pivot" | "axis" | "both"];
  "apply-rotor-changes": [];
  remove: [];
}>();

const expandedTargetIds = ref<Set<string>>(new Set());

function toggleTarget(pivotUuid: string) {
  const next = new Set(expandedTargetIds.value);
  if (next.has(pivotUuid)) {
    next.delete(pivotUuid);
  } else {
    next.add(pivotUuid);
  }
  expandedTargetIds.value = next;
}

function isTargetExpanded(pivotUuid: string) {
  return (
    expandedTargetIds.value.size === 0 || expandedTargetIds.value.has(pivotUuid)
  );
}

function updateName(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit("update-settings", { name: value });
}

function updateTimeScale(event: Event) {
  const value = Number.parseFloat((event.target as HTMLInputElement).value);
  if (Number.isNaN(value)) {
    return;
  }
  emit("update-settings", { timeScale: value });
}

function updateLoopMode(event: Event) {
  emit("update-settings", {
    loopMode: (event.target as HTMLSelectElement).value as AnimationLoopMode,
  });
}
</script>

<template>
  <section class="animation-detail panel-nested">
    <div class="panel-heading">
      <span>動畫詳情</span>
      <small>{{ detail.source === "rotor" ? "旋翼" : "匯入" }}</small>
    </div>

    <div class="detail-body">
      <label class="inline-field">
        <span>名稱</span>
        <input
          class="position-input"
          type="text"
          :value="detail.name"
          @change="updateName"
        />
      </label>

      <label class="inline-field">
        <span>播放速度</span>
        <input
          class="position-input"
          type="number"
          min="0.1"
          max="10"
          step="0.1"
          :value="detail.timeScale"
          @change="updateTimeScale"
        />
      </label>

      <label class="inline-field">
        <span>循環模式</span>
        <select class="position-input" :value="detail.loopMode" @change="updateLoopMode">
          <option value="repeat">重複</option>
          <option value="once">單次</option>
          <option value="pingpong">往返</option>
        </select>
      </label>

      <template v-if="detail.source === 'rotor'">
        <div class="target-list">
          <article
            v-for="target in detail.rotorTargets"
            :key="target.pivotUuid"
            class="target-card"
          >
            <button
              class="target-card__header"
              type="button"
              @click="toggleTarget(target.pivotUuid)"
            >
              <span>{{ target.nodeName }}</span>
              <small>{{ isTargetExpanded(target.pivotUuid) ? "收合" : "展開" }}</small>
            </button>

            <div v-show="isTargetExpanded(target.pivotUuid)" class="target-card__body">
              <RotorTargetConfigFields
                :node-id="target.nodeId"
                :config="target.config"
                :id-prefix="`${detail.index}-${target.pivotUuid}`"
                @update-config="
                  (patch) => emit('update-rotor-target', target.pivotUuid, patch)
                "
                @detect="(kind) => emit('detect-rotor-target', target.pivotUuid, kind)"
              />
            </div>
          </article>
        </div>

        <button
          class="apply-button"
          type="button"
          :disabled="applyingRotorChanges || removing"
          @click="emit('apply-rotor-changes')"
        >
          {{ applyingRotorChanges ? "套用中…" : "套用變更" }}
        </button>
      </template>

      <button
        class="remove-button"
        type="button"
        :disabled="removing || applyingRotorChanges"
        @click="emit('remove')"
      >
        {{ removing ? "移除中…" : "移除動畫" }}
      </button>
    </div>
  </section>
</template>

<style scoped>
@reference "../style.css";

.animation-detail {
  @apply mx-3 mb-3 overflow-hidden rounded-button border border-line bg-surface-2;
}

.panel-heading {
  @apply flex min-h-[38px] items-center justify-between gap-2 border-b border-line px-2.5 py-2 text-xs font-extrabold uppercase text-text;
}

.panel-heading small {
  @apply font-bold normal-case text-text-muted;
}

.detail-body {
  @apply flex flex-col gap-2.5 p-2.5;
}

.inline-field {
  @apply flex flex-col gap-1 text-xs text-text-muted;
}

.inline-field span {
  @apply font-bold uppercase;
}

.position-input {
  @apply h-8 w-full rounded-small border border-line bg-surface px-2 text-sm text-text;
}

.target-list {
  @apply flex flex-col gap-2;
}

.target-card {
  @apply overflow-hidden rounded-button border border-line bg-surface;
}

.target-card__header {
  @apply flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-transparent px-2.5 py-2 text-left text-sm font-bold text-text;
}

.target-card__header small {
  @apply text-xs font-normal text-text-muted;
}

.target-card__body {
  @apply border-t border-line px-2.5 py-2.5;
}

.apply-button {
  @apply min-h-[38px] w-full cursor-pointer rounded-button border border-line-strong bg-surface px-3 text-[13px] font-bold text-text transition-opacity duration-150;
}

.apply-button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.apply-button:not(:disabled):hover {
  border-color: rgba(76, 201, 166, 0.65);
}

.remove-button {
  @apply min-h-[38px] w-full cursor-pointer rounded-button border border-line-strong bg-surface px-3 text-[13px] font-bold text-warn transition-opacity duration-150;
}

.remove-button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.remove-button:not(:disabled):hover {
  border-color: rgba(243, 179, 91, 0.65);
}
</style>
