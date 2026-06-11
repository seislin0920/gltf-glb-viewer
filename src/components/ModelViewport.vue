<script setup lang="ts">
import { ref } from 'vue'
import type { BackgroundMode } from '../types/glb-viewer'

defineProps<{
  rendererReady: boolean
  hasModel: boolean
  loading: boolean
  loadProgress: string
  isDragging: boolean
  gridVisible: boolean
  wireframeVisible: boolean
  backgroundMode: BackgroundMode
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  'reset-camera': []
  'toggle-grid': []
  'toggle-wireframe': []
  'set-background-mode': [mode: BackgroundMode]
  'pick-files': []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)

defineExpose({
  canvasRef,
  viewportRef,
})
</script>

<template>
  <section
    ref="viewportRef"
    class="viewport"
    :class="{ 'is-dragging': isDragging, 'has-model': hasModel }"
    aria-label="3D 模型檢視區"
  >
    <canvas
      ref="canvasRef"
      @pointerdown="emit('pointerdown', $event)"
      @pointerup="emit('pointerup', $event)"
    ></canvas>

    <div v-if="rendererReady" class="viewer-toolbar" aria-label="檢視控制">
      <button
        class="icon-button"
        type="button"
        title="重設視角"
        aria-label="重設視角"
        @click="emit('reset-camera')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 12a8 8 0 1 1 2.34 5.66" />
          <path d="M4 18v-6h6" />
        </svg>
      </button>

      <button
        class="icon-button"
        type="button"
        title="顯示或隱藏格線"
        aria-label="顯示或隱藏格線"
        :aria-pressed="gridVisible"
        @click="emit('toggle-grid')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 4h16v16H4z" />
          <path d="M4 10h16M4 16h16M10 4v16M16 4v16" />
        </svg>
      </button>

      <button
        class="icon-button"
        type="button"
        title="線框模式"
        aria-label="線框模式"
        :aria-pressed="wireframeVisible"
        @click="emit('toggle-wireframe')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z" />
          <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
        </svg>
      </button>

      <div class="segmented" role="group" aria-label="背景模式">
        <button
          type="button"
          :class="{ active: backgroundMode === 'studio' }"
          @click="emit('set-background-mode', 'studio')"
        >
          暗
        </button>
        <button
          type="button"
          :class="{ active: backgroundMode === 'light' }"
          @click="emit('set-background-mode', 'light')"
        >
          亮
        </button>
        <button
          type="button"
          :class="{ active: backgroundMode === 'transparent' }"
          @click="emit('set-background-mode', 'transparent')"
        >
          透
        </button>
      </div>
    </div>

    <div v-if="!hasModel && !loading" class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path d="M16 3 27 9v14l-11 6-11-6V9l11-6z" />
          <path d="M16 16 5 9M16 16l11-7M16 16v13" />
        </svg>
      </div>
      <h2>拖放 GLB / GLTF 到這裡</h2>
      <p>GLTF 若有外部 .bin 或貼圖，請同一次選取或拖放。</p>
      <button class="secondary-button" type="button" @click="emit('pick-files')">選擇本機檔案</button>
    </div>

    <div v-if="isDragging" class="drop-mask">
      <div>
        <strong>放開以上傳模型</strong>
        <span>支援 .glb、.gltf 與同批資源檔</span>
      </div>
    </div>

    <div v-if="loading" class="status-mask" role="status">
      <div class="spinner" aria-hidden="true"></div>
      <span>{{ loadProgress || '載入中' }}</span>
    </div>
  </section>
</template>

<style scoped>
@reference "../style.css";

.viewport {
  @apply relative min-h-[calc(100svh-72px)] min-w-0 overflow-hidden bg-viewport;
}

.viewport canvas {
  @apply absolute inset-0 block h-full w-full;
}

.viewer-toolbar {
  @apply absolute top-3.5 left-3.5 z-3 flex items-center gap-2 rounded-default border p-2;
  border-color: rgba(143, 158, 173, 0.25);
  background: rgba(18, 23, 29, 0.84);
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(14px);
}

.icon-button,
.segmented button,
.secondary-button {
  @apply cursor-pointer transition-[border-color,background-color,color,transform] duration-150;
}

.icon-button {
  @apply inline-grid h-[38px] w-[38px] place-items-center rounded-button border border-line-strong bg-surface-2 text-text-soft;
}

.icon-button:hover,
.icon-button[aria-pressed='true'] {
  border-color: rgba(76, 201, 166, 0.7);
  background: var(--color-accent-hover-bg);
  @apply text-accent-strong;
}

.icon-button svg,
.empty-icon svg {
  @apply h-5 w-5 fill-none stroke-current;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.segmented {
  @apply inline-flex h-[38px] items-center gap-[3px] rounded-button border border-line-strong bg-surface p-[3px];
}

.segmented button {
  @apply h-[30px] min-w-[34px] rounded-segmented bg-transparent px-[9px] text-[13px] text-text-muted;
}

.segmented button:hover,
.segmented button.active {
  @apply bg-surface-3 text-text;
}

.secondary-button {
  @apply inline-flex min-h-10 items-center justify-center gap-2 rounded-default border border-line-strong bg-surface-2 px-3.5 font-bold whitespace-nowrap text-text;
}

.secondary-button:hover {
  border-color: rgba(76, 201, 166, 0.65);
  background: var(--color-secondary-hover-bg);
  @apply text-accent-strong;
}

.empty-state,
.drop-mask,
.status-mask {
  @apply absolute inset-0 z-2 grid place-items-center p-6 text-center;
}

.empty-state {
  @apply content-center gap-3 bg-viewport;
}

.empty-icon {
  @apply grid h-[74px] w-[74px] place-items-center rounded-default border text-accent-strong;
  border-color: rgba(76, 201, 166, 0.34);
  background: var(--color-brand-mark-bg);
}

.empty-icon svg {
  @apply h-[38px] w-[38px];
}

.empty-state h2 {
  @apply mt-[5px] mb-0 text-2xl leading-tight text-text;
}

.empty-state p {
  @apply mt-0 mb-1.5 max-w-[430px] text-sm text-text-muted;
}

.drop-mask {
  @apply z-5 border-2 border-accent;
  background: rgba(10, 20, 18, 0.82);
  backdrop-filter: blur(8px);
}

.drop-mask > div {
  @apply grid gap-1 rounded-default border px-[22px] py-[18px] text-text;
  border-color: rgba(76, 201, 166, 0.45);
  background: var(--color-drop-mask-bg);
}

.drop-mask strong {
  @apply text-lg;
}

.drop-mask span {
  @apply text-sm text-text-muted;
}

.status-mask {
  @apply z-4 gap-3 text-text;
  background: rgba(13, 17, 23, 0.72);
  backdrop-filter: blur(7px);
}

.spinner {
  @apply h-[34px] w-[34px] animate-spin rounded-full border-[3px] border-white/20;
  border-top-color: var(--color-accent-strong);
}

@media (max-width: 980px) {
  .viewport {
    @apply order-1 min-h-[62svh];
  }
}

@media (max-width: 560px) {
  .viewer-toolbar {
    @apply top-2.5 right-2.5 left-2.5 flex-wrap;
  }

  .empty-state h2 {
    @apply text-xl;
  }
}
</style>
