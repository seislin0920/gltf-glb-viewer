<script setup lang="ts">
import { computed, ref } from "vue";
import type { NodeColorMode } from "../types/glb-viewer";

const props = defineProps<{
  targets: Array<{ nodeId: string; nodeName: string; hasDirectMesh: boolean }>;
  textureFile: File | null;
  canApply: boolean;
  canRevert: boolean;
  applying: boolean;
  reverting: boolean;
}>();

const mode = defineModel<NodeColorMode>("mode", { required: true });
const colorHex = defineModel<string>("colorHex", { required: true });

const emit = defineEmits<{
  "texture-selected": [file: File | null];
  apply: [];
  revert: [];
}>();

const textureInputRef = ref<HTMLInputElement | null>(null);
const textureFileName = computed(() => props.textureFile?.name ?? "");

function setMode(nextMode: NodeColorMode) {
  mode.value = nextMode;
}

function openTexturePicker() {
  textureInputRef.value?.click();
}

function handleTextureChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  emit("texture-selected", file);
  input.value = "";
}
</script>

<template>
  <section>
    <div class="panel-heading">
      <span>節點上色</span>
      <span v-if="canRevert" class="target-count">已套用</span>
      <span v-else-if="targets.length > 0" class="target-count">
        {{ targets.length }} 個目標
      </span>
    </div>

    <p v-if="targets.length === 0 && !canRevert" class="empty-hint muted">
      請在左側場景樹或 3D 視圖中選取節點，再選擇顏色或貼圖套用。
    </p>

    <div v-if="canRevert" class="applied-state">
      <p class="muted">最近一次上色已套用，可取消還原或繼續套用新的顏色/貼圖。</p>
      <button
        class="remove-button"
        type="button"
        :disabled="reverting || applying"
        @click="emit('revert')"
      >
        {{ reverting ? "還原中…" : "取消此次套用" }}
      </button>
    </div>

    <template v-if="targets.length > 0">
      <div class="field-group panel-body">
        <span class="field-label">模式</span>
        <div class="mode-row">
          <label>
            <input
              type="radio"
              name="node-color-mode"
              :checked="mode === 'color'"
              @change="setMode('color')"
            />
            顏色
          </label>
          <label>
            <input
              type="radio"
              name="node-color-mode"
              :checked="mode === 'texture'"
              @change="setMode('texture')"
            />
            貼圖
          </label>
        </div>
      </div>

      <div v-if="mode === 'color'" class="field-group panel-body">
        <span class="field-label">顏色</span>
        <div class="color-row">
          <input v-model="colorHex" class="color-input" type="color" />
          <code class="color-preview">{{ colorHex }}</code>
        </div>
      </div>

      <div v-else class="field-group panel-body">
        <span class="field-label">貼圖</span>
        <input
          ref="textureInputRef"
          class="sr-only"
          type="file"
          accept="image/*"
          @change="handleTextureChange"
        />
        <button
          class="compact-button pick-texture-button"
          type="button"
          @click="openTexturePicker"
        >
          選擇圖片
        </button>
        <p v-if="textureFileName" class="texture-name">{{ textureFileName }}</p>
        <p v-else class="muted">尚未選擇圖片</p>
      </div>

      <div class="target-list">
        <article
          v-for="target in targets"
          :key="target.nodeId"
          class="target-card"
        >
          <div class="target-card__header">
            <span>{{ target.nodeName }}</span>
            <small v-if="target.hasDirectMesh" class="ok-label">可上色</small>
            <small v-else class="warn-label">此節點無 Mesh</small>
          </div>
        </article>
      </div>

      <div class="apply-row">
        <button
          class="export-button"
          type="button"
          :disabled="!canApply || applying || reverting"
          @click="emit('apply')"
        >
          {{ applying ? "套用中…" : "套用上色" }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
@reference "../style.css";

.panel {
  @apply rounded-default border border-line bg-panel;
}

.panel-heading {
  @apply flex items-center justify-between gap-2 border-b border-line px-2.5 py-2 text-sm font-extrabold uppercase text-text;
}

.target-count {
  @apply text-xs font-bold normal-case text-accent;
}

.panel-body {
  @apply px-2.5 pt-2.5;
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

.color-row {
  @apply flex items-center gap-2.5;
}

.color-input {
  @apply h-10 w-14 cursor-pointer rounded-small border border-line bg-surface p-1;
}

.color-preview {
  @apply text-xs text-text-muted;
}

.compact-button {
  @apply min-h-[30px] w-fit cursor-pointer rounded-small border border-line-strong bg-surface px-2.5 text-xs font-bold text-text;
}

.pick-texture-button {
  @apply min-h-[34px] px-3 text-[13px];
}

.texture-name {
  @apply m-0 text-xs text-text-soft;
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
  @apply flex items-center justify-between gap-2 px-2.5 py-2 text-sm font-bold text-text;
}

.ok-label {
  @apply text-xs font-normal text-accent;
}

.warn-label {
  @apply text-xs font-normal text-warn;
}

.apply-row {
  @apply flex flex-col gap-2 border-t border-line px-2.5 py-2.5;
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

.empty-hint {
  @apply m-0 px-2.5 py-2.5 text-sm;
}

.sr-only {
  @apply absolute -m-px h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap;
  clip: rect(0, 0, 0, 0);
}
</style>
