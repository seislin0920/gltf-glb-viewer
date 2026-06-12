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
import type {
  BackgroundMode,
  ModelStats,
  SceneNode,
  SelectedNodeDetails,
  Vector3Values,
} from "../types/glb-viewer";

export function useGlbViewer() {
  const canvasRef = shallowRef<HTMLCanvasElement | null>(null);
  const viewportRef = shallowRef<HTMLElement | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);

  const loading = ref(false);
  const loadProgress = ref("");
  const errorMessage = ref("");
  const isDragging = ref(false);
  const rendererReady = ref(false);
  const modelLoaded = ref(false);
  const gridVisible = ref(true);
  const wireframeVisible = ref(false);
  const backgroundMode = ref<BackgroundMode>("studio");
  const isAnimationPlaying = ref(false);
  const activeAnimationIndex = ref(0);
  const stats = ref<ModelStats | null>(null);
  const animationClips = ref<THREE.AnimationClip[]>([]);
  const sceneNodes = ref<SceneNode[]>([]);
  const expandedNodeIds = ref<Set<string>>(new Set());
  const selectedNodeId = ref("");
  const nodeSearch = ref("");
  const moveModeEnabled = ref(false);
  const modelPosition = ref<Vector3Values>({ x: 0, y: 0, z: 0 });

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

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  // 模型載入時的原始中心；UI 座標以 -originalCenter（座標軸原點）為參考原點
  const modelOriginOffset = new THREE.Vector3();
  const objectByNodeId = new Map<string, THREE.Object3D>();
  const nodeIdByObjectUuid = new Map<string, string>();

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
    outlinePass.edgeStrength = 6;
    outlinePass.edgeGlow = 0;
    outlinePass.edgeThickness = 1.25;
    outlinePass.visibleEdgeColor.set(0xffffff);
    outlinePass.hiddenEdgeColor.set(0xffffff);
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
    animationClips.value = gltf.animations;
    activeAnimationIndex.value = 0;
    mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(root) : null;

    buildSceneTree(root, primaryFile.name);
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
      mixer.clipAction(gltf.animations[0]).reset().play();
    }

    stats.value = analyzeModel(
      root,
      gltf.animations,
      primaryFile,
      files,
      originalSize,
    );
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
      isAnimationPlaying.value = false;
      modelLoaded.value = false;
      stats.value = null;
      return;
    }

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
    isAnimationPlaying.value = false;
    modelLoaded.value = false;
    stats.value = null;
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

  function playAnimation(index: number) {
    if (!mixer || !animationClips.value[index]) {
      return;
    }

    mixer.stopAllAction();
    mixer.clipAction(animationClips.value[index]).reset().play();
    activeAnimationIndex.value = index;
    isAnimationPlaying.value = true;
  }

  function toggleAnimationPlayback() {
    if (!mixer || animationClips.value.length === 0) {
      return;
    }

    isAnimationPlaying.value = !isAnimationPlaying.value;
  }

  function buildSceneTree(root: THREE.Object3D, fileName: string) {
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
    selectedNodeId.value = "";
    nodeSearch.value = "";
  }

  function clearSceneTree() {
    sceneNodes.value = [];
    expandedNodeIds.value = new Set();
    selectedNodeId.value = "";
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

  function selectNode(nodeId: string, scrollIntoView = false) {
    const object = objectByNodeId.get(nodeId);

    if (!object) {
      return;
    }

    selectedNodeId.value = nodeId;
    updateSelectionOutline(object);

    if (scrollIntoView) {
      scrollSelectedNodeIntoView(nodeId);
    }
  }

  function clearSelection() {
    selectedNodeId.value = "";
    clearSelectionOutline();
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
    nodeSearch,
    visibleSceneNodes,
    selectedNodeDetails,
    moveModeEnabled,
    modelPosition,
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
    toggleGrid,
    toggleWireframe,
    setBackgroundMode,
    playAnimation,
    toggleAnimationPlayback,
    toggleNodeExpansion,
    expandAllNodes,
    collapseAllNodes,
    selectNode,
  };
}
