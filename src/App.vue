<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { ViewHelper } from 'three/examples/jsm/helpers/ViewHelper.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import {
  GLTFLoader,
  type GLTF,
  type GLTFLoaderPlugin,
  type GLTFParser,
} from 'three/examples/jsm/loaders/GLTFLoader.js'

type BackgroundMode = 'studio' | 'light' | 'transparent'

const SPECULAR_GLOSSINESS_EXTENSION = 'KHR_materials_pbrSpecularGlossiness'

interface AnimationInfo {
  name: string
  duration: string
}

interface ModelStats {
  fileName: string
  fileSize: string
  format: string
  resourceCount: number
  nodeCount: number
  meshCount: number
  materialCount: number
  textureCount: number
  triangleCount: string
  dimensions: {
    x: string
    y: string
    z: string
  }
  animations: AnimationInfo[]
}

interface SceneNode {
  id: string
  objectUuid: string
  parentId: string | null
  childIds: string[]
  depth: number
  name: string
  type: string
  path: string
}

interface SelectedNodeDetails {
  name: string
  type: string
  path: string
  meshCount: number
  triangleCount: string
  dimensions: {
    x: string
    y: string
    z: string
  }
  transform: {
    position: {
      x: string
      y: string
      z: string
    }
    rotation: {
      x: string
      y: string
      z: string
    }
    scale: {
      x: string
      y: string
      z: string
    }
  }
}

interface GLTFTextureInfo {
  index: number
  texCoord?: number
  extensions?: Record<string, unknown>
}

interface SpecularGlossinessExtension {
  diffuseFactor?: [number, number, number, number]
  diffuseTexture?: GLTFTextureInfo
  glossinessFactor?: number
  specularFactor?: [number, number, number]
  specularGlossinessTexture?: GLTFTextureInfo
}

interface GLTFMaterialDef {
  extensions?: Record<string, unknown>
}

class SpecularGlossinessCompatibilityPlugin implements GLTFLoaderPlugin {
  readonly name = SPECULAR_GLOSSINESS_EXTENSION

  private readonly parser: GLTFParser

  constructor(parser: GLTFParser) {
    this.parser = parser
  }

  getMaterialType(materialIndex: number) {
    return this.getExtension(materialIndex) ? THREE.MeshPhysicalMaterial : null
  }

  extendMaterialParams(materialIndex: number, materialParams: { [key: string]: unknown }) {
    const extension = this.getExtension(materialIndex)

    if (!extension) {
      return Promise.resolve()
    }

    const params = materialParams as THREE.MeshPhysicalMaterialParameters & {
      specularColor?: THREE.Color
      specularColorMap?: THREE.Texture
      specularIntensity?: number
    }
    const pending: Promise<THREE.Texture | null>[] = []
    const diffuseFactor = extension.diffuseFactor ?? [1, 1, 1, 1]
    const specularFactor = extension.specularFactor ?? [1, 1, 1]
    const glossinessFactor = extension.glossinessFactor ?? 1

    params.color = new THREE.Color().setRGB(
      diffuseFactor[0],
      diffuseFactor[1],
      diffuseFactor[2],
      THREE.LinearSRGBColorSpace,
    )
    params.opacity = diffuseFactor[3]
    params.metalness = 0
    params.roughness = THREE.MathUtils.clamp(1 - glossinessFactor, 0.06, 1)
    params.specularColor = new THREE.Color().setRGB(
      specularFactor[0],
      specularFactor[1],
      specularFactor[2],
      THREE.LinearSRGBColorSpace,
    )
    params.specularIntensity = THREE.MathUtils.clamp(average(specularFactor), 0, 1)

    if (extension.diffuseTexture) {
      pending.push(
        this.parser.assignTexture(
          materialParams,
          'map',
          extension.diffuseTexture,
          THREE.SRGBColorSpace,
        ),
      )
    }

    if (extension.specularGlossinessTexture) {
      pending.push(
        this.parser.assignTexture(
          materialParams,
          'specularColorMap',
          extension.specularGlossinessTexture,
          THREE.SRGBColorSpace,
        ),
      )
    }

    return Promise.all(pending).then(() => undefined)
  }

