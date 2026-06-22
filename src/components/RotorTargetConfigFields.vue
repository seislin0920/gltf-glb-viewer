<script setup lang="ts">
import { useScrubInput } from "../composables/useScrubInput";
import type {
  PivotAxisMode,
  RotorTargetConfig,
  Vector3Values,
} from "../types/glb-viewer";

const { onScrubPointerDown } = useScrubInput();

const props = defineProps<{
  nodeId: string;
  config: RotorTargetConfig;
  idPrefix?: string;
  showDetect?: boolean;
}>();

const emit = defineEmits<{
  "update-config": [patch: Partial<RotorTargetConfig>];
  detect: [kind: "pivot" | "axis" | "both"];
}>();

const fieldPrefix = props.idPrefix ?? props.nodeId;

function setMode(field: "pivotMode" | "axisMode", mode: PivotAxisMode) {
  emit("update-config", { ...props.config, [field]: mode, nodeId: props.nodeId });
}

function setVectorAxis(
  field: "pivot" | "axis",
  axis: keyof Vector3Values,
  value: number,
) {
  emit("update-config", {
    ...props.config,
    nodeId: props.nodeId,
    [field]: { ...props.config[field], [axis]: value },
  });
}

function updateVectorAxis(
  field: "pivot" | "axis",
  axis: keyof Vector3Values,
  event: Event,
) {
  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);
  if (Number.isNaN(value)) {
    return;
  }
  setVectorAxis(field, axis, value);
}

function updateNumber(
  field: "rpm" | "duration" | "keyframes",
  event: Event,
) {
  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);
  if (Number.isNaN(value)) {
    return;
  }
  emit("update-config", { ...props.config, nodeId: props.nodeId, [field]: value });
}

function setNumber(field: "rpm" | "duration" | "keyframes", value: number) {
  emit("update-config", { ...props.config, nodeId: props.nodeId, [field]: value });
}
</script>

<template>
  <div class="rotor-target-fields">
    <div class="field-group">
      <span class="field-label">Pivot</span>
      <div class="mode-row">
        <label>
          <input
            type="radio"
            :name="`pivot-mode-${fieldPrefix}`"
            :checked="config.pivotMode === 'auto'"
            @change="setMode('pivotMode', 'auto')"
          />
          auto
        </label>
        <label>
          <input
            type="radio"
            :name="`pivot-mode-${fieldPrefix}`"
            :checked="config.pivotMode === 'manual'"
            @change="setMode('pivotMode', 'manual')"
          />
          manual
        </label>
        <button
          v-if="showDetect !== false"
          class="compact-button"
          type="button"
          @click="emit('detect', 'pivot')"
        >
          偵測
        </button>
      </div>
      <div v-if="config.pivotMode === 'manual'" class="transform-grid">
        <input
          class="position-input"
          type="number"
          step="0.0001"
          :value="config.pivot.x"
          aria-label="Pivot X"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.01,
              getValue: () => config.pivot.x,
              onUpdate: (value) => setVectorAxis('pivot', 'x', value),
            })
          "
          @change="updateVectorAxis('pivot', 'x', $event)"
        />
        <input
          class="position-input"
          type="number"
          step="0.0001"
          :value="config.pivot.y"
          aria-label="Pivot Y"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.01,
              getValue: () => config.pivot.y,
              onUpdate: (value) => setVectorAxis('pivot', 'y', value),
            })
          "
          @change="updateVectorAxis('pivot', 'y', $event)"
        />
        <input
          class="position-input"
          type="number"
          step="0.0001"
          :value="config.pivot.z"
          aria-label="Pivot Z"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.01,
              getValue: () => config.pivot.z,
              onUpdate: (value) => setVectorAxis('pivot', 'z', value),
            })
          "
          @change="updateVectorAxis('pivot', 'z', $event)"
        />
      </div>
      <p v-else class="preview-values muted">
        {{ config.pivot.x.toFixed(4) }}, {{ config.pivot.y.toFixed(4) }},
        {{ config.pivot.z.toFixed(4) }}
      </p>
    </div>

    <div class="field-group">
      <span class="field-label">Axis</span>
      <div class="mode-row">
        <label>
          <input
            type="radio"
            :name="`axis-mode-${fieldPrefix}`"
            :checked="config.axisMode === 'auto'"
            @change="setMode('axisMode', 'auto')"
          />
          auto
        </label>
        <label>
          <input
            type="radio"
            :name="`axis-mode-${fieldPrefix}`"
            :checked="config.axisMode === 'manual'"
            @change="setMode('axisMode', 'manual')"
          />
          manual
        </label>
        <button
          v-if="showDetect !== false"
          class="compact-button"
          type="button"
          @click="emit('detect', 'axis')"
        >
          偵測
        </button>
      </div>
      <div v-if="config.axisMode === 'manual'" class="transform-grid">
        <input
          class="position-input"
          type="number"
          step="0.0001"
          :value="config.axis.x"
          aria-label="Axis X"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.01,
              getValue: () => config.axis.x,
              onUpdate: (value) => setVectorAxis('axis', 'x', value),
            })
          "
          @change="updateVectorAxis('axis', 'x', $event)"
        />
        <input
          class="position-input"
          type="number"
          step="0.0001"
          :value="config.axis.y"
          aria-label="Axis Y"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.01,
              getValue: () => config.axis.y,
              onUpdate: (value) => setVectorAxis('axis', 'y', value),
            })
          "
          @change="updateVectorAxis('axis', 'y', $event)"
        />
        <input
          class="position-input"
          type="number"
          step="0.0001"
          :value="config.axis.z"
          aria-label="Axis Z"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.01,
              getValue: () => config.axis.z,
              onUpdate: (value) => setVectorAxis('axis', 'z', value),
            })
          "
          @change="updateVectorAxis('axis', 'z', $event)"
        />
      </div>
      <p v-else class="preview-values muted">
        {{ config.axis.x.toFixed(4) }}, {{ config.axis.y.toFixed(4) }},
        {{ config.axis.z.toFixed(4) }}
      </p>
    </div>

    <div class="field-row">
      <label class="checkbox-row">
        <input
          type="checkbox"
          :checked="config.reverse"
          @change="
            emit('update-config', {
              ...config,
              nodeId,
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
          :value="config.rpm"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 100,
              getValue: () => config.rpm,
              onUpdate: (value) => setNumber('rpm', value),
            })
          "
          @change="updateNumber('rpm', $event)"
        />
      </label>
      <label class="inline-field">
        <span>duration (s)</span>
        <input
          class="position-input"
          type="number"
          step="0.01"
          min="0.01"
          :value="config.duration"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 0.05,
              getValue: () => config.duration,
              onUpdate: (value) => setNumber('duration', value),
            })
          "
          @change="updateNumber('duration', $event)"
        />
      </label>
      <label class="inline-field">
        <span>keyframes</span>
        <input
          class="position-input"
          type="number"
          step="1"
          min="2"
          :value="config.keyframes"
          @pointerdown="
            onScrubPointerDown($event, {
              step: 1,
              getValue: () => config.keyframes,
              onUpdate: (value) => setNumber('keyframes', value),
            })
          "
          @change="updateNumber('keyframes', $event)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
@reference "../style.css";

.rotor-target-fields {
  @apply flex flex-col gap-2.5;
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

.muted {
  @apply text-text-muted;
}
</style>
