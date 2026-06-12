import * as THREE from 'three'
import type { SceneNode } from '../types/glb-viewer'

export function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function findPrimaryModelFile(files: File[]) {
  return files.find((file) => isModelFile(file)) ?? null
}

export function isModelFile(file: File) {
  const name = file.name.toLowerCase()
  return name.endsWith('.glb') || name.endsWith('.gltf')
}

export function getModelFormat(file: File) {
  return file.name.toLowerCase().endsWith('.glb') ? 'Binary GLB' : 'JSON GLTF'
}

export function createResourceSet(files: File[]) {
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

export function resolveResourceUrl(url: string, urlsByKey: Map<string, string>) {
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

export function getPossibleFileKeys(file: File) {
  const keys = new Set<string>()
  const fileWithPath = file as File & { webkitRelativePath?: string }
  keys.add(getFileKey(file))

  if (fileWithPath.webkitRelativePath) {
    keys.add(normalizeResourcePath(fileWithPath.webkitRelativePath))
  }

  return Array.from(keys)
}

export function getFileKey(file: File) {
  return normalizeResourcePath(file.name)
}

export function normalizeResourcePath(path: string) {
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

export function buildErrorMessage(primaryFile: File, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)

  if (primaryFile.name.toLowerCase().endsWith('.gltf')) {
    return `載入失敗。請確認 .gltf、.bin 與貼圖檔案是同一次選取或拖放，且檔名路徑一致。${detail ? ` (${detail})` : ''}`
  }

  return `載入失敗。請確認檔案是有效的 GLB/GLTF 模型。${detail ? ` (${detail})` : ''}`
}

export function revokeUrls(urls: string[]) {
  for (const url of urls) {
    URL.revokeObjectURL(url)
  }
}

export function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true
}

export function isTexture(value: unknown): value is THREE.Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { isTexture?: boolean }).isTexture === true
  )
}

export function toMaterialArray(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material]
}

export function formatBytes(bytes: number) {
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

export function formatDimension(value: number) {
  return Number.isFinite(value) ? formatDecimal(value) : '0'
}

export function formatTransformVector(vector: THREE.Vector3 | THREE.Euler) {
  return {
    x: formatDecimal(vector.x),
    y: formatDecimal(vector.y),
    z: formatDecimal(vector.z),
  }
}

export function formatRotationDegrees(euler: THREE.Euler) {
  const toDegrees = (radians: number) => formatDecimal(THREE.MathUtils.radToDeg(radians))

  return {
    x: `${toDegrees(euler.x)}°`,
    y: `${toDegrees(euler.y)}°`,
    z: `${toDegrees(euler.z)}°`,
  }
}

const worldPosition = new THREE.Vector3()
const worldScale = new THREE.Vector3()
const worldQuaternion = new THREE.Quaternion()
const worldEuler = new THREE.Euler()

export function getWorldTransform(object: THREE.Object3D) {
  object.getWorldPosition(worldPosition)
  object.getWorldScale(worldScale)
  object.getWorldQuaternion(worldQuaternion)
  worldEuler.setFromQuaternion(worldQuaternion, object.rotation.order)

  return {
    position: worldPosition,
    rotation: worldEuler,
    scale: worldScale,
  }
}

export function formatDecimal(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: value >= 10 ? 1 : 3,
  }).format(value)
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(value)
}

export function countGeometryTriangles(geometry: THREE.BufferGeometry) {
  if (geometry.index) {
    return Math.floor(geometry.index.count / 3)
  }

  const position = geometry.getAttribute('position')
  return position ? Math.floor(position.count / 3) : 0
}

export function collectMaterialTextures(material: THREE.Material, textures: Set<THREE.Texture>) {
  const record = material as THREE.Material & Record<string, unknown>

  for (const value of Object.values(record)) {
    if (isTexture(value)) {
      textures.add(value)
    }
  }
}

export function summarizeObject(object: THREE.Object3D) {
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

export function isTreeNodeVisible(
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

export function getObjectType(object: THREE.Object3D) {
  if (isMesh(object)) {
    return 'Mesh'
  }

  return object.type || 'Object3D'
}

export function getObjectName(
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
