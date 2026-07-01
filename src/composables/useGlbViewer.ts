import {
  computed,
  isRef,
  onBeforeUnmount,
  ref,
  shallowRef,
  unref,
  watch,
  type MaybeRef,
} from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ViewHelper } from "three/examples/jsm/helpers/ViewHelper.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { SpecularGlossinessCompatibilityPlugin } from "../lib/specularGlossinessPlugin";
import {
  deriveExportedFileName,
  normalizeExportFileName,
  exportObjectAsGlb,
  prepareAnimationClipsForExport,
} from "../lib/exportGlb";
import {
  buildErrorMessage,
  collectMaterialTextures,
  createResourceSet,
  findPrimaryModelFile,
  formatBytes,
  formatDecimal,
  formatDimension,
  formatInteger,
  formatRotationDegrees,
  formatTransformVector,
  getFileKey,
  getModelFormat,
  getObjectName,
  getObjectType,
  isMesh,
  isTreeNodeVisible,
  resolveResourceUrl,
  revokeUrls,
  summarizeObject,
  toMaterialArray,
} from "../lib/modelUtils";
import {
  addRotorAnimationBatch,
  createDefaultRotorTargetConfig,
  DEFAULT_ANIMATION_NAME,
  estimatePivotAndAxis,
  createPivotForTarget,
  rebuildRotorAnimationClip,
  removeRotorClipPivots,
  resolveTargetConfig,
  resetRotorPivotsToBindPose,
  validateRotorTarget,
} from "../lib/addRotorAnimation";
import { analyzeBirdModel } from "../lib/wing-rigging/analyzeBirdModel";
import { applyWingRigToMesh } from "../lib/wing-rigging/applyWingRig";
import { buildBirdSkeleton } from "../lib/wing-rigging/buildBirdSkeleton";
import { computeWingSkinWeights } from "../lib/wing-rigging/computeWingSkinWeights";
import { createFlapClipForPivot } from "../lib/wing-rigging/createFlapClipForPivot";
import { presetToAnimationClip } from "../lib/wing-rigging/presetToClip";
import {
  applyWeightHeatmap,
  disposeWeightHeatmap,
  removeWeightHeatmap,
} from "../lib/wing-rigging/visualizeWingSkinWeights";
import { buildWingWeightScaleHint } from "../lib/wing-rigging/resolveWingWeightScale";
import { wingFlapPresets } from "../lib/wing-rigging/wingFlapPresets";
import {
  applyNodeColor as applyNodeColorToMeshes,
  collectDirectMeshes,
  disposeAllNodeColorBatches,
  revertNodeColorBatch,
  type NodeColorBatch,
} from "../lib/applyNodeColor";
import type {
  BirdModelAnalysis,
  WingAnimationOptions,
  WingLandmarkId,
  WingLandmarks,
  WingWeightOptions,
  WingWeightScaleHint,
  WingWorkflowMode,
} from "../types/wing-rigging";
import { DEFAULT_WING_WEIGHT_OPTIONS, WING_LANDMARK_STEPS } from "../types/wing-rigging";
import type {
  AnimationClipSettings,
  AnimationLoopMode,
  BackgroundMode,
  ModelStats,
  NodeColorMode,
  RotorClipRecord,
  RotorClipTargetRecord,
  RotorTargetConfig,
  SceneNode,
  SelectedAnimationDetail,
  SelectedNodeDetails,
  Vector3Values,
} from "../types/glb-viewer";

type StoredAnimationClipMeta = AnimationClipSettings & {
  rotor?: RotorClipRecord;
};

function createDefaultClipMeta(
  source: AnimationClipSettings["source"],
): StoredAnimationClipMeta {
  return {
    source,
    timeScale: 1,
    loopMode: source === "rotor" ? "repeat" : "repeat",
  };
}

