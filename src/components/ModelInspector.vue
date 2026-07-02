<script setup lang="ts">
import { useScrubInput } from "../composables/useScrubInput";
import AnimationDetailPanel from "./AnimationDetailPanel.vue";
import RotorAnimationPanel from "./RotorAnimationPanel.vue";
import NodeColorPanel from "./NodeColorPanel.vue";
import WingRiggingPanel from "./WingRiggingPanel.vue";
import type { BirdModelAnalysis, WingAnimationOptions, WingBoneSlotId, WingLandmarkStep, WingWeightOptions, WingWeightScaleHint, WingWorkflowMode } from "../types/wing-rigging";
import type {
  AnimationLoopMode,
  ModelStats,
  NodeColorMode,
  RotorTargetConfig,
  SelectedAnimationDetail,
  SelectedNodeDetails,
  Vector3Values,
} from "../types/glb-viewer";

const { onScrubPointerDown } = useScrubInput();

const props = defineProps<{
  loading: boolean;
  exporting: boolean;
  hasModel: boolean;
  errorMessage: string;
  modelPosition: Vector3Values;
  selectedNodeRotation: Vector3Values | null;
  selectedNodeDetails: SelectedNodeDetails | null;
  stats: ModelStats | null;
  isAnimationPlaying: boolean;
  activeAnimationIndices: ReadonlySet<number>;
  selectedAnimationIndex: number | null;
  selectedAnimationDetail: SelectedAnimationDetail | null;
  applyingRotorAnimationChanges: boolean;
  removingAnimation: boolean;
  rotorTargetConfigList: Array<{
    nodeId: string;
    nodeName: string;
    config: RotorTargetConfig;
  }>;
  canApplyRotorAnimation: boolean;
  applyingRotorAnimation: boolean;
  nodeColorTargetList: Array<{
    nodeId: string;
    nodeName: string;
    hasDirectMesh: boolean;
  }>;
  nodeColorTextureFile: File | null;
  canApplyNodeColor: boolean;
  canRevertNodeColor: boolean;
  applyingNodeColor: boolean;
  revertingNodeColor: boolean;
  wingAnalysis: BirdModelAnalysis | null;
  wingMeshOptions: Array<{ nodeId: string; nodeName: string }>;
  wingUnboundMeshOptions: Array<{ nodeId: string; nodeName: string }>;
  wingBoundMeshLabels: string[];
  wingBoneOptions: Array<{ nodeId: string; nodeName: string }>;
  wingBoneSlotNodeIds: Partial<Record<WingBoneSlotId, string>>;
  wingExistingSkeletonReady: boolean;
  wingLandmarkSteps: WingLandmarkStep[];
  wingLandmarkProgress: { filled: number; total: number };
  wingLandmarkModeEnabled: boolean;
  wingWorkflowMode: WingWorkflowMode;
  wingRigReady: boolean;
  wingPivotReady: boolean;
  wingPresetReady: boolean;
  wingWeightOptions: WingWeightOptions;
  wingWeightScaleHint: WingWeightScaleHint | null;
  wingWeightHeatmapEnabled: boolean;
  wingPresetOptions: string[];
  wingAnimationOptions: WingAnimationOptions;
  applyingWingPivot: boolean;
  applyingWingRig: boolean;
  applyingWingPreset: boolean;
}>();

const rotorAnimationName = defineModel<string>("rotorAnimationName", {
  required: true,
});

const nodeColorMode = defineModel<NodeColorMode>("nodeColorMode", {
  required: true,
});

const nodeColorHex = defineModel<string>("nodeColorHex", {
  required: true,
});

const leftWingNodeId = defineModel<string>("leftWingNodeId", {
  required: true,
});

const rightWingNodeId = defineModel<string>("rightWingNodeId", {
  required: true,
});

const wingRigTargetNodeId = defineModel<string>("wingRigTargetNodeId", {
  required: true,
});

const wingPresetName = defineModel<string>("wingPresetName", {
  required: true,
});

const collapsed = defineModel<boolean>("collapsed", { default: false });

const exportFileName = defineModel<string>("exportFileName", {
  required: true,
});

