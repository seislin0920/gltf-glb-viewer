import * as THREE from "three";

const BONE_COLORS: Record<string, number> = {
  BirdRoot: 0x888888,
  L_Wing_01_Shoulder: 0x1f6feb,
  L_Wing_02_Mid: 0x388bfd,
  L_Wing_03_Tip: 0x79c0ff,
  R_Wing_01_Shoulder: 0xd18616,
  R_Wing_02_Mid: 0xf0883e,
  R_Wing_03_Tip: 0xffb77a,
};

interface HeatmapState {
  originalMaterial: THREE.Material | THREE.Material[];
  createdMaterials: THREE.Material[];
}

const heatmapStateByMesh = new WeakMap<THREE.SkinnedMesh, HeatmapState>();

function cloneMaterialWithVertexColors(
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  const createdMaterials: THREE.Material[] = [];

  const cloneOne = (source: THREE.Material) => {
    const cloned = source.clone();
    cloned.vertexColors = true;
    createdMaterials.push(cloned);
    return cloned;
  };

  if (Array.isArray(material)) {
    return material.map(cloneOne);
  }

  return cloneOne(material);
}

export function applyWeightHeatmap(
  skinnedMesh: THREE.SkinnedMesh,
  boneIndexByName: Record<string, number>,
) {
  const indexToColor = new Map<number, number>();
  for (const [name, index] of Object.entries(boneIndexByName)) {
    indexToColor.set(index, BONE_COLORS[name] ?? 0xffffff);
  }

  const geometry = skinnedMesh.geometry;
  const skinIndex = geometry.getAttribute("skinIndex") as THREE.BufferAttribute;
  const skinWeight = geometry.getAttribute("skinWeight") as THREE.BufferAttribute;
  const count = skinIndex.count;
  const colors = new Float32Array(count * 3);
  const blended = new THREE.Color();
  const boneColor = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    blended.setRGB(0, 0, 0);

    for (let k = 0; k < 4; k += 1) {
      const weight = skinWeight.getComponent(i, k);
      if (weight <= 0) {
        continue;
      }

      const boneIndex = skinIndex.getComponent(i, k);
      boneColor.setHex(indexToColor.get(boneIndex) ?? 0xffffff);
      blended.r += boneColor.r * weight;
      blended.g += boneColor.g * weight;
      blended.b += boneColor.b * weight;
    }

    colors[i * 3] = blended.r;
    colors[i * 3 + 1] = blended.g;
    colors[i * 3 + 2] = blended.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const existing = heatmapStateByMesh.get(skinnedMesh);
  if (!existing) {
    const createdMaterials: THREE.Material[] = [];
    const nextMaterial = cloneMaterialWithVertexColors(skinnedMesh.material);
    if (Array.isArray(nextMaterial)) {
      createdMaterials.push(...nextMaterial);
    } else {
      createdMaterials.push(nextMaterial);
    }

    heatmapStateByMesh.set(skinnedMesh, {
      originalMaterial: skinnedMesh.material,
      createdMaterials,
    });
    skinnedMesh.material = nextMaterial;
    return;
  }

  skinnedMesh.material = cloneMaterialWithVertexColors(existing.originalMaterial);
  const state = heatmapStateByMesh.get(skinnedMesh);
  if (state) {
    state.createdMaterials.forEach((material) => material.dispose());
    state.createdMaterials = Array.isArray(skinnedMesh.material)
      ? [...skinnedMesh.material]
      : [skinnedMesh.material];
  }
}

export function removeWeightHeatmap(skinnedMesh: THREE.SkinnedMesh) {
  const state = heatmapStateByMesh.get(skinnedMesh);
  if (!state) {
    return;
  }

  skinnedMesh.material = state.originalMaterial;
  state.createdMaterials.forEach((material) => material.dispose());
  heatmapStateByMesh.delete(skinnedMesh);
  skinnedMesh.geometry.deleteAttribute("color");
}

export function disposeWeightHeatmap(skinnedMesh: THREE.SkinnedMesh | null) {
  if (!skinnedMesh) {
    return;
  }

  removeWeightHeatmap(skinnedMesh);
}
