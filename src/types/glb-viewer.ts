export type BackgroundMode = 'studio' | 'light' | 'transparent'

export type NodeColorMode = 'color' | 'texture'

export interface Vector3Values {
  x: number
  y: number
  z: number
}

export interface AnimationInfo {
  name: string
  duration: string
}

export type AnimationLoopMode = 'repeat' | 'once' | 'pingpong'

export interface AnimationClipSettings {
  source: 'imported' | 'rotor' | 'wing' | 'wing-rig'
  timeScale: number
  loopMode: AnimationLoopMode
}

export interface RotorClipTargetRecord {
  nodeId: string
  objectUuid: string
  pivotUuid: string
  config: RotorTargetConfig
}

export interface RotorClipRecord {
  targets: RotorClipTargetRecord[]
}

export interface SelectedAnimationDetail {
  index: number
  name: string
  duration: number
  source: AnimationClipSettings['source']
  timeScale: number
  loopMode: AnimationLoopMode
  rotorTargets: Array<{
    nodeId: string
    nodeName: string
    pivotUuid: string
    config: RotorTargetConfig
  }>
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

export type PivotAxisMode = 'auto' | 'manual'

export interface RotorTargetConfig {
  nodeId: string
  pivotMode: PivotAxisMode
  pivot: Vector3Values
  axisMode: PivotAxisMode
  axis: Vector3Values
  reverse: boolean
  rpm: number
  duration: number
  keyframes: number
}

export interface RotorAnimationDefaults {
  animationName: string
  keyframes: number
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
