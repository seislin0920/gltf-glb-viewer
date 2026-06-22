<script setup lang="ts">
import { ref } from "vue";
import { useScrubInput } from "../composables/useScrubInput";
import type {
  PivotAxisMode,
  RotorTargetConfig,
  Vector3Values,
} from "../types/glb-viewer";

const { onScrubPointerDown } = useScrubInput();

const props = defineProps<{
  targets: Array<{ nodeId: string; nodeName: string; config: RotorTargetConfig }>;
  rotorAnimationApplied: boolean;
  canApplyRotorAnimation: boolean;
  applying: boolean;
  removing: boolean;
}>();

const animationName = defineModel<string>("animationName", { required: true });

const emit = defineEmits<{
  "update-config": [nodeId: string, patch: Partial<RotorTargetConfig>];
  detect: [nodeId: string, kind: "pivot" | "axis" | "both"];
  apply: [];
  remove: [];
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

function setMode(
  nodeId: string,
  config: RotorTargetConfig,
  field: "pivotMode" | "axisMode",
  mode: PivotAxisMode,
) {
  emit("update-config", nodeId, { ...config, [field]: mode, nodeId });
}

function setVectorAxis(
  nodeId: string,
  config: RotorTargetConfig,
  field: "pivot" | "axis",
  axis: keyof Vector3Values,
  value: number,
) {
  emit("update-config", nodeId, {
    ...config,
    nodeId,
    [field]: { ...config[field], [axis]: value },
  });
}

function updateVectorAxis(
  nodeId: string,
  config: RotorTargetConfig,
  field: "pivot" | "axis",
  axis: keyof Vector3Values,
  event: Event,
) {
  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);
  if (Number.isNaN(value)) {
    return;
  }
  setVectorAxis(nodeId, config, field, axis, value);
}

function updateNumber(
  nodeId: string,
  config: RotorTargetConfig,
  field: "rpm" | "duration" | "keyframes",
  event: Event,
) {
  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);
  if (Number.isNaN(value)) {
    return;
  }
  emit("update-config", nodeId, { ...config, nodeId, [field]: value });
}

function setNumber(
  nodeId: string,
  config: RotorTargetConfig,
  field: "rpm" | "duration" | "keyframes",
  value: number,
) {
  emit("update-config", nodeId, { ...config, nodeId, [field]: value });
}
</script>

