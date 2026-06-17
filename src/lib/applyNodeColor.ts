import * as THREE from "three";
import { isMesh, toMaterialArray } from "./modelUtils";
import type { NodeColorMode } from "../types/glb-viewer";

export interface NodeColorBatch {
  id: string;
  nodeIds: string[];
  snapshots: Array<{
    meshUuid: string;
    originalMaterial: THREE.Material | THREE.Material[];
  }>;
  createdMaterials: THREE.Material[];
  createdTextures: THREE.Texture[];
  createdObjectUrls: string[];
}

export interface ApplyNodeColorOptions {
  mode: NodeColorMode;
  colorHex?: string;
  textureFile?: File | null;
  nodeIds: string[];
}

export interface ApplyNodeColorResult {
  batch: NodeColorBatch;
  skippedMeshCount: number;
}

type PbrMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

function isPbrMaterial(material: THREE.Material): material is PbrMaterial {
  return (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  );
}

export function collectDirectMeshes(object: THREE.Object3D): THREE.Mesh[] {
  return isMesh(object) ? [object] : [];
}

function hexToRgba255(hex: string): [number, number, number, number] {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);

  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);

  return [r, g, b, 255];
}

function applyColorToMaterial(material: PbrMaterial, colorHex: string) {
  const [r, g, b, a] = hexToRgba255(colorHex);
  material.color.setRGB(r / 255, g / 255, b / 255);
  material.opacity = a / 255;
  material.transparent = material.opacity < 1;
  material.map = null;
  material.needsUpdate = true;
}

function loadTextureFromFile(file: File): Promise<{
  texture: THREE.Texture;
  objectUrl: string;
}> {
  const objectUrl = URL.createObjectURL(file);
  const loader = new THREE.TextureLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      objectUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        resolve({ texture, objectUrl });
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(objectUrl);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function applyTextureToMaterial(material: PbrMaterial, texture: THREE.Texture) {
  material.map = texture;
  material.color.set(0xffffff, 0xffffff, 0xffffff);
  material.needsUpdate = true;
}

function cloneMaterialSlot(
  material: THREE.Material,
  mode: NodeColorMode,
  colorHex: string | undefined,
  texture: THREE.Texture | null,
  createdMaterials: THREE.Material[],
): THREE.Material | null {
  if (!isPbrMaterial(material)) {
    return null;
  }

  const cloned = material.clone();
  createdMaterials.push(cloned);

  if (mode === "color" && colorHex) {
    applyColorToMaterial(cloned, colorHex);
  } else if (mode === "texture" && texture) {
    applyTextureToMaterial(cloned, texture);
  }

  return cloned;
}

function cloneMeshMaterials(
  mesh: THREE.Mesh,
  mode: NodeColorMode,
  colorHex: string | undefined,
  texture: THREE.Texture | null,
  createdMaterials: THREE.Material[],
): THREE.Material | THREE.Material[] | null {
  const materials = toMaterialArray(mesh.material);
  const clonedMaterials: THREE.Material[] = [];

  for (const material of materials) {
    const cloned = cloneMaterialSlot(
      material,
      mode,
      colorHex,
      texture,
      createdMaterials,
    );

    if (!cloned) {
      for (const created of clonedMaterials) {
        const index = createdMaterials.indexOf(created);
        if (index >= 0) {
          createdMaterials.splice(index, 1);
        }
        created.dispose();
      }
      return null;
    }

    clonedMaterials.push(cloned);
  }

  if (clonedMaterials.length === 0) {
    return null;
  }

  return Array.isArray(mesh.material)
    ? clonedMaterials
    : clonedMaterials[0]!;
}

export async function applyNodeColor(
  objects: THREE.Object3D[],
  options: ApplyNodeColorOptions,
): Promise<ApplyNodeColorResult> {
  const { mode, colorHex, textureFile, nodeIds } = options;
  const batch: NodeColorBatch = {
    id: `node-color-${Date.now()}`,
    nodeIds: [...nodeIds],
    snapshots: [],
    createdMaterials: [],
    createdTextures: [],
    createdObjectUrls: [],
  };

  let texture: THREE.Texture | null = null;

  if (mode === "texture") {
    if (!textureFile) {
      throw new Error("請選擇要上傳的貼圖。");
    }

    const loaded = await loadTextureFromFile(textureFile);
    texture = loaded.texture;
    batch.createdTextures.push(texture);
    batch.createdObjectUrls.push(loaded.objectUrl);
  }

  let skippedMeshCount = 0;
  const touchedMeshes = new Set<string>();

  for (const object of objects) {
    for (const mesh of collectDirectMeshes(object)) {
      if (touchedMeshes.has(mesh.uuid)) {
        continue;
      }

      touchedMeshes.add(mesh.uuid);

      const clonedMaterial = cloneMeshMaterials(
        mesh,
        mode,
        colorHex,
        texture,
        batch.createdMaterials,
      );

      if (!clonedMaterial) {
        skippedMeshCount += 1;
        continue;
      }

      batch.snapshots.push({
        meshUuid: mesh.uuid,
        originalMaterial: mesh.material,
      });
      mesh.material = clonedMaterial;
    }
  }

  if (batch.snapshots.length === 0) {
    disposeNodeColorBatchResources(batch);
    throw new Error("選取的節點沒有可上色的 Mesh。");
  }

  return { batch, skippedMeshCount };
}

export function disposeNodeColorBatchResources(batch: NodeColorBatch) {
  for (const material of batch.createdMaterials) {
    material.dispose();
  }

  for (const texture of batch.createdTextures) {
    texture.dispose();
  }

  for (const objectUrl of batch.createdObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }
}

export function revertNodeColorBatch(
  batch: NodeColorBatch,
  meshByUuid: Map<string, THREE.Mesh>,
) {
  for (const snapshot of batch.snapshots) {
    const mesh = meshByUuid.get(snapshot.meshUuid);

    if (!mesh) {
      continue;
    }

    mesh.material = snapshot.originalMaterial;
  }

  disposeNodeColorBatchResources(batch);
}

export function disposeAllNodeColorBatches(batches: NodeColorBatch[]) {
  for (const batch of batches) {
    disposeNodeColorBatchResources(batch);
  }
}
