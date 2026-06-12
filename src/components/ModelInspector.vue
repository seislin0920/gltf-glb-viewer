<script setup lang="ts">
import { useScrubInput } from "../composables/useScrubInput";
import type { ModelStats, SelectedNodeDetails, Vector3Values } from "../types/glb-viewer";

const { onScrubPointerDown } = useScrubInput();

const props = defineProps<{
  loading: boolean;
  hasModel: boolean;
  errorMessage: string;
  modelPosition: Vector3Values;
  selectedNodeRotation: Vector3Values | null;
  selectedNodeDetails: SelectedNodeDetails | null;
  stats: ModelStats | null;
  isAnimationPlaying: boolean;
  activeAnimationIndex: number;
}>();

const collapsed = defineModel<boolean>("collapsed", { default: false });

const emit = defineEmits<{
  "toggle-animation-playback": [];
  "play-animation": [index: number];
  "update:model-position": [position: Vector3Values];
  "update:selected-node-rotation": [rotation: Vector3Values];
  "reset-model-position": [];
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
          在輸入框按住並左右拖曳可微調數值；開啟檢視區移動模式後，也可拖曳三軸 Gizmo 調整位置。
        </p>
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
          <button
            v-for="(animation, index) in stats.animations"
            :key="`${animation.name}-${index}`"
            type="button"
            :class="{ active: activeAnimationIndex === index }"
            @click="emit('play-animation', index)"
          >
            <span>{{ animation.name }}</span>
            <small>{{ animation.duration }}</small>
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

.compact-button {
  @apply min-h-[30px] cursor-pointer rounded-small border border-line-strong bg-surface-2 px-2.5 text-[13px] font-bold text-text transition-[border-color,color] duration-150;
}

.compact-button:hover {
  border-color: rgba(76, 201, 166, 0.65);
  @apply text-accent-strong;
}

.animation-list {
  @apply grid gap-2 px-3 pt-2.5 pb-3;
}

.animation-list button {
  @apply flex min-h-[42px] w-full cursor-pointer items-center justify-between gap-3 rounded-button border border-line bg-surface-2 px-2.5 py-2 text-left text-text transition-[border-color,background-color] duration-150;
}

.animation-list button:hover,
.animation-list button.active {
  border-color: rgba(76, 201, 166, 0.65);
  background: var(--color-animation-hover-bg);
}

.animation-list span {
  @apply min-w-0 font-bold wrap-anywhere;
}

.animation-list small {
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
