<script setup lang="ts">
import type { SceneNode } from '../types/glb-viewer'

defineProps<{
  hasModel: boolean
  sceneNodes: SceneNode[]
  visibleSceneNodes: SceneNode[]
  expandedNodeIds: Set<string>
  selectedNodeId: string
}>()

const nodeSearch = defineModel<string>('nodeSearch', { required: true })
const collapsed = defineModel<boolean>('collapsed', { default: false })

const emit = defineEmits<{
  'expand-all': []
  'collapse-all': []
  'toggle-expansion': [nodeId: string]
  'select-node': [nodeId: string]
}>()
</script>

<template>
  <aside
    class="scene-sidebar"
    :class="{ 'is-collapsed': collapsed }"
    aria-label="場景節點"
  >
    <button
      v-if="collapsed"
      class="sidebar-rail"
      type="button"
      aria-expanded="false"
      aria-controls="scene-sidebar-content"
      aria-label="展開場景側欄"
      @click="collapsed = false"
    >
      <svg class="sidebar-rail__chevron" aria-hidden="true" viewBox="0 0 12 12">
        <path d="M4.5 3 7.5 6 4.5 9" />
      </svg>
      <span class="sidebar-rail__label">場景</span>
    </button>

    <div v-show="!collapsed" id="scene-sidebar-content" class="sidebar-content">
      <section class="panel tree-panel">
        <div class="panel-heading">
          <span>場景</span>
          <div class="panel-heading__actions">
            <span class="node-count">{{ sceneNodes.length }}</span>
            <button
              class="sidebar-toggle"
              type="button"
              aria-expanded="true"
              aria-controls="scene-sidebar-content"
              aria-label="收合場景側欄"
              @click="collapsed = true"
            >
              <svg aria-hidden="true" viewBox="0 0 12 12">
                <path d="M7.5 3 4.5 6 7.5 9" />
              </svg>
            </button>
          </div>
        </div>

        <div class="scene-search">
          <input v-model="nodeSearch" type="search" placeholder="搜尋節點" aria-label="搜尋節點" />
        </div>

        <div class="tree-actions">
          <button type="button" @click="emit('expand-all')">展開</button>
          <button type="button" @click="emit('collapse-all')">收合</button>
        </div>

        <p v-if="!hasModel" class="tree-empty">載入模型後會顯示完整節點階層。</p>

        <div v-else class="node-tree" role="tree" aria-label="模型節點階層">
          <div
            v-for="node in visibleSceneNodes"
            :key="node.id"
            class="tree-row"
            :class="{ selected: selectedNodeId === node.id }"
            :style="{ paddingLeft: `${8 + node.depth * 14}px` }"
          >
            <button
              class="tree-toggle"
              :class="{ invisible: node.childIds.length === 0 }"
              type="button"
              :aria-label="expandedNodeIds.has(node.id) ? '收合節點' : '展開節點'"
              @click.stop="emit('toggle-expansion', node.id)"
            >
              <svg aria-hidden="true" viewBox="0 0 12 12">
                <path v-if="expandedNodeIds.has(node.id)" d="M3 4.5 6 7.5 9 4.5" />
                <path v-else d="M4.5 3 7.5 6 4.5 9" />
              </svg>
            </button>

            <button
              class="node-entry"
              type="button"
              role="treeitem"
              :aria-selected="selectedNodeId === node.id"
              :data-node-id="node.id"
              @click="emit('select-node', node.id)"
            >
              <span class="node-type">{{ node.type }}</span>
              <span class="node-name">{{ node.name }}</span>
            </button>
          </div>

          <p v-if="visibleSceneNodes.length === 0" class="tree-empty">沒有符合搜尋的節點。</p>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
@reference "../style.css";

.scene-sidebar {
  @apply flex max-h-[calc(100svh-72px)] min-w-0 flex-col gap-3 overflow-auto border-r border-line bg-surface p-3;
}

.scene-sidebar.is-collapsed {
  @apply gap-0 overflow-hidden p-0;
}