const emit = defineEmits<{
  "toggle-animation-playback": [];
  "select-animation": [index: number];
  "play-animation": [index: number];
  "update-animation-settings": [
    index: number,
    patch: {
      name?: string;
      timeScale?: number;
      loopMode?: AnimationLoopMode;
    },
  ];
  "update-rotor-animation-target": [
    index: number,
    pivotUuid: string,
    patch: Partial<RotorTargetConfig>,
  ];
  "detect-rotor-animation-target": [
    index: number,
    pivotUuid: string,
    kind: "pivot" | "axis" | "both",
  ];
  "apply-rotor-animation-changes": [index: number];
  "remove-animation": [index: number];
  "update:model-position": [position: Vector3Values];
  "update:selected-node-rotation": [rotation: Vector3Values];
  "reset-model-position": [];
  "export-model": [];
  "update-rotor-config": [nodeId: string, patch: Partial<RotorTargetConfig>];
  "detect-rotor": [nodeId: string, kind: "pivot" | "axis" | "both"];
  "apply-rotor-animation": [];
  "node-color-texture-selected": [file: File | null];
  "apply-node-color": [];
  "revert-node-color": [];
  "toggle-wing-landmark-mode": [];
  "select-wing-landmark-step": [index: number];
  "clear-wing-landmarks": [];
  "wing-workflow-mode-change": [mode: WingWorkflowMode];
  "update-wing-bone-slot": [slot: WingBoneSlotId, nodeId: string];
  "apply-wing-pivot": [];
  "apply-wing-rig": [];
  "apply-wing-preset": [];
  "update:wing-animation-options": [value: WingAnimationOptions];
  "update:wing-weight-options": [value: WingWeightOptions];
  "toggle-wing-weight-heatmap": [enabled: boolean];
  "recompute-wing-weights": [];
}>();

function setModelAxis(axis: keyof Vector3Values, value: number) {
  emit("update:model-position", {
    ...props.modelPosition,
    [axis]: value,
  });
}

function setRotationAxis(axis: keyof Vector3Values, value: number) {
  if (!props.selectedNodeRotation) {
    return;
  }

  emit("update:selected-node-rotation", {
    ...props.selectedNodeRotation,
    [axis]: value,
  });
}

function updateAxis(axis: keyof Vector3Values, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);

  if (Number.isNaN(value)) {
    return;
  }

  setModelAxis(axis, value);
}

function updateRotationAxis(axis: keyof Vector3Values, event: Event) {
  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);

  if (Number.isNaN(value)) {
    return;
  }

  setRotationAxis(axis, value);
}
</script>

