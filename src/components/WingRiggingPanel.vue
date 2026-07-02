<script setup lang="ts">
import { computed } from "vue";
import type {
  BirdModelAnalysis,
  WingAnimationOptions,
  WingLandmarkStep,
  WingWeightOptions,
  WingWeightScaleHint,
  WingWorkflowMode,
} from "../types/wing-rigging";

const props = defineProps<{
  analysis: BirdModelAnalysis | null;
  meshOptions: Array<{ nodeId: string; nodeName: string }>;
  unboundMeshOptions: Array<{ nodeId: string; nodeName: string }>;
  boundMeshLabels: string[];
  workflowMode: WingWorkflowMode;
  landmarkSteps: WingLandmarkStep[];
  landmarkProgress: { filled: number; total: number };
  isMarking: boolean;
  rigReady: boolean;
  pivotReady: boolean;
  presetReady: boolean;
  presetOptions: string[];
  weightOptions: WingWeightOptions;
  weightScaleHint: WingWeightScaleHint | null;
  weightHeatmapEnabled: boolean;
  applyingPivot: boolean;
  applyingRig: boolean;
  applyingPreset: boolean;
  animationOptions: WingAnimationOptions;
}>();

const leftWingNodeId = defineModel<string>("leftWingNodeId", { required: true });
const rightWingNodeId = defineModel<string>("rightWingNodeId", { required: true });
const rigTargetNodeId = defineModel<string>("rigTargetNodeId", { required: true });
const presetName = defineModel<string>("presetName", { required: true });

function onWorkflowModeChange(mode: WingWorkflowMode) {
  emit("workflow-mode-change", mode);
}

const emit = defineEmits<{
  "toggle-landmark-mode": [];
  "select-landmark-step": [index: number];
  "clear-landmarks": [];
  "apply-pivot": [];
  "apply-rig": [];
  "apply-preset": [];
  "workflow-mode-change": [mode: WingWorkflowMode];
  "update:animation-options": [value: WingAnimationOptions];
  "update:weight-options": [value: WingWeightOptions];
  "toggle-weight-heatmap": [enabled: boolean];
  "recompute-weights": [];
}>();

const activeLandmarkStep = computed(
  () => props.landmarkSteps.find((step) => step.status === "active") ?? null,
);

const presetButtonLabel = computed(() => {
  if (props.applyingPreset) {
    return "套用中…";
  }

  if (!props.presetReady) {
    return props.workflowMode === "node-pivot"
      ? "請先套用 Pivot 拍翅"
      : "請先完成 Rig";
  }

  return props.workflowMode === "node-pivot" ? "重新套用 Pivot" : "套用 Preset";
});

const rigButtonLabel = computed(() =>
  props.rigReady ? "套用蒙皮到此 Mesh" : "建立骨骼與權重",
);

function updateOption<K extends keyof WingAnimationOptions>(
  key: K,
  value: WingAnimationOptions[K],
) {
  emit("update:animation-options", { ...props.animationOptions, [key]: value });
}

function updateWeightOption<K extends keyof WingWeightOptions>(
  key: K,
  value: WingWeightOptions[K],
) {
  emit("update:weight-options", { ...props.weightOptions, [key]: value });
}

function onNumberInput(
  key: "speedMultiplier" | "amplitudeMultiplier",
  event: Event,
) {
  const input = event.target as HTMLInputElement | null;
  if (!input) {
    return;
  }
  const value = Number(input.value);
  if (Number.isNaN(value)) {
    return;
  }
  updateOption(key, value);
}

function onWeightNumberInput(
  key: keyof WingWeightOptions,
  event: Event,
) {
  const input = event.target as HTMLInputElement | null;
  if (!input) {
    return;
  }
  const value = Number(input.value);
  if (Number.isNaN(value)) {
    return;
  }
  updateWeightOption(key, value);
}

