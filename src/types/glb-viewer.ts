export type BackgroundMode = 'studio' | 'light' | 'transparent'

export interface AnimationInfo {
  name: string
  duration: string
}

export interface ModelStats {
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

export interface SceneNode {
  id: string
  objectUuid: string
  parentId: string | null
  childIds: string[]
  depth: number
  name: string
  type: string
  path: string
}

export interface SelectedNodeDetails {
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