<template>
  <aside
    class="inspector"
    :class="{ 'is-collapsed': collapsed }"
    aria-label="模型資訊"
  >
    <button
      v-if="collapsed"
      class="sidebar-rail"
      type="button"
      aria-expanded="false"
      aria-controls="inspector-sidebar-content"
      aria-label="展開模型資訊側欄"
      @click="collapsed = false"
    >
      <svg class="sidebar-rail__chevron" aria-hidden="true" viewBox="0 0 12 12">
        <path d="M7.5 3 4.5 6 7.5 9" />
      </svg>
      <span class="sidebar-rail__label">資訊</span>
    </button>

    <div
      v-show="!collapsed"
      id="inspector-sidebar-content"
      class="sidebar-content"
    >
      <div class="inspector-toolbar">
        <button
          class="sidebar-toggle"
          type="button"
          aria-expanded="true"
          aria-controls="inspector-sidebar-content"
          aria-label="收合模型資訊側欄"
          @click="collapsed = true"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12">
            <path d="M4.5 3 7.5 6 4.5 9" />
          </svg>
        </button>
        <span>模型資訊</span>
      </div>

      <section class="panel">
        <div class="panel-heading">
          <span>狀態</span>
          <span class="status-pill" :class="{ ready: hasModel, loading }">
            {{ loading ? "載入中" : hasModel ? "已載入" : "待選檔" }}
          </span>
        </div>

        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <p v-else-if="hasModel" class="muted">
          點擊模型或左側節點可選取，選中物件會顯示白色邊緣線。
        </p>
        <p v-else class="muted">選擇單一 GLB，或同批選取 GLTF 與相依資源。</p>
      </section>

      <section v-if="hasModel" class="panel">
        <div class="panel-heading">
          <span>模型位置</span>
          <button
            class="compact-button"
            type="button"
            @click="emit('reset-model-position')"
          >
            重設位置
          </button>
        </div>
        <div class="transform-grid" role="table" aria-label="模型位置">
          <div class="transform-grid__inner">
            <div class="transform-grid__header" role="row">
              <span role="columnheader"></span>
              <span role="columnheader">X</span>
              <span role="columnheader">Y</span>
              <span role="columnheader">Z</span>
            </div>
            <div class="transform-grid__row" role="row">
              <span role="rowheader">位置</span>
              <input
                class="position-input"
                type="number"
                step="0.01"
                :value="modelPosition.x"
                aria-label="模型 X 位置"
                @pointerdown="
                  onScrubPointerDown($event, {
                    step: 1,
                    getValue: () => modelPosition.x,
                    onUpdate: (value) => setModelAxis('x', value),
                  })
                "
                @change="updateAxis('x', $event)"
              />
              <input
                class="position-input"
                type="number"
                step="0.01"
                :value="modelPosition.y"
                aria-label="模型 Y 位置"
                @pointerdown="
                  onScrubPointerDown($event, {
                    step: 1,
                    getValue: () => modelPosition.y,
                    onUpdate: (value) => setModelAxis('y', value),
                  })
                "
                @change="updateAxis('y', $event)"
              />
              <input
                class="position-input"
                type="number"
                step="0.01"
                :value="modelPosition.z"
                aria-label="模型 Z 位置"
                @pointerdown="
                  onScrubPointerDown($event, {
                    step: 1,
                    getValue: () => modelPosition.z,
                    onUpdate: (value) => setModelAxis('z', value),
                  })
                "
                @change="updateAxis('z', $event)"
              />
            </div>
          </div>
        </div>
        <p class="position-hint muted">
          在輸入框按住並左右拖曳可微調數值；開啟檢視區移動模式後，也可拖曳三軸
          Gizmo 調整位置。
        </p>
      </section>

      <NodeColorPanel
        class="panel"
        v-if="hasModel"
        v-model:mode="nodeColorMode"
        v-model:color-hex="nodeColorHex"
        :targets="nodeColorTargetList"
        :texture-file="nodeColorTextureFile"
        :can-apply="canApplyNodeColor"
        :can-revert="canRevertNodeColor"
        :applying="applyingNodeColor"
        :reverting="revertingNodeColor"
        @texture-selected="(file) => emit('node-color-texture-selected', file)"
        @apply="emit('apply-node-color')"
        @revert="emit('revert-node-color')"
      />

      <WingRiggingPanel
        v-if="hasModel"
        :analysis="wingAnalysis"
        :mesh-options="wingMeshOptions"
        :unbound-mesh-options="wingUnboundMeshOptions"
        :bound-mesh-labels="wingBoundMeshLabels"
        :bone-options="wingBoneOptions"
        :bone-slot-node-ids="wingBoneSlotNodeIds"
        :existing-skeleton-ready="wingExistingSkeletonReady"
        :workflow-mode="wingWorkflowMode"
        :landmark-steps="wingLandmarkSteps"
        :landmark-progress="wingLandmarkProgress"
        :is-marking="wingLandmarkModeEnabled"
        :rig-ready="wingRigReady"
        :pivot-ready="wingPivotReady"
        :preset-ready="wingPresetReady"
        :weight-options="wingWeightOptions"
        :weight-scale-hint="wingWeightScaleHint"
        :weight-heatmap-enabled="wingWeightHeatmapEnabled"
        :preset-options="wingPresetOptions"
        :animation-options="wingAnimationOptions"
        :applying-pivot="applyingWingPivot"
        :applying-rig="applyingWingRig"
        :applying-preset="applyingWingPreset"
        v-model:left-wing-node-id="leftWingNodeId"
        v-model:right-wing-node-id="rightWingNodeId"
        v-model:rig-target-node-id="wingRigTargetNodeId"
        v-model:preset-name="wingPresetName"
        @toggle-landmark-mode="emit('toggle-wing-landmark-mode')"
        @select-landmark-step="(index) => emit('select-wing-landmark-step', index)"
        @clear-landmarks="emit('clear-wing-landmarks')"
        @workflow-mode-change="(mode) => emit('wing-workflow-mode-change', mode)"
        @update-bone-slot="(slot, nodeId) => emit('update-wing-bone-slot', slot, nodeId)"
        @apply-pivot="emit('apply-wing-pivot')"
        @apply-rig="emit('apply-wing-rig')"
        @apply-preset="emit('apply-wing-preset')"
        @update:animation-options="(value) => emit('update:wing-animation-options', value)"
        @update:weight-options="(value) => emit('update:wing-weight-options', value)"
        @toggle-weight-heatmap="(enabled) => emit('toggle-wing-weight-heatmap', enabled)"
        @recompute-weights="emit('recompute-wing-weights')"
      />

      <section v-if="stats?.animations.length" class="panel">
        <div class="panel-heading">
          <span>動畫</span>
          <button
            class="compact-button"
            type="button"
            @click="emit('toggle-animation-playback')"
          >
            {{ isAnimationPlaying ? "暫停" : "播放" }}
          </button>
        </div>
        <div class="animation-list">
          <div
            v-for="(animation, index) in stats.animations"
            :key="`${animation.name}-${index}`"
            class="animation-row"
            :class="{ selected: selectedAnimationIndex === index }"
          >
            <button
              class="animation-row__select"
              type="button"
              @click="emit('select-animation', index)"
            >
              <span>{{ animation.name }}</span>
              <small>{{ animation.duration }}</small>
            </button>
            <button
              class="animation-row__play"
              type="button"
              :class="{ playing: activeAnimationIndices.has(index) }"
              :aria-label="
                activeAnimationIndices.has(index) ? '暫停動畫' : '播放動畫'
              "
              @click="emit('play-animation', index)"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <path
                  v-if="activeAnimationIndices.has(index)"
                  d="M5 3h2v10H5V3zm4 0h2v10H9V3z"
                  fill="currentColor"
                />
                <path v-else d="M5 3.5v9l7-4.5-7-4.5z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        <AnimationDetailPanel
          v-if="selectedAnimationDetail"
          :detail="selectedAnimationDetail"
          :applying-rotor-changes="applyingRotorAnimationChanges"
          :removing="removingAnimation"
          @update-settings="
            (patch) =>
              emit(
                'update-animation-settings',
                selectedAnimationDetail!.index,
                patch,
              )
          "
          @update-rotor-target="
            (pivotUuid, patch) =>
              emit(
                'update-rotor-animation-target',
                selectedAnimationDetail!.index,
                pivotUuid,
                patch,
              )
          "
          @detect-rotor-target="
            (pivotUuid, kind) =>
              emit(
                'detect-rotor-animation-target',
                selectedAnimationDetail!.index,
                pivotUuid,
                kind,
              )
          "
          @apply-rotor-changes="
            emit(
              'apply-rotor-animation-changes',
              selectedAnimationDetail!.index,
            )
          "
          @remove="emit('remove-animation', selectedAnimationDetail!.index)"
        />
      </section>

      <section v-if="selectedNodeDetails" class="panel">
        <div class="panel-heading">
          <span>變換（局部）</span>
        </div>
        <div class="transform-grid" role="table" aria-label="節點局部變換">
          <div class="transform-grid__inner">
            <div class="transform-grid__header" role="row">
              <span role="columnheader"></span>
              <span role="columnheader">X</span>
              <span role="columnheader">Y</span>
              <span role="columnheader">Z</span>
            </div>
            <div class="transform-grid__row" role="row">
              <span role="rowheader">位置</span>
              <span>{{ selectedNodeDetails.transform.position.x }}</span>
              <span>{{ selectedNodeDetails.transform.position.y }}</span>
              <span>{{ selectedNodeDetails.transform.position.z }}</span>
            </div>
            <div class="transform-grid__row" role="row">
              <span role="rowheader">旋轉</span>
              <input
                v-if="selectedNodeRotation"
                class="position-input"
                type="number"
                step="0.1"
                :value="selectedNodeRotation.x"
                aria-label="節點 X 旋轉（度）"
                @pointerdown="
                  onScrubPointerDown($event, {
                    step: 1,
                    getValue: () => selectedNodeRotation!.x,
                    onUpdate: (value) => setRotationAxis('x', value),
                  })
                "
                @change="updateRotationAxis('x', $event)"
              />
              <input
                v-if="selectedNodeRotation"
                class="position-input"
                type="number"
                step="0.1"
                :value="selectedNodeRotation.y"
                aria-label="節點 Y 旋轉（度）"
                @pointerdown="
                  onScrubPointerDown($event, {
                    step: 1,
                    getValue: () => selectedNodeRotation!.y,
                    onUpdate: (value) => setRotationAxis('y', value),
                  })
                "
                @change="updateRotationAxis('y', $event)"
              />
              <input
                v-if="selectedNodeRotation"
                class="position-input"
                type="number"
                step="0.1"
                :value="selectedNodeRotation.z"
                aria-label="節點 Z 旋轉（度）"
                @pointerdown="
                  onScrubPointerDown($event, {
                    step: 1,
                    getValue: () => selectedNodeRotation!.z,
                    onUpdate: (value) => setRotationAxis('z', value),
                  })
                "
                @change="updateRotationAxis('z', $event)"
              />
            </div>
            <div class="transform-grid__row" role="row">
              <span role="rowheader">縮放</span>
              <span>{{ selectedNodeDetails.transform.scale.x }}</span>
              <span>{{ selectedNodeDetails.transform.scale.y }}</span>
              <span>{{ selectedNodeDetails.transform.scale.z }}</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="selectedNodeDetails" class="panel">
        <div class="panel-heading">
          <span>已選節點</span>
        </div>
        <dl class="meta-list">
          <div>
            <dt>名稱</dt>
            <dd>{{ selectedNodeDetails.name }}</dd>
          </div>
          <div>
            <dt>類型</dt>
            <dd>{{ selectedNodeDetails.type }}</dd>
          </div>
          <div>
            <dt>路徑</dt>
            <dd>{{ selectedNodeDetails.path }}</dd>
          </div>
          <div>
            <dt>Mesh</dt>
            <dd>{{ selectedNodeDetails.meshCount }}</dd>
          </div>
          <div>
            <dt>三角面</dt>
            <dd>{{ selectedNodeDetails.triangleCount }}</dd>
          </div>
          <div>
            <dt>尺寸</dt>
            <dd>
              {{ selectedNodeDetails.dimensions.x }} x
              {{ selectedNodeDetails.dimensions.y }} x
              {{ selectedNodeDetails.dimensions.z }}
            </dd>
          </div>
        </dl>
      </section>
      <section v-if="stats" class="panel">
        <div class="panel-heading">
          <span>場景統計</span>
        </div>
        <dl class="metrics-grid">
          <div>
            <dt>節點</dt>
            <dd>{{ stats.nodeCount }}</dd>
          </div>
          <div>
            <dt>Mesh</dt>
            <dd>{{ stats.meshCount }}</dd>
          </div>
          <div>
            <dt>材質</dt>
            <dd>{{ stats.materialCount }}</dd>
          </div>
          <div>
            <dt>貼圖</dt>
            <dd>{{ stats.textureCount }}</dd>
          </div>
          <div>
            <dt>三角面</dt>
            <dd>{{ stats.triangleCount }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="stats" class="panel">
        <div class="panel-heading">
          <span>尺寸</span>
        </div>
        <dl class="meta-list">
          <div>
            <dt>X</dt>
            <dd>{{ stats.dimensions.x }}</dd>
          </div>
          <div>
            <dt>Y</dt>
            <dd>{{ stats.dimensions.y }}</dd>
          </div>
          <div>
            <dt>Z</dt>
            <dd>{{ stats.dimensions.z }}</dd>
          </div>
        </dl>
      </section>

      <RotorAnimationPanel
        v-model:animation-name="rotorAnimationName"
        :targets="rotorTargetConfigList"
        :can-apply-rotor-animation="canApplyRotorAnimation"
        :applying="applyingRotorAnimation"
        @update-config="
          (nodeId, patch) => emit('update-rotor-config', nodeId, patch)
        "
        @detect="(nodeId, kind) => emit('detect-rotor', nodeId, kind)"
        @apply="emit('apply-rotor-animation')"
      />

      <section v-if="hasModel" class="panel">
        <div class="panel-heading">
          <span>匯出 GLB</span>
        </div>
        <p class="export-hint muted">
          將目前場景中的位置、旋轉與縮放變換寫入 GLB 並下載。
        </p>
        <div class="export-actions">
          <label class="export-file-field">
            <span>檔名</span>
            <input
              v-model="exportFileName"
              class="export-file-input"
              type="text"
              :disabled="exporting || loading"
              aria-label="匯出檔名"
              placeholder="model_exported.glb"
            />
          </label>
          <button
            class="export-button"
            type="button"
            :disabled="exporting || loading"
            @click="emit('export-model')"
          >
            {{ exporting ? "匯出中…" : "下載 GLB" }}
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
@reference "../style.css";

.inspector {
  @apply flex max-h-[calc(100svh-72px)] min-w-0 flex-col gap-3 overflow-hidden border-l border-line bg-surface p-3;
}

.inspector.is-collapsed {
  @apply gap-0 overflow-hidden p-0;
}

.sidebar-content {
  @apply flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto;
}

.sidebar-rail {
  @apply flex min-h-0 w-full flex-1 cursor-pointer flex-col items-center justify-center gap-2.5 border-0 bg-surface px-1 py-2.5 text-text-muted transition-[background-color,color] duration-150;
}

.sidebar-rail:hover {
  @apply bg-surface-2 text-text;
}

.sidebar-rail__label {
  @apply text-xs font-extrabold tracking-widest uppercase;
  writing-mode: vertical-rl;
}

.sidebar-rail__chevron,
.sidebar-toggle svg {
  @apply h-3 w-3 fill-none stroke-current;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.sidebar-toggle {
  @apply inline-grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-small border border-line bg-surface-2 p-0 text-text-muted transition-[border-color,background-color,color] duration-150;
}

.sidebar-toggle:hover {
  border-color: rgba(89, 168, 255, 0.65);
  @apply text-text;
}

.inspector-toolbar {
  @apply flex min-h-[42px] items-center justify-between gap-2.5 rounded-default border border-line bg-panel px-3 py-2.5 text-[13px] font-extrabold uppercase text-text;
}

.panel {
  @apply min-w-0 rounded-default border border-line bg-panel;
}

.panel-heading {
  @apply flex min-h-[42px] items-center justify-between gap-2.5 border-b border-line px-3 py-2.5 text-[13px] font-extrabold uppercase text-text;
}

.status-pill {
  @apply inline-flex min-h-6 items-center rounded-full border border-line-strong px-2 text-xs font-bold normal-case text-text-muted;
}

.status-pill.ready {
  border-color: rgba(76, 201, 166, 0.55);
  @apply text-accent-strong;
}

.status-pill.loading {
  border-color: rgba(243, 179, 91, 0.65);
  @apply text-warn;
}

.muted,
.error-message {
  @apply m-0 p-3 text-sm text-text-muted;
}

.error-message {
  @apply text-danger wrap-anywhere;
}

.meta-list,
.metrics-grid {
  @apply m-0 px-3 pt-2.5 pb-3;
}

.meta-list {
  @apply grid gap-[9px];
}

.meta-list div,
.metrics-grid div {
  @apply min-w-0;
}

.meta-list div {
  @apply grid grid-cols-[86px_minmax(0,1fr)] items-start gap-2.5;
}

.metrics-grid {
  @apply grid grid-cols-2 gap-2;
}

.metrics-grid div {
  @apply rounded-button border border-line bg-surface-2 p-2.5;
}

.meta-list dt,
.metrics-grid dt {
  @apply text-xs text-text-muted;
}

.meta-list dd {
  @apply m-0 min-w-0 text-sm font-bold text-text wrap-anywhere;
}

.metrics-grid dd {
  @apply mt-1 mb-0 text-xl leading-tight font-bold text-text;
}

.transform-grid {
  @apply px-3 pt-2.5 pb-3;
}

.transform-grid__inner {
  @apply grid w-full min-w-0 gap-y-2;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
}

.transform-grid__header,
.transform-grid__row {
  @apply col-span-full grid items-center;
  grid-template-columns: subgrid;
}

.transform-grid__header {
  @apply text-[13px] font-bold text-text-muted;
}

.transform-grid__row {
  @apply min-h-[30px];
}

.transform-grid__row > span:first-child {
  @apply font-bold text-text;
}

.transform-grid__header > span:not(:first-child),
.transform-grid__row > span:not(:first-child) {
  @apply min-w-0 text-center;
}

.transform-grid__row > span:not(:first-child) {
  @apply break-all text-text-soft tabular-nums;
}

.position-input {
  @apply min-h-[30px] w-full min-w-0 cursor-ew-resize rounded-small border border-line-strong bg-surface px-2 py-1 text-center text-sm text-text tabular-nums;
}

.position-hint {
  @apply m-0 px-3 pb-3 text-[13px];
}

.export-hint {
  @apply m-0 px-3 pb-2 text-[13px];
}

.export-actions {
  @apply flex flex-col gap-2 px-3 pb-3;
}

.export-file-field {
  @apply flex min-w-0 flex-col gap-1 text-xs text-text-muted;
}

.export-file-field span {
  @apply font-bold uppercase;
}

.export-file-input {
  @apply min-h-[30px] w-full min-w-0 rounded-small border border-line-strong bg-surface px-2 py-1 text-sm text-text;
}

.export-file-input:disabled {
  @apply cursor-not-allowed opacity-60;
}

.export-button {
  @apply min-h-[38px] w-full cursor-pointer rounded-button border border-line-strong bg-surface-2 px-3 text-[13px] font-bold text-text transition-[border-color,color,opacity] duration-150;
}

.export-button:hover:not(:disabled) {
  border-color: rgba(76, 201, 166, 0.65);
  @apply text-accent-strong;
}

.export-button:disabled {
  @apply cursor-not-allowed opacity-60;
}

.compact-button {
  @apply min-h-[30px] cursor-pointer rounded-small border border-line-strong bg-surface-2 px-2.5 text-[13px] font-bold text-text transition-[border-color,color] duration-150;
}

.compact-button:hover {
  border-color: rgba(76, 201, 166, 0.65);
  @apply text-accent-strong;
}

.animation-list {
  @apply grid gap-2 px-3 pt-2.5;
}

.animation-row {
  @apply flex items-stretch gap-1.5;
}

.animation-row.selected .animation-row__select {
  border-color: rgba(89, 168, 255, 0.65);
  background: rgba(89, 168, 255, 0.08);
}

.animation-row__select {
  @apply flex min-h-[42px] min-w-0 flex-1 cursor-pointer items-center justify-between gap-3 rounded-button border border-line bg-surface-2 px-2.5 py-2 text-left text-text transition-[border-color,background-color] duration-150;
}

.animation-row__select:hover {
  border-color: rgba(89, 168, 255, 0.45);
}

.animation-row__play {
  @apply inline-grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-button border border-line bg-surface-2 text-text-muted transition-[border-color,background-color,color] duration-150;
}

.animation-row__play svg {
  @apply h-4 w-4;
}

.animation-row__play:hover,
.animation-row__play.playing {
  border-color: rgba(76, 201, 166, 0.65);
  background: var(--color-animation-hover-bg);
  @apply text-accent-strong;
}

.animation-row__select span {
  @apply min-w-0 font-bold wrap-anywhere;
}

.animation-row__select small {
  @apply shrink-0 text-xs text-text-muted;
}

.sidebar-content {
  scrollbar-width: thin;
  scrollbar-color: #9ba8b4 var(--color-surface-2);
}

.sidebar-content::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.sidebar-content::-webkit-scrollbar-track {
  background: var(--color-surface-2);
}

.sidebar-content::-webkit-scrollbar-thumb {
  background: #9ba8b4;
  border-radius: 999px;
}

.sidebar-content::-webkit-scrollbar-thumb:hover {
  background: #c8d1d9;
}

@media (max-width: 980px) {
  .inspector {
    @apply order-3 max-h-[min(360px,42svh)] border-t border-l-0;
  }

  .inspector.is-collapsed {
    max-height: var(--sidebar-rail-width, 44px);
  }

  .sidebar-rail {
    @apply min-h-[44px] flex-row justify-center px-3 py-1;
  }

  .sidebar-rail__label {
    writing-mode: horizontal-tb;
  }
}

@media (max-width: 560px) {
  .meta-list div {
    @apply grid-cols-[72px_minmax(0,1fr)];
  }
}
</style>
