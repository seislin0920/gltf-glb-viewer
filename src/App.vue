<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

const MIN_SIDEBAR_LEFT_WIDTH = 240
const MAX_SIDEBAR_LEFT_WIDTH = 720
import AppHeader from './components/AppHeader.vue'
import ModelInspector from './components/ModelInspector.vue'
import ModelViewport from './components/ModelViewport.vue'
import SceneSidebar from './components/SceneSidebar.vue'
import { useGlbViewer } from './composables/useGlbViewer'

const modelViewportRef = ref<InstanceType<typeof ModelViewport> | null>(null)
const sceneSidebarCollapsed = ref(false)
const inspectorCollapsed = ref(false)
const sidebarLeftWidth = ref(400)
const isResizingLeftSidebar = ref(false)

function startLeftSidebarResize(event: PointerEvent) {
  if (sceneSidebarCollapsed.value) {
    return
  }

  event.preventDefault()

  const startX = event.clientX
  const startWidth = sidebarLeftWidth.value
  isResizingLeftSidebar.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const nextWidth = startWidth + (moveEvent.clientX - startX)
    sidebarLeftWidth.value = Math.min(
      MAX_SIDEBAR_LEFT_WIDTH,
      Math.max(MIN_SIDEBAR_LEFT_WIDTH, nextWidth),
    )
  }

  const handlePointerUp = () => {
    isResizingLeftSidebar.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

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
  activeAnimationIndices,
  selectedAnimationIndex,
  selectedAnimationDetail,
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
  exportFileName,
  canApplyRotorAnimation,
  applyingRotorAnimation,
  applyingRotorAnimationChanges,
  removingAnimation,
  nodeColorMode,
  nodeColorHex,
  nodeColorTextureFile,
  nodeColorTargetList,
  canApplyNodeColor,
  canRevertNodeColor,
  applyingNodeColor,
  revertingNodeColor,
  wingAnalysis,
  wingMeshOptions,
  wingUnboundMeshOptions,
  wingBoundMeshLabels,
  wingLandmarkProgress,
  wingLandmarkSteps,
  wingLandmarkModeEnabled,
  wingWorkflowMode,
  wingRigReady,
  wingPivotReady,
  wingPresetReady,
  wingWeightOptions,
  wingWeightScaleHint,
  wingWeightHeatmapEnabled,
  wingPresetOptions,
  wingAnimationOptions,
  applyingWingPivot,
  applyingWingRig,
  applyingWingPreset,
  leftWingNodeId,
  rightWingNodeId,
  wingRigTargetNodeId,
  wingPresetName,
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
  selectAnimation,
  toggleAnimationPlayback,
  updateAnimationSettings,
  updateRotorAnimationTarget,
  detectRotorAnimationTarget,
  applyRotorAnimationChanges,
  removeAnimation,
  toggleNodeExpansion,
  expandAllNodes,
  collapseAllNodes,
  selectNode,
  toggleNodeSelection,
  updateRotorTargetConfig,
  detectRotorPivotAxis,
  applyRotorAnimation,
  setNodeColorTextureFile,
  applyNodeColor,
  revertNodeColor,
  toggleWingLandmarkMode,
  setWingLandmarkStep,
  clearWingLandmarks,
  setWingWorkflowMode,
  applyWingPivotAnimation,
  applyWingRig,
  applyWingPreset,
  updateWingAnimationOptions,
  updateWingWeightOptions,
  recomputeWingSkinWeights,
  toggleWingWeightHeatmap,
} = useGlbViewer()

