<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import ModelInspector from './components/ModelInspector.vue'
import ModelViewport from './components/ModelViewport.vue'
import SceneSidebar from './components/SceneSidebar.vue'
import { useGlbViewer } from './composables/useGlbViewer'

const modelViewportRef = ref<InstanceType<typeof ModelViewport> | null>(null)
const sceneSidebarCollapsed = ref(false)
const inspectorCollapsed = ref(false)

const {
  fileInputRef,
  loading,
  exporting,
  loadProgress,
  errorMessage,
  isDragging,
  rendererReady,
  hasModel,
  gridVisible,
  wireframeVisible,
  backgroundMode,
  isAnimationPlaying,
  activeAnimationIndex,
  stats,
  sceneNodes,
  expandedNodeIds,
  selectedNodeId,
  selectedNodeIds,
  nodeSearch,
  visibleSceneNodes,
  selectedNodeDetails,
  moveModeEnabled,
  modelPosition,
  selectedNodeRotation,
  rotorTargetConfigList,
  rotorAnimationName,
  rotorAnimationApplied,
  hasImportedAnimations,
  canApplyRotorAnimation,
  applyingRotorAnimation,
  removingRotorAnimation,
  bindViewportRefs,
  pickFiles,
  handleFileInput,
  handleDragEnter,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleCanvasPointerDown,
  handleCanvasPointerUp,
  resetCamera,
  toggleMoveMode,
  setModelPosition,
  resetModelPosition,
  exportModel,
  setSelectedNodeRotation,
  toggleGrid,
  toggleWireframe,
  setBackgroundMode,
  playAnimation,
  toggleAnimationPlayback,
  toggleNodeExpansion,
  expandAllNodes,
  collapseAllNodes,
  selectNode,
  toggleNodeSelection,
  updateRotorTargetConfig,
  detectRotorPivotAxis,
  applyRotorAnimation,
  removeRotorAnimation,
} = useGlbViewer()

onMounted(async () => {
  await nextTick()
  const viewport = modelViewportRef.value

  if (viewport) {
    bindViewportRefs(viewport.canvasRef, viewport.viewportRef)
  }
})
</script>

<template>
  <div
    class="app-shell"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <input
      ref="fileInputRef"
      class="sr-only"
      type="file"
      multiple
      accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp"
      @change="handleFileInput"
    />

    <AppHeader @pick-files="pickFiles" />

    <main
      class="workspace"
      :class="{
        'scene-sidebar-collapsed': sceneSidebarCollapsed,
        'inspector-collapsed': inspectorCollapsed,
      }"
    >
      <SceneSidebar
        v-model:collapsed="sceneSidebarCollapsed"
        :has-model="hasModel"
        :scene-nodes="sceneNodes"
        :visible-scene-nodes="visibleSceneNodes"
        v-model:node-search="nodeSearch"
        :expanded-node-ids="expandedNodeIds"
        :selected-node-id="selectedNodeId"
        :selected-node-ids="selectedNodeIds"
        @expand-all="expandAllNodes"
        @collapse-all="collapseAllNodes"
        @toggle-expansion="toggleNodeExpansion"
        @select-node="(nodeId, additive) => selectNode(nodeId, false, additive)"
        @toggle-node-selection="(nodeId) => toggleNodeSelection(nodeId, true)"
      />

      <ModelViewport
        ref="modelViewportRef"
        :renderer-ready="rendererReady"
        :has-model="hasModel"
        :loading="loading"
        :load-progress="loadProgress"
        :is-dragging="isDragging"
        :move-mode-enabled="moveModeEnabled"
        :grid-visible="gridVisible"
        :wireframe-visible="wireframeVisible"
        :background-mode="backgroundMode"
        @pointerdown="handleCanvasPointerDown"
        @pointerup="handleCanvasPointerUp"
        @reset-camera="resetCamera"
        @toggle-move-mode="toggleMoveMode"
        @toggle-grid="toggleGrid"
        @toggle-wireframe="toggleWireframe"
        @set-background-mode="setBackgroundMode"
        @pick-files="pickFiles"
      />

      <ModelInspector
        v-model:collapsed="inspectorCollapsed"
        :loading="loading"
        :exporting="exporting"
        :has-model="hasModel"
        :error-message="errorMessage"
        :model-position="modelPosition"
        :selected-node-rotation="selectedNodeRotation"
        :selected-node-details="selectedNodeDetails"
        :stats="stats"
        :is-animation-playing="isAnimationPlaying"
        :active-animation-index="activeAnimationIndex"
        v-model:rotor-animation-name="rotorAnimationName"
        :rotor-target-config-list="rotorTargetConfigList"
        :has-imported-animations="hasImportedAnimations"
        :rotor-animation-applied="rotorAnimationApplied"
        :can-apply-rotor-animation="canApplyRotorAnimation"
        :applying-rotor-animation="applyingRotorAnimation"
        :removing-rotor-animation="removingRotorAnimation"
        @toggle-animation-playback="toggleAnimationPlayback"
        @play-animation="playAnimation"
        @update:model-position="setModelPosition"
        @update:selected-node-rotation="setSelectedNodeRotation"
        @reset-model-position="resetModelPosition"
        @export-model="exportModel"
        @update-rotor-config="updateRotorTargetConfig"
        @detect-rotor="detectRotorPivotAxis"
        @apply-rotor-animation="applyRotorAnimation"
        @remove-rotor-animation="removeRotorAnimation"
      />
    </main>
  </div>
</template>

<style scoped>
@reference "./style.css";

.app-shell {
  @apply grid min-h-svh bg-bg;
  grid-template-rows: auto minmax(0, 1fr);
}

.workspace {
  --sidebar-left-width: 300px;
  --sidebar-right-width: 340px;
  --sidebar-rail-width: 44px;
  @apply grid min-h-0;
  grid-template-columns: var(--sidebar-left-width) minmax(0, 1fr) var(--sidebar-right-width);
  transition: grid-template-columns 200ms ease;
}

.workspace.scene-sidebar-collapsed {
  --sidebar-left-width: var(--sidebar-rail-width);
}

.workspace.inspector-collapsed {
  --sidebar-right-width: var(--sidebar-rail-width);
}

.sr-only {
  @apply absolute -m-px h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 1220px) {
  .workspace {
    --sidebar-left-width: 260px;
    --sidebar-right-width: 320px;
  }
}

@media (max-width: 980px) {
  .app-shell {
    @apply min-h-svh;
  }

  .workspace {
    @apply flex flex-col;
  }
}
</style>