  private getExtension(materialIndex: number) {
    const materialDef = this.parser.json.materials?.[materialIndex] as GLTFMaterialDef | undefined
    return materialDef?.extensions?.[SPECULAR_GLOSSINESS_EXTENSION] as
      | SpecularGlossinessExtension
      | undefined
  }
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const viewportRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const loading = ref(false)
const loadProgress = ref('')
const errorMessage = ref('')
const isDragging = ref(false)
const rendererReady = ref(false)
const modelLoaded = ref(false)
const gridVisible = ref(true)
const wireframeVisible = ref(false)
const backgroundMode = ref<BackgroundMode>('studio')
const isAnimationPlaying = ref(false)
const activeAnimationIndex = ref(0)
const stats = ref<ModelStats | null>(null)
const animationClips = ref<THREE.AnimationClip[]>([])
const sceneNodes = ref<SceneNode[]>([])
const expandedNodeIds = ref<Set<string>>(new Set())
const selectedNodeId = ref('')
const nodeSearch = ref('')

const hasModel = computed(() => modelLoaded.value)
const sceneNodeById = computed(() => new Map(sceneNodes.value.map((node) => [node.id, node])))
const selectedNode = computed(() => sceneNodeById.value.get(selectedNodeId.value) ?? null)
const visibleSceneNodes = computed(() => {
  const query = nodeSearch.value.trim().toLowerCase()
  const nodes = sceneNodes.value
  const byId = sceneNodeById.value

  if (query) {
    return nodes.filter((node) => {
      return (
        node.name.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query) ||
        node.path.toLowerCase().includes(query)
      )
    })
  }

  return nodes.filter((node) => isTreeNodeVisible(node, byId, expandedNodeIds.value))
})
const selectedNodeDetails = computed<SelectedNodeDetails | null>(() => {
  const node = selectedNode.value

  if (!node) {
    return null
  }

  const object = objectByNodeId.get(node.id)

  if (!object) {
    return null
  }

  const summary = summarizeObject(object)

  return {
    name: node.name,
    type: node.type,
    path: node.path,
    meshCount: summary.meshCount,
    triangleCount: formatInteger(summary.triangleCount),
    dimensions: summary.dimensions,
    transform: {
      position: formatTransformVector(object.position),
      rotation: formatTransformVector(object.rotation),
      scale: formatTransformVector(object.scale),
    },
  }
})

let renderer: THREE.WebGLRenderer | null = null
let composer: EffectComposer | null = null
let outlinePass: OutlinePass | null = null
let viewHelper: ViewHelper | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let resizeObserver: ResizeObserver | null = null
let modelRoot: THREE.Object3D | null = null
let axesHelper: THREE.Group | null = null
let gridHelper: THREE.GridHelper | null = null
let mixer: THREE.AnimationMixer | null = null
let environmentMap: THREE.WebGLRenderTarget | null = null
let frameId = 0
let currentObjectUrls: string[] = []
let pointerDown: { x: number; y: number; button: number } | null = null

const clock = new THREE.Clock()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const objectByNodeId = new Map<string, THREE.Object3D>()
const nodeIdByObjectUuid = new Map<string, string>()

onMounted(() => {
  initScene()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId)
  resizeObserver?.disconnect()
  disposeCurrentModel()
  disposeAxes()
  disposeGrid()
  environmentMap?.dispose()
  viewHelper?.dispose()
  controls?.dispose()
  composer?.dispose()
  renderer?.dispose()
  revokeUrls(currentObjectUrls)
})

function initScene() {
  const canvas = canvasRef.value
  const viewport = viewportRef.value

  if (!canvas || !viewport) {
    return
  }

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
  camera.position.set(4, 3, 6)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    canvas,
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera)
  outlinePass.edgeStrength = 6
  outlinePass.edgeGlow = 0
  outlinePass.edgeThickness = 1.25
  outlinePass.visibleEdgeColor.set(0xffffff)
  outlinePass.hiddenEdgeColor.set(0xffffff)
  outlinePass.pulsePeriod = 0
  composer.addPass(outlinePass)
  composer.addPass(new OutputPass())
  viewHelper = new ViewHelper(camera, viewport)
  viewHelper.location.right = 40
  viewHelper.location.bottom = 40
  viewHelper.setLabelStyle('24px Arial', '#000000', 18)
  viewHelper.setLabels('X', 'Y', 'Z')

  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = true

  const environment = new RoomEnvironment()
  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  environmentMap = pmremGenerator.fromScene(environment, 0.04)
  scene.environment = environmentMap.texture
  environment.dispose()
  pmremGenerator.dispose()

  const hemisphereLight = new THREE.HemisphereLight(0xf8fbff, 0x2f261c, 1.2)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
  const fillLight = new THREE.DirectionalLight(0xffe0b3, 0.45)
  keyLight.position.set(4, 6, 5)
  fillLight.position.set(-5, 3, -4)
  scene.add(hemisphereLight, keyLight, fillLight)

  applySceneBackground()
  configureAxes(1.5, 0)
  configureGrid(8, 0)
  resizeRenderer()

  resizeObserver = new ResizeObserver(resizeRenderer)
  resizeObserver.observe(viewport)

  rendererReady.value = true
  animate()
}