void fileInputRef

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
        'is-resizing-left-sidebar': isResizingLeftSidebar,
      }"
      :style="
        sceneSidebarCollapsed
          ? undefined
          : { '--sidebar-left-width': `${sidebarLeftWidth}px` }
      "
    >
      <div class="workspace-left">
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

        <div
          v-if="!sceneSidebarCollapsed"
          class="sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="調整場景側欄寬度"
          @pointerdown="startLeftSidebarResize"
        />
      </div>

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
        :active-animation-indices="activeAnimationIndices"
        :selected-animation-index="selectedAnimationIndex"
        :selected-animation-detail="selectedAnimationDetail"
        v-model:rotor-animation-name="rotorAnimationName"
        v-model:export-file-name="exportFileName"
        :rotor-target-config-list="rotorTargetConfigList"
        :can-apply-rotor-animation="canApplyRotorAnimation"
        :applying-rotor-animation="applyingRotorAnimation"
        :applying-rotor-animation-changes="applyingRotorAnimationChanges"
        :removing-animation="removingAnimation"
        v-model:node-color-mode="nodeColorMode"
        v-model:node-color-hex="nodeColorHex"
        :node-color-texture-file="nodeColorTextureFile"
        :node-color-target-list="nodeColorTargetList"
        :can-apply-node-color="canApplyNodeColor"
        :can-revert-node-color="canRevertNodeColor"
        :applying-node-color="applyingNodeColor"
        :reverting-node-color="revertingNodeColor"
        :wing-analysis="wingAnalysis"
        :wing-mesh-options="wingMeshOptions"
        :wing-unbound-mesh-options="wingUnboundMeshOptions"
        :wing-bound-mesh-labels="wingBoundMeshLabels"
        :wing-landmark-progress="wingLandmarkProgress"
        :wing-landmark-steps="wingLandmarkSteps"
        :wing-landmark-mode-enabled="wingLandmarkModeEnabled"
        :wing-workflow-mode="wingWorkflowMode"
        :wing-rig-ready="wingRigReady"
        :wing-pivot-ready="wingPivotReady"
        :wing-preset-ready="wingPresetReady"
        :wing-weight-options="wingWeightOptions"
        :wing-weight-scale-hint="wingWeightScaleHint"
        :wing-weight-heatmap-enabled="wingWeightHeatmapEnabled"
        :wing-preset-options="wingPresetOptions"
        :wing-animation-options="wingAnimationOptions"
        :applying-wing-pivot="applyingWingPivot"
        :applying-wing-rig="applyingWingRig"
        :applying-wing-preset="applyingWingPreset"
        v-model:left-wing-node-id="leftWingNodeId"
        v-model:right-wing-node-id="rightWingNodeId"
        v-model:wing-rig-target-node-id="wingRigTargetNodeId"
        v-model:wing-preset-name="wingPresetName"
        @toggle-animation-playback="toggleAnimationPlayback"
        @select-animation="selectAnimation"
        @play-animation="playAnimation"
        @update-animation-settings="updateAnimationSettings"
        @update-rotor-animation-target="updateRotorAnimationTarget"
        @detect-rotor-animation-target="detectRotorAnimationTarget"
        @apply-rotor-animation-changes="applyRotorAnimationChanges"
        @remove-animation="removeAnimation"
        @update:model-position="setModelPosition"
        @update:selected-node-rotation="setSelectedNodeRotation"
        @reset-model-position="resetModelPosition"
        @export-model="exportModel"
        @update-rotor-config="updateRotorTargetConfig"
        @detect-rotor="detectRotorPivotAxis"
        @apply-rotor-animation="applyRotorAnimation"
        @node-color-texture-selected="setNodeColorTextureFile"
        @apply-node-color="applyNodeColor"
        @revert-node-color="revertNodeColor"
        @toggle-wing-landmark-mode="toggleWingLandmarkMode"
        @select-wing-landmark-step="setWingLandmarkStep"
        @clear-wing-landmarks="clearWingLandmarks"
        @wing-workflow-mode-change="setWingWorkflowMode"
        @apply-wing-pivot="applyWingPivotAnimation"
        @apply-wing-rig="applyWingRig"
        @apply-wing-preset="applyWingPreset"
        @update:wing-animation-options="updateWingAnimationOptions"
        @update:wing-weight-options="updateWingWeightOptions"
        @toggle-wing-weight-heatmap="toggleWingWeightHeatmap"
        @recompute-wing-weights="recomputeWingSkinWeights"
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
  --sidebar-left-width: 400px;
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

.workspace-left {
  @apply relative flex min-h-0 min-w-0;
}

.sidebar-resize-handle {
  @apply absolute top-0 right-0 z-20 h-full w-1.5 touch-none;
  transform: translateX(50%);
  cursor: col-resize;
}

.sidebar-resize-handle::after {
  content: '';
  @apply absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors duration-150;
}

.sidebar-resize-handle:hover::after,
.workspace.is-resizing-left-sidebar .sidebar-resize-handle::after {
  @apply bg-accent;
}

.sr-only {
  @apply absolute -m-px h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 1220px) {
  .workspace {
    --sidebar-left-width: 450px;
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

  .sidebar-resize-handle {
    @apply hidden;
  }
}
</style>