.sidebar-content {
  @apply flex min-h-0 min-w-0 flex-1 flex-col gap-3;
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

.panel-heading__actions {
  @apply flex items-center gap-2;
}

.panel {
  @apply min-w-0 overflow-hidden rounded-default border border-line bg-panel overflow-y-auto;
}

.tree-panel {
  @apply flex min-h-0 flex-1 flex-col;
}

.panel-heading {
  @apply flex min-h-[42px] items-center justify-between gap-2.5 border-b border-line px-3 py-2.5 text-[13px] font-extrabold uppercase text-text;
}

.node-count {
  @apply inline-flex min-h-6 items-center rounded-full border border-line-strong px-2 text-xs font-bold normal-case text-text-muted;
}

.scene-search {
  @apply px-2.5 pt-2.5 pb-2;
}

.scene-search input {
  @apply h-9 w-full rounded-button border border-line bg-surface-2 px-2.5 text-sm text-text;
}

.scene-search input::placeholder {
  @apply text-text-muted;
}

.tree-actions {
  @apply flex gap-2 px-2.5 pb-2.5;
}

.tree-actions button {
  @apply min-h-[30px] flex-1 cursor-pointer rounded-small border border-line bg-surface-2 text-[13px] font-bold text-text-soft transition-[border-color,color] duration-150;
}

.tree-actions button:hover {
  border-color: rgba(89, 168, 255, 0.65);
  color: #d9ebff;
}

.node-tree {
  @apply min-h-0 flex-1 overflow-auto px-1.5 pt-1 pb-2;
}

.tree-row {
  @apply flex h-[30px] min-w-0 items-center gap-[3px] rounded-segmented;
}

.tree-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.tree-row.selected {
  @apply bg-selected;
}

.tree-row.selected .node-entry,
.tree-row.selected .tree-toggle,
.tree-row.selected .node-type {
  @apply text-white;
}

.tree-toggle {
  @apply inline-grid h-6 w-[18px] shrink-0 cursor-pointer place-items-center rounded-tree bg-transparent p-0 text-text-muted transition-[background-color,color] duration-150;
}

.tree-toggle.invisible {
  @apply pointer-events-none invisible;
}

.tree-toggle:hover {
  @apply text-text;
  background: rgba(255, 255, 255, 0.07);
}

.tree-toggle svg {
  @apply h-3 w-3 fill-none stroke-current;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.node-entry {
  @apply grid h-[30px] w-full min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-[7px] bg-transparent pr-2 pl-0 text-left text-text transition-[border-color,background-color,color] duration-150;
}

.node-type {
  @apply text-[11px] leading-none text-text-muted;
}

.node-name {
  @apply min-w-0 overflow-hidden text-sm leading-tight text-ellipsis whitespace-nowrap;
}

.tree-empty {
  @apply m-0 p-3 text-left text-sm text-text-muted;
}

.scene-sidebar,
.panel,
.node-tree {
  scrollbar-width: thin;
  scrollbar-color: #9ba8b4 var(--color-surface-2);
}

.scene-sidebar::-webkit-scrollbar,
.panel::-webkit-scrollbar,
.node-tree::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.scene-sidebar::-webkit-scrollbar-track,
.panel::-webkit-scrollbar-track,
.node-tree::-webkit-scrollbar-track {
  background: var(--color-surface-2);
}

.scene-sidebar::-webkit-scrollbar-thumb,
.panel::-webkit-scrollbar-thumb,
.node-tree::-webkit-scrollbar-thumb {
  background: #9ba8b4;
  border-radius: 999px;
}

.scene-sidebar::-webkit-scrollbar-thumb:hover,
.panel::-webkit-scrollbar-thumb:hover,
.node-tree::-webkit-scrollbar-thumb:hover {
  background: #c8d1d9;
}

@media (max-width: 980px) {
  .scene-sidebar {
    @apply order-2 max-h-[min(360px,42svh)] border-t border-r-0;
  }

  .scene-sidebar.is-collapsed {
    max-height: var(--sidebar-rail-width, 44px);
  }

  .sidebar-rail {
    @apply min-h-[44px] flex-row justify-center px-3 py-1;
  }

  .sidebar-rail__label {
    writing-mode: horizontal-tb;
  }
}
</style>