export function useGlbViewer() {
  const canvasRef = shallowRef<HTMLCanvasElement | null>(null);
  const viewportRef = shallowRef<HTMLElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  const loading = ref(false);
  const exporting = ref(false);
  const loadProgress = ref("");
  const errorMessage = ref("");
  const isDragging = ref(false);
  const rendererReady = ref(false);
  const modelLoaded = ref(false);
  const gridVisible = ref(true);
  const wireframeVisible = ref(false);
  const backgroundMode = ref<BackgroundMode>("studio");
  const isAnimationPlaying = ref(false);
  const activeAnimationIndices = ref<Set<number>>(new Set());
  const selectedAnimationIndex = ref<number | null>(null);
  const animationClipMeta = ref<Map<string, StoredAnimationClipMeta>>(new Map());
  const stats = ref<ModelStats | null>(null);
  const animationClips = ref<THREE.AnimationClip[]>([]);
  const importedAnimationClips = ref<THREE.AnimationClip[]>([]);
  const sceneNodes = ref<SceneNode[]>([]);
  const expandedNodeIds = ref<Set<string>>(new Set());
  const selectedNodeId = ref("");
  const selectedNodeIds = ref<Set<string>>(new Set());
  const rotorTargetConfigs = ref<Record<string, RotorTargetConfig>>({});
  const rotorAnimationName = ref(DEFAULT_ANIMATION_NAME);
  const exportFileName = ref("");
  const hasImportedAnimations = ref(false);
  const applyingRotorAnimation = ref(false);
  const applyingRotorAnimationChanges = ref(false);
  const removingAnimation = ref(false);
  const nodeColorMode = ref<NodeColorMode>("color");
  const nodeColorHex = ref("#000000");
  const nodeColorTextureFile = ref<File | null>(null);
  const nodeColorBatches = ref<NodeColorBatch[]>([]);
  const applyingNodeColor = ref(false);
  const revertingNodeColor = ref(false);
  const wingAnalysis = ref<BirdModelAnalysis | null>(null);
  const leftWingNodeId = ref("");
  const rightWingNodeId = ref("");
  const wingRigTargetNodeId = ref("");
  const wingPresetName = ref(wingFlapPresets[0]?.name ?? "slow_flap");
  const wingAnimationOptions = ref<WingAnimationOptions>({
    speedMultiplier: 1,
    amplitudeMultiplier: 1,
    mirrorRight: true,
    loopMode: "repeat",
  });
  const wingLandmarks = ref<Partial<WingLandmarks>>({});
  const wingLandmarkIndex = ref(0);
  const wingLandmarkModeEnabled = ref(false);
  const wingWorkflowMode = ref<WingWorkflowMode>("full-rig");
  const wingRigReady = ref(false);
  const wingPivotReady = ref(false);
  const wingWeightOptions = ref<WingWeightOptions>({
    ...DEFAULT_WING_WEIGHT_OPTIONS,
  });
  const wingWeightHeatmapEnabled = ref(false);
  const applyingWingPivot = ref(false);
  const applyingWingRig = ref(false);
  const applyingWingPreset = ref(false);
  const nodeSearch = ref("");
  const moveModeEnabled = ref(false);
  const modelPosition = ref<Vector3Values>({ x: 0, y: 0, z: 0 });
  const selectedNodeRotation = ref<Vector3Values | null>(null);

  const hasModel = computed(() => modelLoaded.value);
  const sceneNodeById = computed(
    () => new Map(sceneNodes.value.map((node) => [node.id, node])),
  );
  const selectedNode = computed(
    () => sceneNodeById.value.get(selectedNodeId.value) ?? null,
  );
  const visibleSceneNodes = computed(() => {
    const query = nodeSearch.value.trim().toLowerCase();
    const nodes = sceneNodes.value;
    const byId = sceneNodeById.value;

    if (query) {
      return nodes.filter((node) => {
        return (
          node.name.toLowerCase().includes(query) ||
          node.type.toLowerCase().includes(query) ||
          node.path.toLowerCase().includes(query)
        );
      });
    }

    return nodes.filter((node) =>
      isTreeNodeVisible(node, byId, expandedNodeIds.value),
    );
  });
  const selectedNodeDetails = computed<SelectedNodeDetails | null>(() => {
    modelPosition.value;
    selectedNodeRotation.value;

    const node = selectedNode.value;

    if (!node) {
      return null;
    }

    const object = objectByNodeId.get(node.id);

    if (!object) {
      return null;
    }

    const summary = summarizeObject(object);

    return {
      name: node.name,
      type: node.type,
      path: node.path,
      meshCount: summary.meshCount,
      triangleCount: formatInteger(summary.triangleCount),
      dimensions: summary.dimensions,
      transform: {
        position: formatTransformVector(object.position),
        rotation: formatRotationDegrees(object.rotation),
        scale: formatTransformVector(object.scale),
      },
    };
  });
  const hasExistingAnimations = computed(() => animationClips.value.length > 0);
  const canApplyRotorAnimation = computed(
    () => selectedNodeIds.value.size > 0 && !applyingRotorAnimation.value,
  );
  const selectedAnimationDetail = computed<SelectedAnimationDetail | null>(() => {
    const index = selectedAnimationIndex.value;
    if (index === null) {
      return null;
    }

    const clip = animationClips.value[index];
    if (!clip) {
      return null;
    }

    const meta =
      animationClipMeta.value.get(clip.uuid) ?? createDefaultClipMeta("imported");

    return {
      index,
      name: clip.name || `Animation ${index + 1}`,
      duration: clip.duration,
      source: meta.source,
      timeScale: meta.timeScale,
      loopMode: meta.loopMode,
      rotorTargets:
        meta.rotor?.targets.map((target) => ({
          nodeId: target.nodeId,
          nodeName: sceneNodeById.value.get(target.nodeId)?.name ?? target.nodeId,
          pivotUuid: target.pivotUuid,
          config: target.config,
        })) ?? [],
    };
  });
  const rotorTargetConfigList = computed(() =>
    Array.from(selectedNodeIds.value).map((nodeId) => ({
      nodeId,
      nodeName: sceneNodeById.value.get(nodeId)?.name ?? nodeId,
      config: rotorTargetConfigs.value[nodeId] ?? createDefaultRotorTargetConfig(nodeId),
    })),
  );
  const nodeColorTargetList = computed(() =>
    Array.from(selectedNodeIds.value).map((nodeId) => {
      const object = objectByNodeId.get(nodeId);
      return {
        nodeId,
        nodeName: sceneNodeById.value.get(nodeId)?.name ?? nodeId,
        hasDirectMesh: object ? collectDirectMeshes(object).length > 0 : false,
      };
    }),
  );
  const canApplyNodeColor = computed(() => {
    if (selectedNodeIds.value.size === 0) {
      return false;
    }

    const hasDirectMesh = nodeColorTargetList.value.some(
      (target) => target.hasDirectMesh,
    );

    if (!hasDirectMesh) {
      return false;
    }

    if (nodeColorMode.value === "texture") {
      return nodeColorTextureFile.value !== null;
    }

    return true;
  });
  const canRevertNodeColor = computed(() => nodeColorBatches.value.length > 0);
  const wingMeshOptions = computed(() =>
    sceneNodes.value
      .map((node) => ({
        nodeId: node.id,
        nodeName: node.name,
        object: objectByNodeId.get(node.id),
      }))
      .filter((item) => item.object && isMesh(item.object))
      .map(({ nodeId, nodeName }) => ({ nodeId, nodeName })),
  );
  const wingLandmarkProgress = computed(() => {
    const filled = Object.keys(wingLandmarks.value).length;
    return { filled, total: WING_LANDMARK_STEPS.length };
  });
  const wingLandmarkSteps = computed(() => {
    const landmarks = wingLandmarks.value;
    const focusIndex = wingLandmarkIndex.value;
    const allComplete = WING_LANDMARK_STEPS.every((step) => landmarks[step.id]);

    return WING_LANDMARK_STEPS.map((step, index) => {
      const done = Boolean(landmarks[step.id]);
      let status: "pending" | "active" | "done";

      if (!allComplete && index === focusIndex) {
        status = "active";
      } else if (done) {
        status = "done";
      } else {
        status = "pending";
      }

      return {
        ...step,
        index,
        status,
      };
    });
  });
  const wingPresetReady = computed(() =>
    wingWorkflowMode.value === "node-pivot"
      ? wingPivotReady.value
      : wingRigReady.value,
  );
  const wingWeightScaleHint = computed<WingWeightScaleHint | null>(() => {
    if (wingRigReady.value && wingRigLocalLandmarks) {
      return buildWingWeightScaleHint(
        wingWeightOptions.value,
        wingRigLocalLandmarks as WingLandmarks,
      );
    }

    const landmarks = wingLandmarks.value;
    for (const step of WING_LANDMARK_STEPS) {
      if (!landmarks[step.id]) {
        return null;
      }
    }

    return buildWingWeightScaleHint(
      wingWeightOptions.value,
      landmarks as WingLandmarks,
    );
  });
  const wingPresetOptions = computed(() =>
    wingFlapPresets.map((preset) => preset.name),
  );

  let renderer: THREE.WebGLRenderer | null = null;
  let composer: EffectComposer | null = null;
  let outlinePass: OutlinePass | null = null;
  let viewHelper: ViewHelper | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let transformControls: TransformControls | null = null;
  let transformControlsHelper: THREE.Object3D | null = null;
  let initialModelPosition: THREE.Vector3 | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let modelRoot: THREE.Object3D | null = null;
  let axesHelper: THREE.Group | null = null;
  let gridHelper: THREE.GridHelper | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let environmentMap: THREE.WebGLRenderTarget | null = null;
  let frameId = 0;
  let currentObjectUrls: string[] = [];
  let pointerDown: { x: number; y: number; button: number } | null = null;
  let sceneInitialized = false;
  let wingLandmarkGroup: THREE.Group | null = null;
  let wingSkeletonHelper: THREE.SkeletonHelper | null = null;
  let wingPreviewRootBone: THREE.Bone | null = null;
  let wingBoneByName: Map<string, THREE.Bone> | null = null;
  let wingRiggedMesh: THREE.SkinnedMesh | null = null;
  let wingRigLocalLandmarks: Record<string, THREE.Vector3> | null = null;
  let wingBoneIndexByName: Record<string, number> | null = null;

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  // 模型載入時的原始中心；UI 座標以 -originalCenter（座標軸原點）為參考原點
  const modelOriginOffset = new THREE.Vector3();
  const objectByNodeId = new Map<string, THREE.Object3D>();
  const nodeIdByObjectUuid = new Map<string, string>();
  const wingLandmarkOrder: WingLandmarkId[] = WING_LANDMARK_STEPS.map(
    (step) => step.id,
  );

  onBeforeUnmount(() => {
    cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();
    disposeCurrentModel();
    disposeAxes();
    disposeGrid();
    environmentMap?.dispose();
    viewHelper?.dispose();
    transformControls?.detach();
    transformControls?.dispose();
    if (scene && transformControlsHelper) {
      scene.remove(transformControlsHelper);
    }
    transformControls = null;
    transformControlsHelper = null;
    if (scene && wingLandmarkGroup) {
      scene.remove(wingLandmarkGroup);
    }
    clearWingRigRuntimeState();
    wingLandmarkGroup = null;
    controls?.dispose();
    composer?.dispose();
    renderer?.dispose();
    revokeUrls(currentObjectUrls);
  });

  function bindViewportRefs(
    canvas: MaybeRef<HTMLCanvasElement | null>,
    viewport: MaybeRef<HTMLElement | null>,
  ) {
    const syncAndInit = () => {
      canvasRef.value = unref(canvas);
      viewportRef.value = unref(viewport);

      if (canvasRef.value && viewportRef.value && !sceneInitialized) {
        sceneInitialized = true;
        initScene();
      }
    };

    if (isRef(canvas) || isRef(viewport)) {
      watch(() => [unref(canvas), unref(viewport)], syncAndInit, {
        immediate: true,
      });
    } else {
      syncAndInit();
    }
  }

  function initScene() {
    const canvas = canvasRef.value;
    const viewport = viewportRef.value;

    if (!canvas || !viewport) {
      return;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(4, 3, 6);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      canvas,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    outlinePass.edgeStrength = 10;
    outlinePass.edgeGlow = 0;
    outlinePass.edgeThickness = 5;
    outlinePass.visibleEdgeColor.set(0xff00ff);
    outlinePass.hiddenEdgeColor.set(0xff00ff);
    outlinePass.pulsePeriod = 0;
    composer.addPass(outlinePass);
    composer.addPass(new OutputPass());
    viewHelper = new ViewHelper(camera, viewport);
    viewHelper.location.right = 40;
    viewHelper.location.bottom = 40;
    viewHelper.setLabelStyle("24px Arial", "#000000", 18);
    viewHelper.setLabels("X", "Y", "Z");

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    transformControls = new TransformControls(camera, canvas);
    transformControls.enabled = false;
    transformControls.setMode("translate");
    transformControls.addEventListener("objectChange", () => {
      syncModelPositionFromRoot();
    });
    transformControls.addEventListener("mouseDown", () => {
      if (controls) {
        controls.enabled = false;
      }
    });
    transformControls.addEventListener("mouseUp", () => {
      if (controls) {
        controls.enabled = true;
      }
    });
    transformControlsHelper = transformControls.getHelper();
    scene.add(transformControlsHelper);
    transformControls.detach();

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    environmentMap = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = environmentMap.texture;
    environment.dispose();
    pmremGenerator.dispose();

    const hemisphereLight = new THREE.HemisphereLight(0xf8fbff, 0x2f261c, 1.2);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    const fillLight = new THREE.DirectionalLight(0xffe0b3, 0.45);
    keyLight.position.set(4, 6, 5);
    fillLight.position.set(-5, 3, -4);
    scene.add(hemisphereLight, keyLight, fillLight);

    applySceneBackground();
    configureAxes(1.5, 0, 0, 0);
    configureGrid(8, 0, 0, 0);
    resizeRenderer();

    resizeObserver = new ResizeObserver(resizeRenderer);
    resizeObserver.observe(viewport);

    rendererReady.value = true;
    animate();
  }

  function animate() {
    frameId = requestAnimationFrame(animate);

    if (!renderer || !scene || !camera) {
      return;
    }

    const delta = clock.getDelta();

    if (mixer && isAnimationPlaying.value) {
      mixer.update(delta);
    }

    if (viewHelper && controls) {
      viewHelper.center.copy(controls.target);
      if (viewHelper.animating) {
        viewHelper.update(delta);
      }
    }

    controls?.update();
    composer?.render();
    if (viewHelper) {
      renderer.autoClear = false;
      viewHelper.render(renderer);
      renderer.autoClear = true;
    }
  }

  function resizeRenderer() {
    if (
      !renderer ||
      !composer ||
      !outlinePass ||
      !camera ||
      !viewportRef.value
    ) {
      return;
    }

    const { width, height } = viewportRef.value.getBoundingClientRect();

    if (width <= 0 || height <= 0) {
      return;
    }

    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    outlinePass.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function pickFiles() {
    fileInputRef.value?.click();
  }

  function handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void loadFiles(files);
  }

  function handleDragEnter() {
    isDragging.value = true;
  }

  function handleDragOver() {
    isDragging.value = true;
  }

  function handleDragLeave(event: DragEvent) {
    const currentTarget = event.currentTarget as Node | null;
    const relatedTarget = event.relatedTarget as Node | null;

    if (
      currentTarget &&
      relatedTarget &&
      currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    isDragging.value = false;
  }

  function handleDrop(event: DragEvent) {
    isDragging.value = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    void loadFiles(files);
  }

  function handleCanvasPointerDown(event: PointerEvent) {
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
      button: event.button,
    };
  }

  function handleCanvasPointerUp(event: PointerEvent) {
    if (!pointerDown || pointerDown.button !== 0) {
      pointerDown = null;
      return;
    }

    const moveDistance = Math.hypot(
      event.clientX - pointerDown.x,
      event.clientY - pointerDown.y,
    );
    pointerDown = null;

    if (moveDistance > 5) {
      return;
    }

    if (viewHelper?.handleClick(event)) {
      return;
    }

    if (wingLandmarkModeEnabled.value) {
      if (placeWingLandmark(event)) {
        return;
      }
    }

    if (moveModeEnabled.value) {
      return;
    }

    pickModelNode(event);
  }

  function syncModelPositionFromRoot() {
    if (!modelRoot) {
      return;
    }

    modelPosition.value = {
      x: roundPositionComponent(modelRoot.position.x + modelOriginOffset.x),
      y: roundPositionComponent(modelRoot.position.y + modelOriginOffset.y),
      z: roundPositionComponent(modelRoot.position.z + modelOriginOffset.z),
    };
  }

  function roundPositionComponent(value: number) {
    return Math.round(value * 1000) / 1000;
  }

  function roundRotationComponent(value: number) {
    return Math.round(value * 100) / 100;
  }

  function syncSelectedNodeRotation() {
    const object = selectedNodeId.value
      ? objectByNodeId.get(selectedNodeId.value)
      : null;

    if (!object) {
      selectedNodeRotation.value = null;
      return;
    }

    selectedNodeRotation.value = {
      x: roundRotationComponent(THREE.MathUtils.radToDeg(object.rotation.x)),
      y: roundRotationComponent(THREE.MathUtils.radToDeg(object.rotation.y)),
      z: roundRotationComponent(THREE.MathUtils.radToDeg(object.rotation.z)),
    };
  }

  function setSelectedNodeRotation(rotation: Vector3Values) {
    const object = selectedNodeId.value
      ? objectByNodeId.get(selectedNodeId.value)
      : null;

    if (!object) {
      return;
    }

    object.rotation.set(
      THREE.MathUtils.degToRad(rotation.x),
      THREE.MathUtils.degToRad(rotation.y),
      THREE.MathUtils.degToRad(rotation.z),
      object.rotation.order,
    );
    object.updateMatrixWorld(true);
    syncSelectedNodeRotation();
  }

  function applyMoveModeAttachment() {
    if (!transformControls) {
      return;
    }

    transformControls.enabled = moveModeEnabled.value;

    if (!modelRoot) {
      transformControls.detach();
      return;
    }

    if (moveModeEnabled.value) {
      transformControls.attach(modelRoot);
      return;
    }

    transformControls.detach();
  }

  function toggleMoveMode() {
    moveModeEnabled.value = !moveModeEnabled.value;
    applyMoveModeAttachment();
  }

  function setModelPosition(position: Vector3Values) {
    if (!modelRoot) {
      return;
    }

    modelRoot.position.set(
      position.x - modelOriginOffset.x,
      position.y - modelOriginOffset.y,
      position.z - modelOriginOffset.z,
    );
    modelRoot.updateMatrixWorld(true);
    syncModelPositionFromRoot();
  }

  function resetModelPosition() {
    if (!modelRoot || !initialModelPosition) {
      return;
    }

    modelRoot.position.copy(initialModelPosition);
    modelRoot.updateMatrixWorld(true);
    syncModelPositionFromRoot();
  }

  async function exportModel() {
    if (!modelRoot || exporting.value) {
      return;
    }

    exporting.value = true;
    errorMessage.value = "";

    try {
      syncRotorClipsFromMeta();
      const runtimeAnimations = animationClips.value;
      const metaForExport = new Map(
        [...animationClipMeta.value.entries()].map(([uuid, meta]) => [
          uuid,
          {
            source: meta.source,
            timeScale: meta.timeScale,
            loopMode: meta.loopMode,
          },
        ]),
      );
      const exportAnimations = prepareAnimationClipsForExport(
        runtimeAnimations,
        metaForExport,
      );
      const sourceFileName = stats.value?.fileName ?? "model.glb";
      await exportObjectAsGlb({
        root: modelRoot,
        animations: exportAnimations,
        runtimeAnimations,
        mixer,
        originOffset: modelOriginOffset,
        fileName: normalizeExportFileName(exportFileName.value, sourceFileName),
        wireframeEnabled: wireframeVisible.value,
      });
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "匯出 GLB 失敗，請稍後再試。";
    } finally {
      exporting.value = false;
    }
  }

  async function loadFiles(files: File[]) {
    const primaryFile = findPrimaryModelFile(files);

    if (!primaryFile) {
      errorMessage.value = "請選擇或拖放 .glb 或 .gltf 檔案。";
      return;
    }

    loading.value = true;
    loadProgress.value = "準備模型資源";
    errorMessage.value = "";

    const resourceSet = createResourceSet(files);
    const primaryUrl = resourceSet.urlsByKey.get(getFileKey(primaryFile));

    if (!primaryUrl) {
      loading.value = false;
      errorMessage.value = "無法建立模型檔案的本機讀取位置。";
      revokeUrls(resourceSet.objectUrls);
      return;
    }

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) =>
      resolveResourceUrl(url, resourceSet.urlsByKey),
    );
    manager.onProgress = (_url, loaded, total) => {
      loadProgress.value =
        total > 0 ? `載入資源 ${loaded}/${total}` : "載入資源";
    };

    const loader = new GLTFLoader(manager);
    loader.register(
      (parser) => new SpecularGlossinessCompatibilityPlugin(parser),
    );

    try {
      const gltf = await loader.loadAsync(primaryUrl);
      installModel(gltf, primaryFile, files, resourceSet.objectUrls);
    } catch (error) {
      revokeUrls(resourceSet.objectUrls);
      errorMessage.value = buildErrorMessage(primaryFile, error);
    } finally {
      loading.value = false;
      loadProgress.value = "";
    }
  }

  function installModel(
    gltf: GLTF,
    primaryFile: File,
    files: File[],
    objectUrls: string[],
  ) {
    if (!scene) {
      revokeUrls(objectUrls);
      errorMessage.value = "3D 檢視器尚未就緒，請重新整理頁面後再試。";
      return;
    }

    const root = gltf.scene || gltf.scenes[0];

    if (!root) {
      revokeUrls(objectUrls);
      errorMessage.value = "這個檔案沒有可顯示的場景。";
      return;
    }

    loadProgress.value = "解析模型資訊";

    const originalBox = new THREE.Box3().setFromObject(root);
    const originalSize = originalBox.getSize(new THREE.Vector3());
    const originalCenter = originalBox.getCenter(new THREE.Vector3());

    disposeCurrentModel();
    revokeUrls(currentObjectUrls);
    currentObjectUrls = objectUrls;

    root.position.sub(originalCenter);
    scene.add(root);
    modelRoot = root;
    modelOriginOffset.copy(originalCenter);
    modelLoaded.value = true;
    hasImportedAnimations.value = gltf.animations.length > 0;
    importedAnimationClips.value = gltf.animations;
    animationClips.value = [...gltf.animations];
    activeAnimationIndices.value =
      gltf.animations.length > 0 ? new Set([0]) : new Set();
    selectedAnimationIndex.value = gltf.animations.length > 0 ? 0 : null;
    const nextMeta = new Map<string, StoredAnimationClipMeta>();
    for (const clip of gltf.animations) {
      nextMeta.set(clip.uuid, createDefaultClipMeta("imported"));
    }
    animationClipMeta.value = nextMeta;
    mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(root) : null;

    buildSceneTree(root, primaryFile.name);
    updateWingAnalysis(root);
    applyWireframe();

    const fittedBox = new THREE.Box3().setFromObject(root);
    const fittedSize = fittedBox.getSize(new THREE.Vector3());
    const maxDimension = Math.max(fittedSize.x, fittedSize.y, fittedSize.z, 1);
    configureAxes(
      Math.max(maxDimension * 0.24, 1),
      -originalCenter.x,
      -originalCenter.y,
      -originalCenter.z,
    );
    configureGrid(
      maxDimension * 5,
      -originalCenter.x,
      -originalCenter.y,
      -originalCenter.z,
    );
    fitCameraToBox(fittedBox);

    initialModelPosition = root.position.clone();
    syncModelPositionFromRoot();
    transformControls?.setSize(Math.max(maxDimension * 0.08, 0.35));
    applyMoveModeAttachment();

    if (mixer && gltf.animations[0]) {
      const action = mixer.clipAction(gltf.animations[0]).reset().play();
      const meta = nextMeta.get(gltf.animations[0].uuid);
      if (meta) {
        applyClipActionSettings(action, meta);
      }
    }

    stats.value = analyzeModel(
      root,
      gltf.animations,
      primaryFile,
      files,
      originalSize,
    );
    exportFileName.value = deriveExportedFileName(primaryFile.name);
  }

  function disposeCurrentModel() {
    clearSelection();
    clearSceneTree();
    transformControls?.detach();
    moveModeEnabled.value = false;
    modelPosition.value = { x: 0, y: 0, z: 0 };
    initialModelPosition = null;
    modelOriginOffset.set(0, 0, 0);

    if (!scene || !modelRoot) {
      modelRoot = null;
      mixer = null;
      animationClips.value = [];
      importedAnimationClips.value = [];
      animationClipMeta.value = new Map();
      activeAnimationIndices.value = new Set();
      selectedAnimationIndex.value = null;
      isAnimationPlaying.value = false;
      modelLoaded.value = false;
      hasImportedAnimations.value = false;
      clearNodeColorBatches();
      wingAnalysis.value = null;
      leftWingNodeId.value = "";
      rightWingNodeId.value = "";
      wingRigTargetNodeId.value = "";
      wingLandmarks.value = {};
      wingLandmarkIndex.value = 0;
      wingLandmarkModeEnabled.value = false;
      wingWorkflowMode.value = "full-rig";
      wingRigReady.value = false;
      wingPivotReady.value = false;
      wingWeightOptions.value = { ...DEFAULT_WING_WEIGHT_OPTIONS };
      wingWeightHeatmapEnabled.value = false;
      applyingWingPivot.value = false;
      applyingWingRig.value = false;
      applyingWingPreset.value = false;
      clearWingRigRuntimeState();
      if (scene && wingLandmarkGroup) {
        scene.remove(wingLandmarkGroup);
      }
      wingLandmarkGroup = null;
      stats.value = null;
      exportFileName.value = "";
      return;
    }

    clearNodeColorBatches();

    scene.remove(modelRoot);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    modelRoot.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }

      geometries.add(object.geometry);

      for (const material of toMaterialArray(object.material)) {
        materials.add(material);
        collectMaterialTextures(material, textures);
      }
    });

    for (const geometry of geometries) {
      geometry.dispose();
    }

    for (const texture of textures) {
      texture.dispose();
    }

    for (const material of materials) {
      material.dispose();
    }

    modelRoot = null;
    mixer = null;
    animationClips.value = [];
    importedAnimationClips.value = [];
    animationClipMeta.value = new Map();
    activeAnimationIndices.value = new Set();
    selectedAnimationIndex.value = null;
    isAnimationPlaying.value = false;
    modelLoaded.value = false;
    hasImportedAnimations.value = false;
    stats.value = null;
    wingAnalysis.value = null;
    leftWingNodeId.value = "";
    rightWingNodeId.value = "";
    wingRigTargetNodeId.value = "";
    wingLandmarks.value = {};
    wingLandmarkIndex.value = 0;
    wingLandmarkModeEnabled.value = false;
    wingWorkflowMode.value = "full-rig";
    wingRigReady.value = false;
    wingPivotReady.value = false;
    wingWeightOptions.value = { ...DEFAULT_WING_WEIGHT_OPTIONS };
    wingWeightHeatmapEnabled.value = false;
    applyingWingPivot.value = false;
    applyingWingRig.value = false;
    applyingWingPreset.value = false;
    clearWingRigRuntimeState();
    if (scene && wingLandmarkGroup) {
      scene.remove(wingLandmarkGroup);
    }
    wingLandmarkGroup = null;
    exportFileName.value = "";
  }

  function resetCamera() {
    if (!modelRoot) {
      camera?.position.set(4, 3, 6);
      controls?.target.set(0, 0, 0);
      controls?.update();
      return;
    }

    fitCameraToBox(new THREE.Box3().setFromObject(modelRoot));
  }

  function toggleGrid() {
    gridVisible.value = !gridVisible.value;

    if (gridHelper) {
      gridHelper.visible = gridVisible.value;
    }
  }

  function toggleWireframe() {
    wireframeVisible.value = !wireframeVisible.value;
    applyWireframe();
  }

  function setBackgroundMode(mode: BackgroundMode) {
    backgroundMode.value = mode;
    applySceneBackground();
  }

  function getClipMeta(clip: THREE.AnimationClip): StoredAnimationClipMeta {
    return (
      animationClipMeta.value.get(clip.uuid) ?? createDefaultClipMeta("imported")
    );
  }

  function setClipMeta(clip: THREE.AnimationClip, meta: StoredAnimationClipMeta) {
    const next = new Map(animationClipMeta.value);
    next.set(clip.uuid, meta);
    animationClipMeta.value = next;
  }

  function applyClipActionSettings(
    action: THREE.AnimationAction,
    meta: AnimationClipSettings,
  ) {
    action.timeScale = meta.timeScale;

    if (meta.loopMode === "once") {
      action.setLoop(THREE.LoopOnce, 1);
    } else if (meta.loopMode === "pingpong") {
      action.setLoop(THREE.LoopPingPong, Infinity);
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
  }

  function syncAnimationStats() {
    if (!stats.value) {
      return;
    }

    stats.value = {
      ...stats.value,
      animations: animationClips.value.map((item, index) => ({
        name: item.name || `Animation ${index + 1}`,
        duration: `${formatDecimal(item.duration)} 秒`,
      })),
    };
  }

  function reindexAnimationState(removedIndex: number) {
    const nextActive = new Set<number>();
    for (const index of activeAnimationIndices.value) {
      if (index === removedIndex) {
        continue;
      }
      nextActive.add(index > removedIndex ? index - 1 : index);
    }
    activeAnimationIndices.value = nextActive;

    const selected = selectedAnimationIndex.value;
    if (selected === null) {
      return;
    }
    if (selected === removedIndex) {
      selectedAnimationIndex.value = null;
      return;
    }
    if (selected > removedIndex) {
      selectedAnimationIndex.value = selected - 1;
    }
  }

  function selectAnimation(index: number) {
    if (!animationClips.value[index]) {
      return;
    }
    selectedAnimationIndex.value = index;
  }

  function stopAnimationAction(index: number) {
    if (!mixer) {
      return;
    }

    const clip = animationClips.value[index];
    if (!clip) {
      return;
    }

    mixer.clipAction(clip).stop();
  }

  function playAnimation(index: number) {
    if (!mixer || !animationClips.value[index]) {
      return;
    }

    const clip = animationClips.value[index];
    const next = new Set(activeAnimationIndices.value);

    if (next.has(index)) {
      stopAnimationAction(index);
      next.delete(index);
      activeAnimationIndices.value = next;
      if (next.size === 0) {
        isAnimationPlaying.value = false;
      }
      return;
    }

    const action = mixer.clipAction(clip).reset().play();
    applyClipActionSettings(action, getClipMeta(clip));
    next.add(index);
    activeAnimationIndices.value = next;
    isAnimationPlaying.value = true;
  }

  function toggleAnimationPlayback() {
    if (
      !mixer ||
      animationClips.value.length === 0 ||
      activeAnimationIndices.value.size === 0
    ) {
      return;
    }

    isAnimationPlaying.value = !isAnimationPlaying.value;
  }

  function replaceAnimationClipAtIndex(
    index: number,
    nextClip: THREE.AnimationClip,
    meta: StoredAnimationClipMeta,
  ) {
    const oldClip = animationClips.value[index];
    if (!oldClip) {
      return;
    }

    const oldUuid = oldClip.uuid;
    const wasPlaying = activeAnimationIndices.value.has(index);

    if (mixer) {
      mixer.clipAction(oldClip).stop();
    }

    const nextClips = [...animationClips.value];
    nextClips[index] = nextClip;
    animationClips.value = nextClips;

    const nextMeta = new Map(animationClipMeta.value);
    nextMeta.delete(oldUuid);
    nextMeta.set(nextClip.uuid, meta);
    animationClipMeta.value = nextMeta;

    if (mixer && wasPlaying) {
      const action = mixer.clipAction(nextClip).reset().play();
      applyClipActionSettings(action, meta);
    }
  }

  function syncRotorClipsFromMeta() {
    if (!modelRoot) {
      return;
    }

    for (let index = 0; index < animationClips.value.length; index += 1) {
      const clip = animationClips.value[index];
      if (!clip) {
        continue;
      }

      const meta = getClipMeta(clip);
      if (meta.source !== "rotor" || !meta.rotor) {
        continue;
      }

      for (const target of meta.rotor.targets) {
        const object = objectByNodeId.get(target.nodeId);
        if (!object) {
          throw new Error(`找不到節點：${target.nodeId}`);
        }
        validateRotorTarget(object, target.config);
      }

      const wasPlaying = activeAnimationIndices.value.has(index);
      if (wasPlaying) {
        resetRotorPivotsToBindPose(modelRoot, [clip]);
      }

      const nextClip = rebuildRotorAnimationClip(
        modelRoot,
        meta.rotor,
        clip.name || DEFAULT_ANIMATION_NAME,
      );
      replaceAnimationClipAtIndex(index, nextClip, meta);
    }

    syncAnimationStats();
  }

  function updateAnimationSettings(
    index: number,
    patch: {
      name?: string;
      timeScale?: number;
      loopMode?: AnimationLoopMode;
    },
  ) {
    const clip = animationClips.value[index];
    if (!clip) {
      return;
    }

    const meta = { ...getClipMeta(clip) };

    if (patch.name !== undefined) {
      clip.name = patch.name.trim() || clip.name;
    }
    if (patch.timeScale !== undefined) {
      meta.timeScale = Math.min(10, Math.max(0.1, patch.timeScale));
    }
    if (patch.loopMode !== undefined) {
      meta.loopMode = patch.loopMode;
    }

    setClipMeta(clip, meta);

    if (mixer && activeAnimationIndices.value.has(index)) {
      applyClipActionSettings(mixer.clipAction(clip), meta);
    }

    syncAnimationStats();
  }

  function updateRotorAnimationTarget(
    index: number,
    pivotUuid: string,
    patch: Partial<RotorTargetConfig>,
  ) {
    const clip = animationClips.value[index];
    if (!clip) {
      return;
    }

    const meta = getClipMeta(clip);
    if (!meta.rotor) {
      return;
    }

    const nextTargets = meta.rotor.targets.map((target) => {
      if (target.pivotUuid !== pivotUuid) {
        return target;
      }

      return {
        ...target,
        config: { ...target.config, ...patch, nodeId: target.config.nodeId },
      };
    });

    setClipMeta(clip, {
      ...meta,
      rotor: { targets: nextTargets },
    });
  }

  function detectRotorAnimationTarget(
    index: number,
    pivotUuid: string,
    kind: "pivot" | "axis" | "both" = "both",
  ) {
    try {
      const clip = animationClips.value[index];
      if (!clip) {
        return;
      }

      const meta = getClipMeta(clip);
      const target = meta.rotor?.targets.find((item) => item.pivotUuid === pivotUuid);
      if (!target) {
        return;
      }

      const object = objectByNodeId.get(target.nodeId);
      if (!object) {
        throw new Error("找不到節點");
      }

      const result = estimatePivotAndAxis(object);
      const patch: Partial<RotorTargetConfig> = {};

      if (kind === "pivot" || kind === "both") {
        patch.pivot = result.pivot;
      }
      if (kind === "axis" || kind === "both") {
        patch.axis = result.axis;
      }

      updateRotorAnimationTarget(index, pivotUuid, patch);
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "偵測旋翼參數失敗。";
    }
  }

  function applyRotorAnimationChanges(index: number) {
    if (!modelRoot || applyingRotorAnimationChanges.value) {
      return;
    }

    const clip = animationClips.value[index];
    if (!clip) {
      return;
    }

    const meta = getClipMeta(clip);
    if (!meta.rotor) {
      return;
    }

    applyingRotorAnimationChanges.value = true;
    errorMessage.value = "";

    try {
      for (const target of meta.rotor.targets) {
        const object = objectByNodeId.get(target.nodeId);
        if (!object) {
          throw new Error(`找不到節點：${target.nodeId}`);
        }
        validateRotorTarget(object, target.config);
      }

      const wasPlaying = activeAnimationIndices.value.has(index);
      if (wasPlaying) {
        resetRotorPivotsToBindPose(modelRoot, [clip]);
      }

      const nextClip = rebuildRotorAnimationClip(
        modelRoot,
        meta.rotor,
        clip.name || DEFAULT_ANIMATION_NAME,
      );

      replaceAnimationClipAtIndex(index, nextClip, meta);
      syncAnimationStats();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "更新旋翼動畫失敗。";
    } finally {
      applyingRotorAnimationChanges.value = false;
    }
  }

  function removeAnimation(index: number) {
    if (!modelRoot || removingAnimation.value) {
      return;
    }

    const clip = animationClips.value[index];
    if (!clip) {
      return;
    }

    removingAnimation.value = true;
    errorMessage.value = "";

    try {
      const meta = animationClipMeta.value.get(clip.uuid);

      if (meta?.source === "rotor" && meta.rotor) {
        if (mixer) {
          resetRotorPivotsToBindPose(modelRoot, [clip]);
        }
        removeRotorClipPivots(modelRoot, meta.rotor);
      }

      if (mixer) {
        mixer.clipAction(clip).stop();
      }

      animationClips.value = animationClips.value.filter((_, clipIndex) => clipIndex !== index);

      if (meta?.source === "imported") {
        importedAnimationClips.value = importedAnimationClips.value.filter(
          (item) => item.uuid !== clip.uuid,
        );
        hasImportedAnimations.value = importedAnimationClips.value.length > 0;
      }

      const nextMeta = new Map(animationClipMeta.value);
      nextMeta.delete(clip.uuid);
      animationClipMeta.value = nextMeta;

      reindexAnimationState(index);

      if (animationClips.value.length === 0) {
        mixer = null;
        isAnimationPlaying.value = false;
      } else if (activeAnimationIndices.value.size === 0) {
        isAnimationPlaying.value = false;
      }

      rebuildSceneTreePreservingSelection();
      syncAnimationStats();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "移除動畫失敗。";
    } finally {
      removingAnimation.value = false;
    }
  }

  function syncRotorConfigsFromSelection() {
    const next = { ...rotorTargetConfigs.value };

    for (const nodeId of selectedNodeIds.value) {
      if (!next[nodeId]) {
        next[nodeId] = createDefaultRotorTargetConfig(nodeId);
      }
    }

    rotorTargetConfigs.value = next;
  }

  function updateRotorTargetConfig(
    nodeId: string,
    patch: Partial<RotorTargetConfig>,
  ) {
    const current =
      rotorTargetConfigs.value[nodeId] ?? createDefaultRotorTargetConfig(nodeId);

    rotorTargetConfigs.value = {
      ...rotorTargetConfigs.value,
      [nodeId]: { ...current, ...patch, nodeId },
    };
  }

  function computeAutoPivotAxis(nodeId: string) {
    const object = objectByNodeId.get(nodeId);

    if (!object) {
      throw new Error("找不到節點");
    }

    return estimatePivotAndAxis(object);
  }

  function detectRotorPivotAxis(
    nodeId: string,
    kind: "pivot" | "axis" | "both" = "both",
  ) {
    const result = computeAutoPivotAxis(nodeId);
    const patch: Partial<RotorTargetConfig> = {};

    if (kind === "pivot" || kind === "both") {
      patch.pivot = result.pivot;
    }

    if (kind === "axis" || kind === "both") {
      patch.axis = result.axis;
    }

    updateRotorTargetConfig(nodeId, patch);
    return result;
  }

  function rebuildSceneTreePreservingSelection() {
    if (!modelRoot || !stats.value) {
      return;
    }

    const selectedUuids = new Set<string>();
    for (const nodeId of selectedNodeIds.value) {
      const node = sceneNodeById.value.get(nodeId);
      if (node) {
        selectedUuids.add(node.objectUuid);
      }
    }

    const primaryUuid = selectedNode.value?.objectUuid ?? null;
    const configByUuid = new Map<string, RotorTargetConfig>();

    for (const [nodeId, config] of Object.entries(rotorTargetConfigs.value)) {
      const node = sceneNodeById.value.get(nodeId);
      if (node) {
        configByUuid.set(node.objectUuid, config);
      }
    }

    buildSceneTree(modelRoot, stats.value.fileName, { preserveSelection: true });

    const nextSelected = new Set<string>();
    const nextConfigs: Record<string, RotorTargetConfig> = {};

    for (const uuid of selectedUuids) {
      const nodeId = nodeIdByObjectUuid.get(uuid);
      if (!nodeId) {
        continue;
      }

      nextSelected.add(nodeId);
      const saved = configByUuid.get(uuid);
      nextConfigs[nodeId] = saved
        ? { ...saved, nodeId }
        : createDefaultRotorTargetConfig(nodeId);
    }

    selectedNodeIds.value = nextSelected;
    rotorTargetConfigs.value = nextConfigs;

    if (primaryUuid) {
      const nodeId = nodeIdByObjectUuid.get(primaryUuid);
      if (nodeId) {
        selectedNodeId.value = nodeId;
        syncSelectedNodeRotation();
        const object = objectByNodeId.get(nodeId);
        if (object) {
          updateSelectionOutline(object);
        }
      }
    } else {
      selectedNodeId.value = "";
      selectedNodeRotation.value = null;
      clearSelectionOutline();
    }
  }

  async function applyRotorAnimation() {
    if (!modelRoot || applyingRotorAnimation.value) {
      return;
    }

    if (selectedNodeIds.value.size === 0) {
      errorMessage.value = "請至少選取一個節點。";
      return;
    }

    applyingRotorAnimation.value = true;
    errorMessage.value = "";

    try {
      const resolvedTargets = [];
      const resolvedNodeIds: string[] = [];

      for (const nodeId of selectedNodeIds.value) {
        const object = objectByNodeId.get(nodeId);
        const input =
          rotorTargetConfigs.value[nodeId] ??
          createDefaultRotorTargetConfig(nodeId);

        if (!object) {
          throw new Error(`找不到節點：${nodeId}`);
        }

        validateRotorTarget(object, input);
        const config = resolveTargetConfig(object, input);
        resolvedTargets.push({ object, config });
        resolvedNodeIds.push(nodeId);
      }

      const animationName =
        rotorAnimationName.value.trim() || DEFAULT_ANIMATION_NAME;
      const { clip, pivots } = addRotorAnimationBatch(
        resolvedTargets,
        animationName,
      );

      const targetRecords: RotorClipTargetRecord[] = resolvedTargets.map(
        ({ object }, index) => {
          const nodeId = resolvedNodeIds[index]!;
          return {
            nodeId,
            objectUuid: object.uuid,
            pivotUuid: pivots[index]!.uuid,
            config: {
              ...(rotorTargetConfigs.value[nodeId] ??
                createDefaultRotorTargetConfig(nodeId)),
              nodeId,
            },
          };
        },
      );

      const nextClips = [...animationClips.value, clip];
      animationClips.value = nextClips;
      const rotorIndex = nextClips.length - 1;

      setClipMeta(clip, {
        ...createDefaultClipMeta("rotor"),
        rotor: { targets: targetRecords },
      });

      if (!mixer) {
        mixer = new THREE.AnimationMixer(modelRoot);
      }

      const action = mixer.clipAction(clip).reset().play();
      applyClipActionSettings(action, getClipMeta(clip));
      activeAnimationIndices.value = new Set([
        ...activeAnimationIndices.value,
        rotorIndex,
      ]);
      selectedAnimationIndex.value = rotorIndex;
      isAnimationPlaying.value = true;

      rebuildSceneTreePreservingSelection();
      syncAnimationStats();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "套用旋翼動畫失敗。";
    } finally {
      applyingRotorAnimation.value = false;
    }
  }

  function buildMeshByUuidMap() {
    const meshByUuid = new Map<string, THREE.Mesh>();

    if (!modelRoot) {
      return meshByUuid;
    }

    modelRoot.traverse((object) => {
      if (isMesh(object)) {
        meshByUuid.set(object.uuid, object);
      }
    });

    return meshByUuid;
  }

  function refreshMaterialStats() {
    if (!modelRoot || !stats.value) {
      return;
    }

    const summary = summarizeObject(modelRoot);
    stats.value = {
      ...stats.value,
      materialCount: summary.materialCount,
      textureCount: summary.textureCount,
    };
  }

  function setNodeColorTextureFile(file: File | null) {
    nodeColorTextureFile.value = file;
  }

  async function applyNodeColor() {
    if (!modelRoot || applyingNodeColor.value) {
      return;
    }

    if (selectedNodeIds.value.size === 0) {
      errorMessage.value = "請至少選取一個節點。";
      return;
    }

    if (!canApplyNodeColor.value) {
      errorMessage.value = "選取的節點沒有可上色的 Mesh。";
      return;
    }

    applyingNodeColor.value = true;
    errorMessage.value = "";

    try {
      const objects: THREE.Object3D[] = [];

      for (const nodeId of selectedNodeIds.value) {
        const object = objectByNodeId.get(nodeId);

        if (object) {
          objects.push(object);
        }
      }

      const { batch, skippedMeshCount } = await applyNodeColorToMeshes(objects, {
        mode: nodeColorMode.value,
        colorHex: nodeColorHex.value,
        textureFile: nodeColorTextureFile.value,
        nodeIds: Array.from(selectedNodeIds.value),
      });

      nodeColorBatches.value = [...nodeColorBatches.value, batch];
      refreshMaterialStats();

      if (skippedMeshCount > 0) {
        errorMessage.value = `${skippedMeshCount} 個 mesh 材質不支援，已跳過。`;
      }
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "套用上色失敗。";
    } finally {
      applyingNodeColor.value = false;
    }
  }

  function revertNodeColor() {
    if (!modelRoot || revertingNodeColor.value || nodeColorBatches.value.length === 0) {
      return;
    }

    revertingNodeColor.value = true;
    errorMessage.value = "";

    try {
      const batches = [...nodeColorBatches.value];
      const batch = batches.pop();

      if (!batch) {
        return;
      }

      revertNodeColorBatch(batch, buildMeshByUuidMap());
      nodeColorBatches.value = batches;
      refreshMaterialStats();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "取消上色失敗。";
    } finally {
      revertingNodeColor.value = false;
    }
  }

  function clearNodeColorBatches() {
    disposeAllNodeColorBatches(nodeColorBatches.value);
    nodeColorBatches.value = [];
    nodeColorTextureFile.value = null;
  }

  function resolveNodeId(uuid?: string) {
    if (!uuid) {
      return "";
    }
    return nodeIdByObjectUuid.get(uuid) ?? "";
  }

  function updateWingAnalysis(root: THREE.Object3D) {
    const analysis = analyzeBirdModel(root);
    wingAnalysis.value = analysis;
    leftWingNodeId.value = resolveNodeId(analysis.leftWingMeshCandidates[0]);
    rightWingNodeId.value = resolveNodeId(analysis.rightWingMeshCandidates[0]);
    wingRigTargetNodeId.value = resolveNodeId(
      analysis.bodyMeshCandidates[0] ??
        analysis.leftWingMeshCandidates[0] ??
        analysis.rightWingMeshCandidates[0],
    );
    wingWorkflowMode.value =
      analysis.suggestedMode === "node-pivot" ? "node-pivot" : "full-rig";
  }

  function clearWingSkeletonPreview() {
    if (wingPreviewRootBone?.parent) {
      wingPreviewRootBone.parent.remove(wingPreviewRootBone);
    }
    wingPreviewRootBone = null;

    if (!wingRiggedMesh && scene && wingSkeletonHelper) {
      scene.remove(wingSkeletonHelper);
      wingSkeletonHelper = null;
    }
  }

  function clearWingRigRuntimeState() {
    disposeWeightHeatmap(wingRiggedMesh);
    if (wingPreviewRootBone?.parent) {
      wingPreviewRootBone.parent.remove(wingPreviewRootBone);
    }
    wingPreviewRootBone = null;
    if (scene && wingSkeletonHelper) {
      scene.remove(wingSkeletonHelper);
      wingSkeletonHelper = null;
    }
    wingBoneByName = null;
    wingRiggedMesh = null;
    wingRigLocalLandmarks = null;
    wingBoneIndexByName = null;
  }

  function getLandmarkMarkerRadius(active: boolean) {
    let base = 0.015;

    if (modelRoot) {
      const box = new THREE.Box3().setFromObject(modelRoot);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      base = Math.min(0.015, maxDim * 0.008);
    }

    return active ? base * 1.3 : base;
  }

  function refreshWingLandmarkMarkerSizes() {
    if (!wingLandmarkGroup) {
      return;
    }

    const activeId = wingLandmarkOrder[wingLandmarkIndex.value];
    wingLandmarkGroup.children.forEach((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }

      const id = child.name.replace("WingLandmark_", "") as WingLandmarkId;
      const radius = getLandmarkMarkerRadius(id === activeId);
      child.geometry.dispose();
      child.geometry = new THREE.SphereGeometry(radius, 16, 16);
    });
  }

  function ensureWingLandmarkGroup() {
    if (!scene) {
      return null;
    }
    if (!wingLandmarkGroup) {
      wingLandmarkGroup = new THREE.Group();
      wingLandmarkGroup.name = "WingLandmarks";
      scene.add(wingLandmarkGroup);
    }
    return wingLandmarkGroup;
  }

  function upsertWingLandmarkMarker(id: WingLandmarkId, position: THREE.Vector3) {
    const group = ensureWingLandmarkGroup();
    if (!group) {
      return;
    }

    const markerName = `WingLandmark_${id}`;
    const activeId = wingLandmarkOrder[wingLandmarkIndex.value];
    let marker = group.getObjectByName(markerName) as THREE.Mesh | null;
    if (!marker) {
      const radius = getLandmarkMarkerRadius(id === activeId);
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: id.startsWith("L_") ? 0x58a6ff : 0xf78166,
      });
      marker = new THREE.Mesh(geometry, material);
      marker.name = markerName;
      group.add(marker);
    }
    marker.position.copy(position);
    refreshWingLandmarkMarkerSizes();
  }

  function clearWingLandmarkMarkers() {
    if (!wingLandmarkGroup) {
      return;
    }
    wingLandmarkGroup.clear();
  }

  function syncWingLandmarkIndex() {
    const nextIndex = wingLandmarkOrder.findIndex(
      (id) => !wingLandmarks.value[id],
    );
    wingLandmarkIndex.value =
      nextIndex === -1 ? wingLandmarkOrder.length - 1 : nextIndex;
    refreshWingLandmarkMarkerSizes();
  }

  function updateWingSkeletonPreview() {
    if (wingRigReady.value) {
      return;
    }

    clearWingSkeletonPreview();

    const landmarks = collectCompleteLandmarks();
    if (!landmarks || !modelRoot || !scene) {
      return;
    }

    const target = objectByNodeId.get(wingRigTargetNodeId.value);
    const parent = target?.parent ?? modelRoot;
    const { rootBone } = buildBirdSkeleton(landmarks, parent);
    parent.add(rootBone);
    wingPreviewRootBone = rootBone;

    wingSkeletonHelper = new THREE.SkeletonHelper(rootBone);
    wingSkeletonHelper.visible = true;
    scene.add(wingSkeletonHelper);
  }

  function setWingLandmark(id: WingLandmarkId, position: THREE.Vector3) {
    wingLandmarks.value = {
      ...wingLandmarks.value,
      [id]: position.clone(),
    };
    upsertWingLandmarkMarker(id, position);
    syncWingLandmarkIndex();

    if (collectCompleteLandmarks()) {
      updateWingSkeletonPreview();
    } else {
      clearWingSkeletonPreview();
    }
  }

  function placeWingLandmark(event: PointerEvent) {
    if (!camera || !modelRoot || !canvasRef.value) {
      return false;
    }

    const rect = canvasRef.value.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const pickableMeshes: THREE.Object3D[] = [];
    modelRoot.traverse((object) => {
      if (isMesh(object)) {
        pickableMeshes.push(object);
      }
    });

    const [hit] = raycaster.intersectObjects(pickableMeshes, false);
    if (!hit) {
      return false;
    }

    const id = wingLandmarkOrder[wingLandmarkIndex.value];
    if (id) {
      setWingLandmark(id, hit.point.clone());
    }

    return true;
  }

  function toggleWingLandmarkMode() {
    wingLandmarkModeEnabled.value = !wingLandmarkModeEnabled.value;
  }

  function setWingLandmarkStep(index: number) {
    if (index < 0 || index >= wingLandmarkOrder.length) {
      return;
    }

    wingLandmarkIndex.value = index;
    wingLandmarkModeEnabled.value = true;
    refreshWingLandmarkMarkerSizes();
  }

  function clearWingLandmarks() {
    wingLandmarks.value = {};
    wingLandmarkIndex.value = 0;
    clearWingLandmarkMarkers();
    clearWingSkeletonPreview();
    refreshWingLandmarkMarkerSizes();
  }

  function setWingWorkflowMode(mode: WingWorkflowMode) {
    if (mode === wingWorkflowMode.value) {
      return;
    }

    wingWorkflowMode.value = mode;

    if (mode === "node-pivot") {
      clearWingLandmarks();
      clearWingRigRuntimeState();
      wingRigReady.value = false;
      wingLandmarkModeEnabled.value = false;
    } else {
      wingPivotReady.value = false;
    }
  }

  function collectCompleteLandmarks(): WingLandmarks | null {
    const landmarks = wingLandmarks.value;
    for (const id of wingLandmarkOrder) {
      if (!landmarks[id]) {
        return null;
      }
    }

    return landmarks as WingLandmarks;
  }

  function addAnimationClip(
    clip: THREE.AnimationClip,
    meta: StoredAnimationClipMeta,
  ) {
    if (!modelRoot) {
      return;
    }

    const nextClips = [...animationClips.value, clip];
    animationClips.value = nextClips;
    setClipMeta(clip, meta);

    if (!mixer) {
      mixer = new THREE.AnimationMixer(modelRoot);
    }

    const action = mixer.clipAction(clip).reset().play();
    applyClipActionSettings(action, meta);

    activeAnimationIndices.value = new Set([
      ...activeAnimationIndices.value,
      nextClips.length - 1,
    ]);
    selectedAnimationIndex.value = nextClips.length - 1;
    isAnimationPlaying.value = true;
    syncAnimationStats();
  }

  function applyWingPivotAnimation() {
    if (!modelRoot || applyingWingPivot.value) {
      return;
    }

    if (!leftWingNodeId.value || !rightWingNodeId.value) {
      errorMessage.value = "請選擇左右翅節點。";
      return;
    }

    const leftObject = objectByNodeId.get(leftWingNodeId.value);
    const rightObject = objectByNodeId.get(rightWingNodeId.value);

    if (!leftObject || !rightObject || !isMesh(leftObject) || !isMesh(rightObject)) {
      errorMessage.value = "左右翅節點必須是 Mesh。";
      return;
    }

    applyingWingPivot.value = true;
    errorMessage.value = "";

    try {
      const leftPivot = createPivotForTarget(
        leftObject,
        getObjectPivotLocal(leftObject),
      );
      const rightPivot = createPivotForTarget(
        rightObject,
        getObjectPivotLocal(rightObject),
      );
      const clip = createFlapClipForPivot(
        [
          { pivot: leftPivot, mirrorSign: 1 },
          { pivot: rightPivot, mirrorSign: -1 },
        ],
        {
          name: `WingPivot_${wingPresetName.value}`,
          duration: 0.8 / wingAnimationOptions.value.speedMultiplier,
          amplitude: 0.6 * wingAnimationOptions.value.amplitudeMultiplier,
          axis: "z",
        },
      );

      addAnimationClip(clip, {
        ...createDefaultClipMeta("wing"),
        loopMode: wingAnimationOptions.value.loopMode,
      });
      wingPivotReady.value = true;
      rebuildSceneTreePreservingSelection();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "套用翅膀 pivot 失敗。";
    } finally {
      applyingWingPivot.value = false;
    }
  }

  function getObjectPivotLocal(object: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    if (!object.parent) {
      return center;
    }
    object.parent.updateMatrixWorld(true);
    return center.applyMatrix4(object.parent.matrixWorld.clone().invert());
  }

  function applyWingRig() {
    if (!modelRoot || applyingWingRig.value) {
      return;
    }

    const targetId = wingRigTargetNodeId.value;
    if (!targetId) {
      errorMessage.value = "請選擇要套用 Rig 的 Mesh。";
      return;
    }

    const target = objectByNodeId.get(targetId);
    if (!target || !isMesh(target)) {
      errorMessage.value = "目標節點不是 Mesh。";
      return;
    }

    const landmarks = collectCompleteLandmarks();
    if (!landmarks) {
      errorMessage.value = "請先完成 6 點標記。";
      return;
    }

    applyingWingRig.value = true;
    errorMessage.value = "";

    try {
      clearWingSkeletonPreview();
      const parent = target.parent ?? modelRoot;
      const { skinned, boneByName, localLandmarks } = applyWingRigToMesh(
        target,
        landmarks,
        parent,
        wingWeightOptions.value,
      );

      parent.add(skinned);
      parent.remove(target);

      const boneIndexByName: Record<string, number> = {};
      skinned.skeleton.bones.forEach((bone, index) => {
        boneIndexByName[bone.name] = index;
      });

      if (scene) {
        wingSkeletonHelper = new THREE.SkeletonHelper(skinned);
        wingSkeletonHelper.visible = true;
        scene.add(wingSkeletonHelper);
      }

      wingBoneByName = boneByName;
      wingRiggedMesh = skinned;
      wingRigLocalLandmarks = localLandmarks;
      wingBoneIndexByName = boneIndexByName;
      wingRigReady.value = true;
      wingLandmarkModeEnabled.value = false;

      if (wingWeightHeatmapEnabled.value) {
        applyWeightHeatmap(skinned, boneIndexByName);
      }

      rebuildSceneTreePreservingSelection();
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "套用翅膀 Rig 失敗。";
    } finally {
      applyingWingRig.value = false;
    }
  }

  function applyWingPreset() {
    if (!modelRoot || applyingWingPreset.value) {
      return;
    }

    if (wingWorkflowMode.value === "node-pivot") {
      if (!wingPivotReady.value) {
        errorMessage.value = "請先套用 Pivot 拍翅。";
        return;
      }
      applyWingPivotAnimation();
      return;
    }

    if (!wingRigReady.value || !wingBoneByName) {
      errorMessage.value = "請先完成骨骼 Rig。";
      return;
    }

    const preset = wingFlapPresets.find(
      (item) => item.name === wingPresetName.value,
    );
    if (!preset) {
      errorMessage.value = "找不到指定的拍翅 preset。";
      return;
    }

    applyingWingPreset.value = true;
    errorMessage.value = "";

    try {
      const clip = presetToAnimationClip(preset, wingBoneByName, {
        speedMultiplier: wingAnimationOptions.value.speedMultiplier,
        amplitudeMultiplier: wingAnimationOptions.value.amplitudeMultiplier,
        mirrorRight: wingAnimationOptions.value.mirrorRight,
        loopMode: wingAnimationOptions.value.loopMode,
      });

      addAnimationClip(clip, {
        ...createDefaultClipMeta("wing-rig"),
        loopMode: wingAnimationOptions.value.loopMode,
      });
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : "套用拍翅 preset 失敗。";
    } finally {
      applyingWingPreset.value = false;
    }
  }

  function recomputeWingSkinWeights() {
    if (!wingRiggedMesh || !wingRigLocalLandmarks || !wingBoneIndexByName) {
      return;
    }

    const geometry = wingRiggedMesh.geometry;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    if (!position) {
      return;
    }

    const { skinIndex, skinWeight } = computeWingSkinWeights(
      position,
      wingRigLocalLandmarks,
      wingBoneIndexByName,
      wingWeightOptions.value,
    );

    geometry.setAttribute("skinIndex", skinIndex);
    geometry.setAttribute("skinWeight", skinWeight);
    skinIndex.needsUpdate = true;
    skinWeight.needsUpdate = true;
    wingRiggedMesh.normalizeSkinWeights();

    if (wingWeightHeatmapEnabled.value) {
      applyWeightHeatmap(wingRiggedMesh, wingBoneIndexByName);
    }
  }

  function updateWingWeightOptions(next: WingWeightOptions) {
    wingWeightOptions.value = { ...next };
    if (wingRigReady.value) {
      recomputeWingSkinWeights();
    }
  }

  function toggleWingWeightHeatmap(enabled: boolean) {
    wingWeightHeatmapEnabled.value = enabled;

    if (!wingRiggedMesh || !wingBoneIndexByName) {
      return;
    }

    if (enabled) {
      applyWeightHeatmap(wingRiggedMesh, wingBoneIndexByName);
      return;
    }

    removeWeightHeatmap(wingRiggedMesh);
  }

  function updateWingAnimationOptions(next: WingAnimationOptions) {
    wingAnimationOptions.value = { ...next };
  }

  function buildSceneTree(
    root: THREE.Object3D,
    fileName: string,
    options?: { preserveSelection?: boolean },
  ) {
    const nodes: SceneNode[] = [];
    const expanded = new Set<string>();
    const unnamedCounts = new Map<string, number>();
    let idCounter = 0;

    objectByNodeId.clear();
    nodeIdByObjectUuid.clear();

    const walk = (
      object: THREE.Object3D,
      parentId: string | null,
      depth: number,
      parentPath: string,
    ) => {
      const id = `node-${idCounter}`;
      idCounter += 1;

      const type = getObjectType(object);
      const name = getObjectName(
        object,
        type,
        depth === 0 ? fileName : "",
        unnamedCounts,
      );
      const path = parentPath ? `${parentPath}/${name}` : name;
      const node: SceneNode = {
        id,
        objectUuid: object.uuid,
        parentId,
        childIds: [],
        depth,
        name,
        type,
        path,
      };

      nodes.push(node);
      objectByNodeId.set(id, object);
      nodeIdByObjectUuid.set(object.uuid, id);
      expanded.add(id);

      for (const child of object.children) {
        const childId = walk(child, id, depth + 1, path);
        node.childIds.push(childId);
      }

      return id;
    };

    walk(root, null, 0, "");
    sceneNodes.value = nodes;
    expandedNodeIds.value = expanded;

    if (!options?.preserveSelection) {
      selectedNodeId.value = "";
      selectedNodeIds.value = new Set();
      rotorTargetConfigs.value = {};
      nodeSearch.value = "";
    }
  }

  function clearSceneTree() {
    sceneNodes.value = [];
    expandedNodeIds.value = new Set();
    selectedNodeId.value = "";
    selectedNodeIds.value = new Set();
    rotorTargetConfigs.value = {};
    nodeSearch.value = "";
    objectByNodeId.clear();
    nodeIdByObjectUuid.clear();
  }

  function toggleNodeExpansion(nodeId: string) {
    const next = new Set(expandedNodeIds.value);

    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }

    expandedNodeIds.value = next;
  }

  function expandAllNodes() {
    expandedNodeIds.value = new Set(sceneNodes.value.map((node) => node.id));
  }

  function collapseAllNodes() {
    expandedNodeIds.value = new Set();
  }

  function clearSelection() {
    selectedNodeId.value = "";
    selectedNodeIds.value = new Set();
    rotorTargetConfigs.value = {};
    selectedNodeRotation.value = null;
    clearSelectionOutline();
  }

  function toggleNodeSelection(nodeId: string, additive = false) {
    const object = objectByNodeId.get(nodeId);

    if (!object) {
      return;
    }

    if (additive) {
      const next = new Set(selectedNodeIds.value);
      if (next.has(nodeId)) {
        next.delete(nodeId);
        const configs = { ...rotorTargetConfigs.value };
        delete configs[nodeId];
        rotorTargetConfigs.value = configs;

        if (selectedNodeId.value === nodeId) {
          selectedNodeIds.value = next;
          const fallback = next.values().next().value;
          if (fallback) {
            selectNode(fallback);
          } else {
            clearSelection();
          }
          return;
        }

        selectedNodeIds.value = next;
        return;
      } else {
        next.add(nodeId);
        updateRotorTargetConfig(nodeId, createDefaultRotorTargetConfig(nodeId));
      }
      selectedNodeIds.value = next;
    } else {
      selectedNodeIds.value = new Set([nodeId]);
      syncRotorConfigsFromSelection();
    }

    selectedNodeId.value = nodeId;
    syncSelectedNodeRotation();
    updateSelectionOutline(object);
  }

  function selectNode(
    nodeId: string,
    scrollIntoView = false,
    additive = false,
  ) {
    toggleNodeSelection(nodeId, additive);

    if (scrollIntoView) {
      scrollSelectedNodeIntoView(nodeId);
    }
  }

  function scrollSelectedNodeIntoView(nodeId: string) {
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-node-id="${nodeId}"]`);
      element?.scrollIntoView({ block: "nearest" });
    });
  }

  function pickModelNode(event: PointerEvent) {
    if (!camera || !modelRoot || !canvasRef.value) {
      return;
    }

    const rect = canvasRef.value.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const pickableMeshes: THREE.Object3D[] = [];
    modelRoot.traverse((object) => {
      if (isMesh(object)) {
        pickableMeshes.push(object);
      }
    });

    const [hit] = raycaster.intersectObjects(pickableMeshes, false);
    const nodeId = hit ? findNearestNodeId(hit.object) : null;

    if (nodeId) {
      revealNodeAncestors(nodeId);
      selectNode(nodeId, true);
    } else {
      clearSelection();
    }
  }

  function revealNodeAncestors(nodeId: string) {
    const next = new Set(expandedNodeIds.value);
    const byId = sceneNodeById.value;
    let parentId = byId.get(nodeId)?.parentId ?? null;

    while (parentId) {
      next.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }

    expandedNodeIds.value = next;
  }

  function findNearestNodeId(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;

    while (current) {
      const nodeId = nodeIdByObjectUuid.get(current.uuid);

      if (nodeId) {
        return nodeId;
      }

      current = current.parent;
    }

    return null;
  }

  function updateSelectionOutline(object: THREE.Object3D) {
    if (!outlinePass) {
      return;
    }

    outlinePass.selectedObjects = [object];
  }

  function clearSelectionOutline() {
    if (!outlinePass) {
      return;
    }

    outlinePass.selectedObjects = [];
  }

  function fitCameraToBox(box: THREE.Box3) {
    if (!camera || !controls) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const cameraDistance =
      Math.abs(maxDimension / (2 * Math.tan(fov / 2))) * 1.9;

    camera.position.set(
      center.x + cameraDistance * 0.7,
      center.y + cameraDistance * 0.45,
      center.z + cameraDistance,
    );
    camera.near = Math.max(maxDimension / 1000, 0.001);
    camera.far = Math.max(maxDimension * 100, 1000);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.minDistance = Math.max(maxDimension * 0.02, 0.01);
    controls.maxDistance = Math.max(maxDimension * 12, 12);
    controls.update();
  }

  function configureGrid(size: number, x: number, y: number, z: number) {
    if (!scene) {
      return;
    }

    disposeGrid();

    const gridSize = Math.max(size, 4);
    const divisions = Math.min(Math.max(Math.round(gridSize * 2), 12), 80);
    gridHelper = new THREE.GridHelper(gridSize, divisions, 0x5a6a73, 0x2a343b);
    gridHelper.position.x = x;
    gridHelper.position.y = y;
    gridHelper.position.z = z;
    gridHelper.visible = gridVisible.value;
    scene.add(gridHelper);
  }

  function configureAxes(
    size: number,
    groundX: number,
    groundY: number,
    groundZ: number,
  ) {
    if (!scene) {
      return;
    }

    disposeAxes();

    const origin = new THREE.Vector3(groundX, groundY, groundZ);
    const headLength = Math.max(size * 0.14, 0.28);
    const headWidth = Math.max(size * 0.08, 0.16);
    const lineLength = size * 3.6;
    axesHelper = new THREE.Group();
    axesHelper.name = "World axes helper";
    axesHelper.renderOrder = 1000;

    const createAxisLine = (direction: THREE.Vector3, color: number) => {
      const points = [
        origin.clone().addScaledVector(direction, size),
        origin.clone().addScaledVector(direction, lineLength),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false,
        opacity: 0.72,
        toneMapped: false,
        transparent: true,
      });
      const line = new THREE.Line(geometry, material);
      line.renderOrder = 999;
      return line;
    };

    const helpers = [
      new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        origin,
        size,
        0xff4d4f,
        headLength,
        headWidth,
      ),
      new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        origin,
        size,
        0x7ed957,
        headLength,
        headWidth,
      ),
      new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1),
        origin,
        size,
        0x4488ff,
        headLength,
        headWidth,
      ),
    ];

    axesHelper.add(createAxisLine(new THREE.Vector3(1, 0, 0), 0xff4d4f));
    axesHelper.add(createAxisLine(new THREE.Vector3(0, 1, 0), 0x7ed957));
    axesHelper.add(createAxisLine(new THREE.Vector3(0, 0, 1), 0x4488ff));

    for (const helper of helpers) {
      helper.line.renderOrder = 1000;
      helper.cone.renderOrder = 1000;

      const arrowMaterials: THREE.Material[] = [
        ...toMaterialArray(helper.line.material),
        ...toMaterialArray(helper.cone.material),
      ];

      for (const material of arrowMaterials) {
        material.depthTest = false;
        material.depthWrite = false;
        material.transparent = true;
        material.opacity = 0.98;
        (material as THREE.Material & { toneMapped?: boolean }).toneMapped =
          false;
      }

      axesHelper.add(helper);
    }

    scene.add(axesHelper);
  }

  function disposeAxes() {
    if (!scene || !axesHelper) {
      axesHelper = null;
      return;
    }

    scene.remove(axesHelper);
    axesHelper.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();

        for (const material of toMaterialArray(object.material)) {
          material.dispose();
        }
      }
    });

    axesHelper = null;
  }

  function disposeGrid() {
    if (!scene || !gridHelper) {
      gridHelper = null;
      return;
    }

    scene.remove(gridHelper);
    gridHelper.geometry.dispose();

    for (const material of toMaterialArray(gridHelper.material)) {
      material.dispose();
    }

    gridHelper = null;
  }

  function applySceneBackground() {
    if (!scene || !renderer) {
      return;
    }

    if (backgroundMode.value === "light") {
      scene.background = new THREE.Color(0xf3f5f7);
      renderer.setClearAlpha(1);
      return;
    }

    if (backgroundMode.value === "transparent") {
      scene.background = null;
      renderer.setClearAlpha(0);
      return;
    }

    scene.background = new THREE.Color(0x0d1117);
    renderer.setClearAlpha(1);
  }

  function applyWireframe() {
    if (!modelRoot) {
      return;
    }

    modelRoot.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }

      for (const material of toMaterialArray(object.material)) {
        const wireframeMaterial = material as THREE.Material & {
          wireframe?: boolean;
        };
        wireframeMaterial.wireframe = wireframeVisible.value;
        material.needsUpdate = true;
      }
    });
  }

  function analyzeModel(
    root: THREE.Object3D,
    animations: THREE.AnimationClip[],
    primaryFile: File,
    files: File[],
    size: THREE.Vector3,
  ): ModelStats {
    const summary = summarizeObject(root);

    return {
      fileName: primaryFile.name,
      fileSize: formatBytes(primaryFile.size),
      format: getModelFormat(primaryFile),
      resourceCount: files.length,
      nodeCount: sceneNodes.value.length,
      meshCount: summary.meshCount,
      materialCount: summary.materialCount,
      textureCount: summary.textureCount,
      triangleCount: formatInteger(summary.triangleCount),
      dimensions: {
        x: formatDimension(size.x),
        y: formatDimension(size.y),
        z: formatDimension(size.z),
      },
      animations: animations.map((clip, index) => ({
        name: clip.name || `Animation ${index + 1}`,
        duration: `${formatDecimal(clip.duration)} 秒`,
      })),
    };
  }

  return {
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
    rotorTargetConfigs,
    rotorTargetConfigList,
    rotorAnimationName,
    exportFileName,
    hasImportedAnimations,
    hasExistingAnimations,
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
    nodeSearch,
    visibleSceneNodes,
    selectedNodeDetails,
    moveModeEnabled,
    modelPosition,
    selectedNodeRotation,
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
  };
}