function animate() {
  frameId = requestAnimationFrame(animate)

  if (!renderer || !scene || !camera) {
    return
  }

  const delta = clock.getDelta()

  if (mixer && isAnimationPlaying.value) {
    mixer.update(delta)
  }

  if (viewHelper && controls) {
    viewHelper.center.copy(controls.target)
    if (viewHelper.animating) {
      viewHelper.update(delta)
    }
  }

  controls?.update()
  composer?.render()
  if (viewHelper) {
    renderer.autoClear = false
    viewHelper.render(renderer)
    renderer.autoClear = true
  }
}

function resizeRenderer() {
  if (!renderer || !composer || !outlinePass || !camera || !viewportRef.value) {
    return
  }

  const { width, height } = viewportRef.value.getBoundingClientRect()

  if (width <= 0 || height <= 0) {
    return
  }

  renderer.setSize(width, height, false)
  composer.setSize(width, height)
  outlinePass.setSize(width, height)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function pickFiles() {
  fileInputRef.value?.click()
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  void loadFiles(files)
}

function handleDragEnter() {
  isDragging.value = true
}

function handleDragOver() {
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget as Node | null
  const relatedTarget = event.relatedTarget as Node | null

  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }

  isDragging.value = false
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  const files = Array.from(event.dataTransfer?.files ?? [])
  void loadFiles(files)
}

function handleCanvasPointerDown(event: PointerEvent) {
  pointerDown = {
    x: event.clientX,
    y: event.clientY,
    button: event.button,
  }
}

function handleCanvasPointerUp(event: PointerEvent) {
  if (!pointerDown || pointerDown.button !== 0) {
    pointerDown = null
    return
  }

  const moveDistance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  pointerDown = null

  if (moveDistance > 5) {
    return
  }

  if (viewHelper?.handleClick(event)) {
    return
  }

  pickModelNode(event)
}

async function loadFiles(files: File[]) {
  const primaryFile = findPrimaryModelFile(files)

  if (!primaryFile) {
    errorMessage.value = '請選擇或拖放 .glb 或 .gltf 檔案。'
    return
  }

  loading.value = true
  loadProgress.value = '準備模型資源'
  errorMessage.value = ''

  const resourceSet = createResourceSet(files)
  const primaryUrl = resourceSet.urlsByKey.get(getFileKey(primaryFile))

  if (!primaryUrl) {
    loading.value = false
    errorMessage.value = '無法建立模型檔案的本機讀取位置。'
    revokeUrls(resourceSet.objectUrls)
    return
  }

  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => resolveResourceUrl(url, resourceSet.urlsByKey))
  manager.onProgress = (_url, loaded, total) => {
    loadProgress.value = total > 0 ? `載入資源 ${loaded}/${total}` : '載入資源'
  }

  const loader = new GLTFLoader(manager)
  loader.register((parser) => new SpecularGlossinessCompatibilityPlugin(parser))

  try {
    const gltf = await loader.loadAsync(primaryUrl)
    installModel(gltf, primaryFile, files, resourceSet.objectUrls)
  } catch (error) {
    revokeUrls(resourceSet.objectUrls)
    errorMessage.value = buildErrorMessage(primaryFile, error)
  } finally {
    loading.value = false
    loadProgress.value = ''
  }
}

