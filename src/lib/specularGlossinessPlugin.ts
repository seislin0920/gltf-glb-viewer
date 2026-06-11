import * as THREE from 'three'
import type { GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { average } from './modelUtils'

const SPECULAR_GLOSSINESS_EXTENSION = 'KHR_materials_pbrSpecularGlossiness'

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

export class SpecularGlossinessCompatibilityPlugin implements GLTFLoaderPlugin {
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