<template>
  <section
    v-if="targets.length > 0 || rotorAnimationApplied"
    class="panel rotor-panel"
  >
    <div class="panel-heading">
      <span>旋翼動畫</span>
      <span v-if="rotorAnimationApplied" class="target-count">已套用</span>
      <span v-else-if="targets.length > 0" class="target-count">
        {{ targets.length }} 個目標
      </span>
    </div>

    <div v-if="rotorAnimationApplied" class="applied-state">
      <p class="muted">旋翼動畫已套用，可播放預覽或下載 GLB。</p>
      <button
        class="remove-button"
        type="button"
        :disabled="removing || applying"
        @click="emit('remove')"
      >
        {{ removing ? "移除中…" : "移除套用" }}
      </button>
    </div>

    <template v-else-if="canApplyRotorAnimation && targets.length > 0">
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
            <div class="field-group">
              <span class="field-label">Pivot</span>
              <div class="mode-row">
                <label>
                  <input
                    type="radio"
                    :name="`pivot-mode-${target.nodeId}`"
                    :checked="target.config.pivotMode === 'auto'"
                    @change="setMode(target.nodeId, target.config, 'pivotMode', 'auto')"
                  />
                  auto
                </label>
                <label>
                  <input
                    type="radio"
                    :name="`pivot-mode-${target.nodeId}`"
                    :checked="target.config.pivotMode === 'manual'"
                    @change="setMode(target.nodeId, target.config, 'pivotMode', 'manual')"
                  />
                  manual
                </label>
                <button
                  class="compact-button"
                  type="button"
                  @click="emit('detect', target.nodeId, 'pivot')"
                >
                  偵測
                </button>
              </div>
              <div
                v-if="target.config.pivotMode === 'manual'"
                class="transform-grid"
              >
                <input
                  class="position-input"
                  type="number"
                  step="0.0001"
                  :value="target.config.pivot.x"
                  aria-label="Pivot X"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.01,
                      getValue: () => target.config.pivot.x,
                      onUpdate: (value) =>
                        setVectorAxis(target.nodeId, target.config, 'pivot', 'x', value),
                    })
                  "
                  @change="updateVectorAxis(target.nodeId, target.config, 'pivot', 'x', $event)"
                />
                <input
                  class="position-input"
                  type="number"
                  step="0.0001"
                  :value="target.config.pivot.y"
                  aria-label="Pivot Y"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.01,
                      getValue: () => target.config.pivot.y,
                      onUpdate: (value) =>
                        setVectorAxis(target.nodeId, target.config, 'pivot', 'y', value),
                    })
                  "
                  @change="updateVectorAxis(target.nodeId, target.config, 'pivot', 'y', $event)"
                />
                <input
                  class="position-input"
                  type="number"
                  step="0.0001"
                  :value="target.config.pivot.z"
                  aria-label="Pivot Z"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.01,
                      getValue: () => target.config.pivot.z,
                      onUpdate: (value) =>
                        setVectorAxis(target.nodeId, target.config, 'pivot', 'z', value),
                    })
                  "
                  @change="updateVectorAxis(target.nodeId, target.config, 'pivot', 'z', $event)"
                />
              </div>
              <p v-else class="preview-values muted">
                {{ target.config.pivot.x.toFixed(4) }},
                {{ target.config.pivot.y.toFixed(4) }},
                {{ target.config.pivot.z.toFixed(4) }}
              </p>
            </div>

            <div class="field-group">
              <span class="field-label">Axis</span>
              <div class="mode-row">
                <label>
                  <input
                    type="radio"
                    :name="`axis-mode-${target.nodeId}`"
                    :checked="target.config.axisMode === 'auto'"
                    @change="setMode(target.nodeId, target.config, 'axisMode', 'auto')"
                  />
                  auto
                </label>
                <label>
                  <input
                    type="radio"
                    :name="`axis-mode-${target.nodeId}`"
                    :checked="target.config.axisMode === 'manual'"
                    @change="setMode(target.nodeId, target.config, 'axisMode', 'manual')"
                  />
                  manual
                </label>
                <button
                  class="compact-button"
                  type="button"
                  @click="emit('detect', target.nodeId, 'axis')"
                >
                  偵測
                </button>
              </div>
              <div
                v-if="target.config.axisMode === 'manual'"
                class="transform-grid"
              >
                <input
                  class="position-input"
                  type="number"
                  step="0.0001"
                  :value="target.config.axis.x"
                  aria-label="Axis X"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.01,
                      getValue: () => target.config.axis.x,
                      onUpdate: (value) =>
                        setVectorAxis(target.nodeId, target.config, 'axis', 'x', value),
                    })
                  "
                  @change="updateVectorAxis(target.nodeId, target.config, 'axis', 'x', $event)"
                />
                <input
                  class="position-input"
                  type="number"
                  step="0.0001"
                  :value="target.config.axis.y"
                  aria-label="Axis Y"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.01,
                      getValue: () => target.config.axis.y,
                      onUpdate: (value) =>
                        setVectorAxis(target.nodeId, target.config, 'axis', 'y', value),
                    })
                  "
                  @change="updateVectorAxis(target.nodeId, target.config, 'axis', 'y', $event)"
                />
                <input
                  class="position-input"
                  type="number"
                  step="0.0001"
                  :value="target.config.axis.z"
                  aria-label="Axis Z"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.01,
                      getValue: () => target.config.axis.z,
                      onUpdate: (value) =>
                        setVectorAxis(target.nodeId, target.config, 'axis', 'z', value),
                    })
                  "
                  @change="updateVectorAxis(target.nodeId, target.config, 'axis', 'z', $event)"
                />
              </div>
              <p v-else class="preview-values muted">
                {{ target.config.axis.x.toFixed(4) }},
                {{ target.config.axis.y.toFixed(4) }},
                {{ target.config.axis.z.toFixed(4) }}
              </p>
            </div>

            <div class="field-row">
              <label class="checkbox-row">
                <input
                  type="checkbox"
                  :checked="target.config.reverse"
                  @change="
                    emit('update-config', target.nodeId, {
                      ...target.config,
                      nodeId: target.nodeId,
                      reverse: ($event.target as HTMLInputElement).checked,
                    })
                  "
                />
                reverse
              </label>
            </div>

            <div class="field-row">
              <label class="inline-field">
                <span>RPM</span>
                <input
                  class="position-input"
                  type="number"
                  step="100"
                  min="1"
                  :value="target.config.rpm"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 100,
                      getValue: () => target.config.rpm,
                      onUpdate: (value) =>
                        setNumber(target.nodeId, target.config, 'rpm', value),
                    })
                  "
                  @change="updateNumber(target.nodeId, target.config, 'rpm', $event)"
                />
              </label>
              <label class="inline-field">
                <span>duration (s)</span>
                <input
                  class="position-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  :value="target.config.duration"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 0.05,
                      getValue: () => target.config.duration,
                      onUpdate: (value) =>
                        setNumber(target.nodeId, target.config, 'duration', value),
                    })
                  "
                  @change="updateNumber(target.nodeId, target.config, 'duration', $event)"
                />
              </label>
              <label class="inline-field">
                <span>keyframes</span>
                <input
                  class="position-input"
                  type="number"
                  step="1"
                  min="2"
                  :value="target.config.keyframes"
                  @pointerdown="
                    onScrubPointerDown($event, {
                      step: 1,
                      getValue: () => target.config.keyframes,
                      onUpdate: (value) =>
                        setNumber(target.nodeId, target.config, 'keyframes', value),
                    })
                  "
                  @change="updateNumber(target.nodeId, target.config, 'keyframes', $event)"
                />
              </label>
            </div>
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

.applied-state {
  @apply flex flex-col gap-2.5 px-2.5 py-2.5;
}

.remove-button {
  @apply min-h-[38px] w-full cursor-pointer rounded-button border border-line-strong bg-surface-2 px-3 text-[13px] font-bold text-warn transition-opacity duration-150;
}

.remove-button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.remove-button:not(:disabled):hover {
  border-color: rgba(243, 179, 91, 0.65);
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

.field-group {
  @apply flex flex-col gap-1.5;
}

.field-label {
  @apply text-xs font-bold uppercase text-text-muted;
}

.mode-row {
  @apply flex flex-wrap items-center gap-3 text-sm text-text-soft;
}

.mode-row label {
  @apply inline-flex items-center gap-1.5;
}

.compact-button {
  @apply min-h-[26px] cursor-pointer rounded-small border border-line-strong bg-surface px-2 text-xs font-bold text-text;
}

.preview-values {
  @apply m-0 text-xs;
}

.field-row {
  @apply flex flex-wrap gap-2;
}

.checkbox-row {
  @apply inline-flex items-center gap-2 text-sm text-text-soft;
}

.inline-field {
  @apply flex min-w-[88px] flex-1 flex-col gap-1 text-xs text-text-muted;
}

.inline-field span {
  @apply font-bold uppercase;
}

.transform-grid {
  @apply grid grid-cols-3 gap-1.5;
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

.muted {
  @apply text-text-muted;
}
</style>