function installModel(gltf: GLTF, primaryFile: File, files: File[], objectUrls: string[]) {
  if (!scene) {
    revokeUrls(objectUrls)
    return
  }

  const root = gltf.scene || gltf.scenes[0]

  if (!root) {
    revokeUrls(objectUrls)
    errorMessage.value = '這個檔案沒有可顯示的場景。'
    return
  }

  loadProgress.value = '解析模型資訊'

  const originalBox = new THREE.Box3().setFromObject(root)
  const originalSize = originalBox.getSize(new THREE.Vector3())
  const originalCenter = originalBox.getCenter(new THREE.Vector3())

  disposeCurrentModel()
  revokeUrls(currentObjectUrls)
  currentObjectUrls = objectUrls

  root.position.sub(originalCenter)
  scene.add(root)
  modelRoot = root
  modelLoaded.value = true
  animationClips.value = gltf.animations
  activeAnimationIndex.value = 0
  mixer = gltf.animations.length > 0 ? new THREE.AnimationMixer(root) : null
  isAnimationPlaying.value = gltf.animations.length > 0

  buildSceneTree(root, primaryFile.name)
  applyWireframe()

  const fittedBox = new THREE.Box3().setFromObject(root)
  const fittedSize = fittedBox.getSize(new THREE.Vector3())
  const maxDimension = Math.max(fittedSize.x, fittedSize.y, fittedSize.z, 1)
  configureAxes(Math.max(maxDimension * 0.24, 1), fittedBox.min.y)
  configureGrid(maxDimension * 1.5, fittedBox.min.y)
  fitCameraToBox(fittedBox)

  if (mixer && gltf.animations[0]) {
    mixer.clipAction(gltf.animations[0]).reset().play()
  }

  stats.value = analyzeModel(root, gltf.animations, primaryFile, files, originalSize)
}

function disposeCurrentModel() {
  clearSelection()
  clearSceneTree()

  if (!scene || !modelRoot) {
    modelRoot = null
    mixer = null
    animationClips.value = []
    isAnimationPlaying.value = false
    modelLoaded.value = false
    stats.value = null
    return
  }

  scene.remove(modelRoot)

  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  modelRoot.traverse((object) => {
    if (!isMesh(object)) {
      return
    }

    geometries.add(object.geometry)

    for (const material of toMaterialArray(object.material)) {
      materials.add(material)
      collectMaterialTextures(material, textures)
    }
  })

  for (const geometry of geometries) {
    geometry.dispose()
  }

  for (const texture of textures) {
    texture.dispose()
  }

  for (const material of materials) {
    material.dispose()
  }

  modelRoot = null
  mixer = null
  animationClips.value = []
  isAnimationPlaying.value = false
  modelLoaded.value = false
  stats.value = null
}

function resetCamera() {
  if (!modelRoot) {
    camera?.position.set(4, 3, 6)
    controls?.target.set(0, 0, 0)
    controls?.update()
    return
  }

  fitCameraToBox(new THREE.Box3().setFromObject(modelRoot))
}

function toggleGrid() {
  gridVisible.value = !gridVisible.value

  if (gridHelper) {
    gridHelper.visible = gridVisible.value
  }
}

function toggleWireframe() {
  wireframeVisible.value = !wireframeVisible.value
  applyWireframe()
}

function setBackgroundMode(mode: BackgroundMode) {
  backgroundMode.value = mode
  applySceneBackground()
}

function playAnimation(index: number) {
  if (!mixer || !animationClips.value[index]) {
    return
  }

  mixer.stopAllAction()
  mixer.clipAction(animationClips.value[index]).reset().play()
  activeAnimationIndex.value = index
  isAnimationPlaying.value = true
}

function toggleAnimationPlayback() {
  if (!mixer || animationClips.value.length === 0) {
    return
  }

  isAnimationPlaying.value = !isAnimationPlaying.value
}

function buildSceneTree(root: THREE.Object3D, fileName: string) {
  const nodes: SceneNode[] = []
  const expanded = new Set<string>()
  const unnamedCounts = new Map<string, number>()
  let idCounter = 0

  objectByNodeId.clear()
  nodeIdByObjectUuid.clear()

  const walk = (object: THREE.Object3D, parentId: string | null, depth: number, parentPath: string) => {
    const id = `node-${idCounter}`
    idCounter += 1

    const type = getObjectType(object)
    const name = getObjectName(object, type, depth === 0 ? fileName : '', unnamedCounts)
    const path = parentPath ? `${parentPath}/${name}` : name
    const node: SceneNode = {
      id,
      objectUuid: object.uuid,
      parentId,
      childIds: [],
      depth,
      name,
      type,
      path,
    }

    nodes.push(node)
    objectByNodeId.set(id, object)
    nodeIdByObjectUuid.set(object.uuid, id)
    expanded.add(id)

    for (const child of object.children) {
      const childId = walk(child, id, depth + 1, path)
      node.childIds.push(childId)
    }

    return id
  }

  walk(root, null, 0, '')
  sceneNodes.value = nodes
  expandedNodeIds.value = expanded
  selectedNodeId.value = ''
  nodeSearch.value = ''
}