function onMirrorSelect(event: Event) {
  const select = event.target as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  updateOption("mirrorRight", select.value === "yes");
}

function onLoopSelect(event: Event) {
  const select = event.target as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  updateOption("loopMode", select.value as WingAnimationOptions["loopMode"]);
}

function formatScaleValue(value: number) {
  if (value >= 1) {
    return value.toFixed(2);
  }
  if (value >= 0.01) {
    return value.toFixed(3);
  }
  return value.toExponential(2);
}

function stepStatusLabel(status: WingLandmarkStep["status"]) {
  if (status === "done") {
    return "已完成";
  }
  if (status === "active") {
    return "進行中";
  }
  return "待標記";
}
</script>

<template>
  <section class="panel wing-panel">
    <div class="panel-heading">
      <span>翅膀 Rigging</span>
      <span v-if="analysis" class="status-pill">
        建議：{{ analysis.suggestedMode === "node-pivot" ? "Pivot" : analysis.suggestedMode === "full-rig" ? "完整 Rig" : "手動" }}
      </span>
    </div>

    <div class="panel-body">
      <div v-if="analysis?.warnings.length" class="warning-list">
        <p v-for="warning in analysis.warnings" :key="warning">⚠️ {{ warning }}</p>
      </div>

      <div class="mode-toggle" role="radiogroup" aria-label="翅膀 Rigging 模式">
        <label class="mode-option" :class="{ active: props.workflowMode === 'node-pivot' }">
          <input
            :checked="props.workflowMode === 'node-pivot'"
            type="radio"
            value="node-pivot"
            class="sr-only"
            @change="onWorkflowModeChange('node-pivot')"
          />
          Pivot 拍翅
        </label>
        <label class="mode-option" :class="{ active: props.workflowMode === 'full-rig' }">
          <input
            :checked="props.workflowMode === 'full-rig'"
            type="radio"
            value="full-rig"
            class="sr-only"
            @change="onWorkflowModeChange('full-rig')"
          />
          完整 Rig
        </label>
      </div>

      <div v-if="props.workflowMode === 'node-pivot'" class="section">
        <div class="section-title">Pivot 拍翅（獨立翅膀 Mesh）</div>
        <label class="inline-field">
          <span>左翅節點</span>
          <select v-model="leftWingNodeId" class="select-field">
            <option value="">請選擇</option>
            <option v-for="option in meshOptions" :key="option.nodeId" :value="option.nodeId">
              {{ option.nodeName }}
            </option>
          </select>
        </label>
        <label class="inline-field">
          <span>右翅節點</span>
          <select v-model="rightWingNodeId" class="select-field">
            <option value="">請選擇</option>
            <option v-for="option in meshOptions" :key="option.nodeId" :value="option.nodeId">
              {{ option.nodeName }}
            </option>
          </select>
        </label>
        <button class="export-button" type="button" :disabled="applyingPivot" @click="emit('apply-pivot')">
          {{ applyingPivot ? "套用中…" : "套用 Pivot 拍翅" }}
        </button>
      </div>

      <div v-else class="section">
        <div class="section-title">完整 Rig（6 點標記）</div>
        <label class="inline-field">
          <span>目標 Mesh</span>
          <select v-model="rigTargetNodeId" class="select-field">
            <option value="">請選擇</option>
            <option
              v-for="option in unboundMeshOptions"
              :key="option.nodeId"
              :value="option.nodeId"
            >
              {{ option.nodeName }}
            </option>
          </select>
        </label>

        <p v-if="props.rigReady && boundMeshLabels.length" class="hint-text">
          已套用蒙皮：{{ boundMeshLabels.join("、") }}
        </p>

        <p v-if="activeLandmarkStep" class="landmark-hint">
          請在模型上點選：{{ activeLandmarkStep.label }}
        </p>

        <ol class="landmark-steps">
          <li
            v-for="step in landmarkSteps"
            :key="step.id"
            class="landmark-step"
            :class="`landmark-step--${step.status}`"
          >
            <button
              class="landmark-step-button"
              type="button"
              @click="emit('select-landmark-step', step.index)"
            >
              <span class="landmark-step-index">{{ step.index + 1 }}</span>
              <span class="landmark-step-label">{{ step.label }}</span>
              <span class="landmark-step-status">{{ stepStatusLabel(step.status) }}</span>
            </button>
          </li>
        </ol>

        <div class="landmark-row">
          <span>已標記 {{ landmarkProgress.filled }} / {{ landmarkProgress.total }}</span>
          <button class="compact-button" type="button" @click="emit('toggle-landmark-mode')">
            {{ isMarking ? "停止標記" : "開始標記" }}
          </button>
          <button class="compact-button" type="button" @click="emit('clear-landmarks')">
            清除標記
          </button>
        </div>

        <button class="export-button" type="button" :disabled="applyingRig" @click="emit('apply-rig')">
          {{ applyingRig ? "套用中…" : rigButtonLabel }}
        </button>

        <div v-if="rigReady" class="weight-section">
          <div class="section-title">權重微調</div>
          <p v-if="weightScaleHint" class="weight-scale-hint">
            肩距 {{ formatScaleValue(weightScaleHint.shoulderSpan) }} ·
            身體鎖定 {{ formatScaleValue(weightScaleHint.bodyRadius) }} ·
            Falloff {{ formatScaleValue(weightScaleHint.falloff) }}
          </p>
          <p class="weight-scale-hint">
            身體鎖定：調大 → 軀幹更穩定；調小 → 翅膀帶動範圍更大
          </p>
          <label class="inline-field">
            <span>身體鎖定範圍（× 肩距）</span>
            <input
              class="position-input"
              type="range"
              step="0.01"
              min="0.05"
              max="1.2"
              :value="weightOptions.bodyRadiusRatio"
              @input="onWeightNumberInput('bodyRadiusRatio', $event)"
            />
            <input
              class="position-input"
              type="number"
              step="0.01"
              min="0.05"
              max="1.2"
              :value="weightOptions.bodyRadiusRatio"
              @input="onWeightNumberInput('bodyRadiusRatio', $event)"
            />
          </label>
          <label class="inline-field">
            <span>Falloff 比例（× 翅段長）</span>
            <input
              class="position-input"
              type="range"
              step="0.01"
              min="0.05"
              max="1"
              :value="weightOptions.falloffRatio"
              @input="onWeightNumberInput('falloffRatio', $event)"
            />
            <input
              class="position-input"
              type="number"
              step="0.01"
              min="0.05"
              max="1"
              :value="weightOptions.falloffRatio"
              @input="onWeightNumberInput('falloffRatio', $event)"
            />
          </label>
          <label class="checkbox-field">
            <input
              type="checkbox"
              :checked="weightHeatmapEnabled"
              @change="emit('toggle-weight-heatmap', ($event.target as HTMLInputElement).checked)"
            />
            <span>顯示權重熱力圖</span>
          </label>
          <button class="compact-button" type="button" @click="emit('recompute-weights')">
            重新計算權重
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">拍翅 Preset</div>
        <label class="inline-field">
          <span>Preset</span>
          <select v-model="presetName" class="select-field">
            <option v-for="option in presetOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <div class="options-grid">
          <label class="inline-field">
            <span>速度</span>
            <input
              class="position-input"
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              :value="animationOptions.speedMultiplier"
              @change="onNumberInput('speedMultiplier', $event)"
            />
          </label>
          <label class="inline-field">
            <span>幅度</span>
            <input
              class="position-input"
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              :value="animationOptions.amplitudeMultiplier"
              @change="onNumberInput('amplitudeMultiplier', $event)"
            />
          </label>
          <label class="inline-field">
            <span>鏡射右翅</span>
            <select
              class="select-field"
              :value="animationOptions.mirrorRight ? 'yes' : 'no'"
              @change="onMirrorSelect"
            >
              <option value="yes">是</option>
              <option value="no">否</option>
            </select>
          </label>
          <label class="inline-field">
            <span>Loop</span>
            <select
              class="select-field"
              :value="animationOptions.loopMode"
              @change="onLoopSelect"
            >
              <option value="repeat">Repeat</option>
              <option value="once">Once</option>
              <option value="pingpong">Pingpong</option>
            </select>
          </label>
        </div>
        <button
          class="export-button"
          type="button"
          :disabled="applyingPreset || !presetReady"
          @click="emit('apply-preset')"
        >
          {{ presetButtonLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
@reference "../style.css";

.wing-panel {
  @apply min-w-0;
}

.panel-heading {
  @apply flex min-h-[42px] items-center justify-between gap-2.5 border-b border-line px-3 py-2.5 text-[13px] font-extrabold uppercase text-text;
}

.panel-body {
  @apply flex flex-col gap-4 p-3;
}

.mode-toggle {
  @apply grid grid-cols-2 gap-1 rounded-default border border-line bg-surface p-1;
}

.mode-option {
  @apply flex min-h-8 cursor-pointer items-center justify-center rounded-small px-2 text-xs font-bold text-text-muted;
}

.mode-option.active {
  @apply bg-surface-2 text-text shadow-sm;
}

.section {
  @apply flex flex-col gap-2.5 rounded-default border border-line bg-surface-2 p-2.5;
}

.section-title {
  @apply text-xs font-bold uppercase text-text-muted;
}

.warning-list {
  @apply rounded-default border border-warn/40 bg-warn/10 p-2 text-xs text-warn;
}

.warning-list p {
  @apply m-0;
}

.inline-field {
  @apply flex min-w-0 flex-col gap-1 text-xs text-text-muted;
}

.inline-field span {
  @apply font-bold uppercase;
}

.select-field,
.position-input {
  @apply h-8 w-full rounded-small border border-line bg-surface px-2 text-sm text-text;
}

.landmark-hint {
  @apply m-0 rounded-small border border-accent/30 bg-accent/10 px-2 py-1.5 text-xs font-bold text-text;
}

.hint-text {
  @apply m-0 text-[11px] text-text-muted;
}

.landmark-steps {
  @apply m-0 flex list-none flex-col gap-1 p-0;
}

.landmark-step-button {
  @apply flex w-full items-center gap-2 rounded-small border border-line bg-surface px-2 py-1.5 text-left text-xs;
}

.landmark-step--active .landmark-step-button {
  @apply border-accent bg-accent/10;
}

.landmark-step--done .landmark-step-button {
  @apply border-line-strong;
}

.landmark-step-index {
  @apply flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-text-muted;
}

.landmark-step--active .landmark-step-index {
  @apply bg-accent text-white;
}

.landmark-step-label {
  @apply min-w-0 flex-1 font-bold text-text;
}

.landmark-step-status {
  @apply shrink-0 text-[11px] text-text-muted;
}

.landmark-row {
  @apply flex flex-wrap items-center gap-2 text-xs text-text-muted;
}

.weight-section {
  @apply flex flex-col gap-2 border-t border-line pt-2.5;
}

.weight-scale-hint {
  @apply m-0 text-[11px] text-text-muted;
}

.inline-field input[type="range"] {
  @apply h-6 cursor-pointer accent-accent;
}

.checkbox-field {
  @apply flex items-center gap-2 text-xs font-bold text-text-muted;
}

.options-grid {
  @apply grid grid-cols-2 gap-2;
}

.export-button {
  @apply min-h-[36px] w-full cursor-pointer rounded-button border border-line-strong bg-surface px-3 text-[13px] font-bold text-text;
}

.export-button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.compact-button {
  @apply h-8 cursor-pointer rounded-small border border-line bg-surface px-2 text-xs font-bold text-text;
}
</style>