function clearSceneTree() {
  sceneNodes.value = []
  expandedNodeIds.value = new Set()
  selectedNodeId.value = ''
  nodeSearch.value = ''
  objectByNodeId.clear()
  nodeIdByObjectUuid.clear()
}

function toggleNodeExpansion(nodeId: string) {
  const next = new Set(expandedNodeIds.value)

  if (next.has(nodeId)) {
    next.delete(nodeId)
  } else {
    next.add(nodeId)
  }

  expandedNodeIds.value = next
}

function expandAllNodes() {
  expandedNodeIds.value = new Set(sceneNodes.value.map((node) => node.id))
}

function collapseAllNodes() {
  expandedNodeIds.value = new Set()
}

function selectNode(nodeId: string, scrollIntoView = false) {
  const object = objectByNodeId.get(nodeId)

  if (!object) {
    return
  }

  selectedNodeId.value = nodeId
  updateSelectionOutline(object)

  if (scrollIntoView) {
    scrollSelectedNodeIntoView(nodeId)
  }
}

function clearSelection() {
  selectedNodeId.value = ''
  clearSelectionOutline()
}

function scrollSelectedNodeIntoView(nodeId: string) {
  requestAnimationFrame(() => {
    const element = document.querySelector(`[data-node-id="${nodeId}"]`)
    element?.scrollIntoView({ block: 'nearest' })
  })
}

function pickModelNode(event: PointerEvent) {
  if (!camera || !modelRoot || !canvasRef.value) {
    return
  }

  const rect = canvasRef.value.getBoundingClientRect()

  if (rect.width <= 0 || rect.height <= 0) {
    return
  }

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)

  const pickableMeshes: THREE.Object3D[] = []
  modelRoot.traverse((object) => {
    if (isMesh(object)) {
      pickableMeshes.push(object)
    }
  })

  const [hit] = raycaster.intersectObjects(pickableMeshes, false)
  const nodeId = hit ? findNearestNodeId(hit.object) : null

  if (nodeId) {
    revealNodeAncestors(nodeId)
    selectNode(nodeId, true)
  } else {
    clearSelection()
  }
}

function revealNodeAncestors(nodeId: string) {
  const next = new Set(expandedNodeIds.value)
  const byId = sceneNodeById.value
  let parentId = byId.get(nodeId)?.parentId ?? null

  while (parentId) {
    next.add(parentId)
    parentId = byId.get(parentId)?.parentId ?? null
  }

  expandedNodeIds.value = next
}

function findNearestNodeId(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object

  while (current) {
    const nodeId = nodeIdByObjectUuid.get(current.uuid)

    if (nodeId) {
      return nodeId
    }

    current = current.parent
  }

  return null
}

function updateSelectionOutline(object: THREE.Object3D) {
  if (!outlinePass) {
    return
  }

  outlinePass.selectedObjects = [object]
}

function clearSelectionOutline() {
  if (!outlinePass) {
    return
  }

  outlinePass.selectedObjects = []
}

function fitCameraToBox(box: THREE.Box3) {
  if (!camera || !controls) {
    return
  }

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDimension = Math.max(size.x, size.y, size.z, 1)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const cameraDistance = Math.abs(maxDimension / (2 * Math.tan(fov / 2))) * 1.9

  camera.position.set(
    center.x + cameraDistance * 0.7,
    center.y + cameraDistance * 0.45,
    center.z + cameraDistance,
  )
  camera.near = Math.max(maxDimension / 1000, 0.001)
  camera.far = Math.max(maxDimension * 100, 1000)
  camera.updateProjectionMatrix()

  controls.target.copy(center)
  controls.minDistance = Math.max(maxDimension * 0.02, 0.01)
  controls.maxDistance = Math.max(maxDimension * 12, 12)
  controls.update()
}

function configureGrid(size: number, y: number) {
  if (!scene) {
    return
  }

  disposeGrid()

  const gridSize = Math.max(size, 4)
  const divisions = Math.min(Math.max(Math.round(gridSize * 2), 12), 80)
  gridHelper = new THREE.GridHelper(gridSize, divisions, 0x5a6a73, 0x2a343b)
  gridHelper.position.y = y
  gridHelper.visible = gridVisible.value
  scene.add(gridHelper)
}

function configureAxes(size: number, groundY: number) {
  if (!scene) {
    return
  }

  disposeAxes()

  const origin = new THREE.Vector3(0, groundY + 0.01, 0)
  const headLength = Math.max(size * 0.14, 0.28)
  const headWidth = Math.max(size * 0.08, 0.16)
  const lineLength = size * 3.6
  axesHelper = new THREE.Group()
  axesHelper.name = 'World axes helper'
  axesHelper.renderOrder = 1000

  const createAxisLine = (direction: THREE.Vector3, color: number) => {
    const points = [
      origin.clone().addScaledVector(direction, size),
      origin.clone().addScaledVector(direction, lineLength),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      opacity: 0.72,
      toneMapped: false,
      transparent: true,
    })
    const line = new THREE.Line(geometry, material)
    line.renderOrder = 999
    return line
  }

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
  ]

  axesHelper.add(createAxisLine(new THREE.Vector3(1, 0, 0), 0xff4d4f))
  axesHelper.add(createAxisLine(new THREE.Vector3(0, 1, 0), 0x7ed957))
  axesHelper.add(createAxisLine(new THREE.Vector3(0, 0, 1), 0x4488ff))

  for (const helper of helpers) {
    helper.line.renderOrder = 1000
    helper.cone.renderOrder = 1000

    const arrowMaterials: THREE.Material[] = [
      ...toMaterialArray(helper.line.material),
      ...toMaterialArray(helper.cone.material),
    ]

    for (const material of arrowMaterials) {
      material.depthTest = false
      material.depthWrite = false
      material.transparent = true
      material.opacity = 0.98
      ;(material as THREE.Material & { toneMapped?: boolean }).toneMapped = false
    }

    axesHelper.add(helper)
  }

  scene.add(axesHelper)
}

function disposeAxes() {
  if (!scene || !axesHelper) {
    axesHelper = null
    return
  }

  scene.remove(axesHelper)
  axesHelper.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose()

      for (const material of toMaterialArray(object.material)) {
        material.dispose()
      }
    }
  })

  axesHelper = null
}

function disposeGrid() {
  if (!scene || !gridHelper) {
    gridHelper = null
    return
  }

  scene.remove(gridHelper)
  gridHelper.geometry.dispose()

  for (const material of toMaterialArray(gridHelper.material)) {
    material.dispose()
  }

  gridHelper = null
}

function applySceneBackground() {
  if (!scene || !renderer) {
    return
  }

  if (backgroundMode.value === 'light') {
    scene.background = new THREE.Color(0xf3f5f7)
    renderer.setClearAlpha(1)
    return
  }

  if (backgroundMode.value === 'transparent') {
    scene.background = null
    renderer.setClearAlpha(0)
    return
  }

  scene.background = new THREE.Color(0x0d1117)
  renderer.setClearAlpha(1)
}

function applyWireframe() {
  if (!modelRoot) {
    return
  }

  modelRoot.traverse((object) => {
    if (!isMesh(object)) {
      return
    }

    for (const material of toMaterialArray(object.material)) {
      const wireframeMaterial = material as THREE.Material & { wireframe?: boolean }
      wireframeMaterial.wireframe = wireframeVisible.value
      material.needsUpdate = true
    }
  })
}

function analyzeModel(
  root: THREE.Object3D,
  animations: THREE.AnimationClip[],
  primaryFile: File,
  files: File[],
  size: THREE.Vector3,
): ModelStats {
  const summary = summarizeObject(root)

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
  }
}

function summarizeObject(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  let meshCount = 0
  let triangleCount = 0

  object.traverse((child) => {
    if (!isMesh(child)) {
      return
    }

    meshCount += 1
    triangleCount += countGeometryTriangles(child.geometry)

    for (const material of toMaterialArray(child.material)) {
      materials.add(material)
      collectMaterialTextures(material, textures)
    }
  })

  return {
    meshCount,
    materialCount: materials.size,
    textureCount: textures.size,
    triangleCount,
    dimensions: {
      x: formatDimension(size.x),
      y: formatDimension(size.y),
      z: formatDimension(size.z),
    },
  }
}

function countGeometryTriangles(geometry: THREE.BufferGeometry) {
  if (geometry.index) {
    return Math.floor(geometry.index.count / 3)
  }

  const position = geometry.getAttribute('position')
  return position ? Math.floor(position.count / 3) : 0
}

function collectMaterialTextures(material: THREE.Material, textures: Set<THREE.Texture>) {
  const record = material as THREE.Material & Record<string, unknown>

  for (const value of Object.values(record)) {
    if (isTexture(value)) {
      textures.add(value)
    }
  }
}

function isTreeNodeVisible(
  node: SceneNode,
  byId: Map<string, SceneNode>,
  expanded: Set<string>,
) {
  let parentId = node.parentId

  while (parentId) {
    if (!expanded.has(parentId)) {
      return false
    }

    parentId = byId.get(parentId)?.parentId ?? null
  }

  return true
}

function getObjectType(object: THREE.Object3D) {
  if (isMesh(object)) {
    return 'Mesh'
  }

  return object.type || 'Object3D'
}

function getObjectName(
  object: THREE.Object3D,
  type: string,
  rootFallbackName: string,
  unnamedCounts: Map<string, number>,
) {
  const rawName = object.name.trim()

  if (rawName) {
    return rawName
  }

  if (rootFallbackName) {
    return rootFallbackName
  }

  const count = (unnamedCounts.get(type) ?? 0) + 1
  unnamedCounts.set(type, count)
  return `${type}_${count}`
}

function findPrimaryModelFile(files: File[]) {
  return files.find((file) => isModelFile(file)) ?? null
}

function isModelFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.glb') || name.endsWith('.gltf')
}

function getModelFormat(file: File) {
  return file.name.toLowerCase().endsWith('.glb') ? 'Binary GLB' : 'JSON GLTF'
}

function createResourceSet(files: File[]) {
  const urlsByKey = new Map<string, string>()
  const objectUrls: string[] = []

  for (const file of files) {
    const objectUrl = URL.createObjectURL(file)
    objectUrls.push(objectUrl)

    for (const key of getPossibleFileKeys(file)) {
      urlsByKey.set(key, objectUrl)
    }
  }

  return { objectUrls, urlsByKey }
}

function resolveResourceUrl(url: string, urlsByKey: Map<string, string>) {
  const cleanUrl = normalizeResourcePath(url)
  const candidates = [
    cleanUrl,
    cleanUrl.replace(/^\.\//, ''),
    cleanUrl.split('/').pop() ?? cleanUrl,
  ]

  for (const candidate of candidates) {
    const resourceUrl = urlsByKey.get(candidate)

    if (resourceUrl) {
      return resourceUrl
    }
  }

  return url
}

function getPossibleFileKeys(file: File) {
  const keys = new Set<string>()
  const fileWithPath = file as File & { webkitRelativePath?: string }
  keys.add(getFileKey(file))

  if (fileWithPath.webkitRelativePath) {
    keys.add(normalizeResourcePath(fileWithPath.webkitRelativePath))
  }

  return Array.from(keys)
}

function getFileKey(file: File) {
  return normalizeResourcePath(file.name)
}

function normalizeResourcePath(path: string) {
  const withoutQuery = path.split('?')[0]?.split('#')[0] ?? path
  const decoded = safeDecodeUri(withoutQuery)
  return decoded.replace(/\\/g, '/').replace(/^\/+/, '')
}

function safeDecodeUri(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function buildErrorMessage(primaryFile: File, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)

  if (primaryFile.name.toLowerCase().endsWith('.gltf')) {
    return `載入失敗。請確認 .gltf、.bin 與貼圖檔案是同一次選取或拖放，且檔名路徑一致。${detail ? ` (${detail})` : ''}`
  }

  return `載入失敗。請確認檔案是有效的 GLB/GLTF 模型。${detail ? ` (${detail})` : ''}`
}

function revokeUrls(urls: string[]) {
  for (const url of urls) {
    URL.revokeObjectURL(url)
  }
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true
}

function isTexture(value: unknown): value is THREE.Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isTexture?: boolean }).isTexture === true
  )
}

function toMaterialArray(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material]
}

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${formatDecimal(value)} ${units[unitIndex]}`
}

function formatDimension(value: number) {
  return Number.isFinite(value) ? formatDecimal(value) : '0'
}

function formatTransformVector(vector: THREE.Vector3 | THREE.Euler) {
  return {
    x: formatDecimal(vector.x),
    y: formatDecimal(vector.y),
    z: formatDecimal(vector.z),
  }
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: value >= 10 ? 1 : 3,
  }).format(value)
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}
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

    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">3D</span>
        <div class="brand-copy">
          <h1>GLB / GLTF 檢視器</h1>
          <p>本機檔案直接檢視，不上傳模型資料。</p>
        </div>
      </div>

      <button class="primary-button" type="button" @click="pickFiles">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
        選擇模型
      </button>
    </header>

    <main class="workspace">
      <aside class="scene-sidebar" aria-label="場景節點">
        <section class="panel tree-panel">
          <div class="panel-heading">
            <span>場景</span>
            <span class="node-count">{{ sceneNodes.length }}</span>
          </div>

          <div class="scene-search">
            <input v-model="nodeSearch" type="search" placeholder="搜尋節點" aria-label="搜尋節點" />
          </div>

          <div class="tree-actions">
            <button type="button" @click="expandAllNodes">展開</button>
            <button type="button" @click="collapseAllNodes">收合</button>
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
                @click.stop="toggleNodeExpansion(node.id)"
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
                @click="selectNode(node.id)"
              >
                <span class="node-type">{{ node.type }}</span>
                <span class="node-name">{{ node.name }}</span>
              </button>
            </div>

            <p v-if="visibleSceneNodes.length === 0" class="tree-empty">沒有符合搜尋的節點。</p>
          </div>
        </section>
      </aside>

      <section
        ref="viewportRef"
        class="viewport"
        :class="{ 'is-dragging': isDragging, 'has-model': hasModel }"
        aria-label="3D 模型檢視區"
      >
        <canvas
          ref="canvasRef"
          @pointerdown="handleCanvasPointerDown"
          @pointerup="handleCanvasPointerUp"
        ></canvas>

        <div v-if="rendererReady" class="viewer-toolbar" aria-label="檢視控制">
          <button class="icon-button" type="button" title="重設視角" aria-label="重設視角" @click="resetCamera">
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
            @click="toggleGrid"
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
            @click="toggleWireframe"
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
              @click="setBackgroundMode('studio')"
            >
              暗
            </button>
            <button
              type="button"
              :class="{ active: backgroundMode === 'light' }"
              @click="setBackgroundMode('light')"
            >
              亮
            </button>
            <button
              type="button"
              :class="{ active: backgroundMode === 'transparent' }"
              @click="setBackgroundMode('transparent')"
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
          <button class="secondary-button" type="button" @click="pickFiles">選擇本機檔案</button>
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

      <aside class="inspector" aria-label="模型資訊">
        <section class="panel">
          <div class="panel-heading">
            <span>狀態</span>
            <span class="status-pill" :class="{ ready: hasModel, loading }">
              {{ loading ? '載入中' : hasModel ? '已載入' : '待選檔' }}
            </span>
          </div>

          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
          <p v-else-if="hasModel" class="muted">點擊模型或左側節點可選取，選中物件會顯示白色邊緣線。</p>
          <p v-else class="muted">選擇單一 GLB，或同批選取 GLTF 與相依資源。</p>
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
                {{ selectedNodeDetails.dimensions.x }} x {{ selectedNodeDetails.dimensions.y }} x
                {{ selectedNodeDetails.dimensions.z }}
              </dd>
            </div>
          </dl>
        </section>

        <section v-if="selectedNodeDetails" class="panel">
          <div class="panel-heading">
            <span>變換</span>
          </div>
          <div class="transform-grid" role="table" aria-label="節點變換">
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
              <span>{{ selectedNodeDetails.transform.rotation.x }}</span>
              <span>{{ selectedNodeDetails.transform.rotation.y }}</span>
              <span>{{ selectedNodeDetails.transform.rotation.z }}</span>
            </div>
            <div class="transform-grid__row" role="row">
              <span role="rowheader">縮放</span>
              <span>{{ selectedNodeDetails.transform.scale.x }}</span>
              <span>{{ selectedNodeDetails.transform.scale.y }}</span>
              <span>{{ selectedNodeDetails.transform.scale.z }}</span>
            </div>
          </div>
        </section>

        <section v-if="stats" class="panel">
          <div class="panel-heading">
            <span>檔案</span>
          </div>
          <dl class="meta-list">
            <div>
              <dt>名稱</dt>
              <dd>{{ stats.fileName }}</dd>
            </div>
            <div>
              <dt>格式</dt>
              <dd>{{ stats.format }}</dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd>{{ stats.fileSize }}</dd>
            </div>
            <div>
              <dt>同批檔案</dt>
              <dd>{{ stats.resourceCount }}</dd>
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
            <button class="compact-button" type="button" @click="toggleAnimationPlayback">
              {{ isAnimationPlaying ? '暫停' : '播放' }}
            </button>
          </div>
          <div class="animation-list">
            <button
              v-for="(animation, index) in stats.animations"
              :key="`${animation.name}-${index}`"
              type="button"
              :class="{ active: activeAnimationIndex === index }"
              @click="playAnimation(index)"
            >
              <span>{{ animation.name }}</span>
              <small>{{ animation.duration }}</small>
            </button>
          </div>
        </section>
      </aside>
    </main>
  </div>
</template>
