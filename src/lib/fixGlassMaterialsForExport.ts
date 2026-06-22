import * as THREE from "three";
import { isMesh, toMaterialArray } from "./modelUtils";

const GLASS_NAME_PATTERN =
  /glass|window|windshield|windscreen|pare[-_]?brise|vitre|glas|玻璃|車窗|擋風/i;

/** Minimal alpha so GLTFExporter writes alphaMode BLEND and Cesium can see through. */
const DEFAULT_GLASS_OPACITY = 0.12;
const MIN_GLASS_OPACITY = 0.08;
const MAX_GLASS_OPACITY = 0.35;
/** High roughness suppresses sharp specular / environment highlights on glass. */
const EXPORT_GLASS_ROUGHNESS = 1;

type PbrMaterial = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

interface PbrSnapshotFields {
  color: THREE.Color;
  map: THREE.Texture | null;
  emissive: THREE.Color;
  emissiveMap: THREE.Texture | null;
  envMapIntensity: number;
  metalness: number;
  roughness: number;
  transmission: number;
  thickness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  specularIntensity: number;
}

interface MaterialSnapshot {
  material: THREE.Material;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  side: THREE.Side;
  alphaTest: number;
  pbr?: PbrSnapshotFields;
}

function isPbrMaterial(material: THREE.Material): material is PbrMaterial {
  return (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  );
}

function matchesGlassName(...names: string[]) {
  return names.some((name) => name && GLASS_NAME_PATTERN.test(name));
}

function getPhysicalTransmission(material: THREE.Material) {
  if (!(material instanceof THREE.MeshPhysicalMaterial)) {
    return 0;
  }

  return material.transmission;
}

function isLightColored(material: PbrMaterial) {
  const { r, g, b } = material.color;
  return (r + g + b) / 3 >= 0.75;
}

export function isGlassMaterial(
  material: THREE.Material,
  meshName = "",
): boolean {
  if (matchesGlassName(material.name, meshName)) {
    return true;
  }

  if (getPhysicalTransmission(material) > 0) {
    return true;
  }

  if (!isPbrMaterial(material)) {
    return false;
  }

  const hasTransparency =
    material.transparent || material.opacity < 0.99 || material.alphaTest > 0;

  return hasTransparency && isLightColored(material);
}

function resolveExportOpacity(material: PbrMaterial, forceGlass: boolean) {
  if (material.opacity < 0.99) {
    return THREE.MathUtils.clamp(
      material.opacity,
      MIN_GLASS_OPACITY,
      MAX_GLASS_OPACITY,
    );
  }

  return forceGlass ? DEFAULT_GLASS_OPACITY : material.opacity;
}

function snapshotPbrFields(material: PbrMaterial): PbrSnapshotFields {
  const snapshot: PbrSnapshotFields = {
    color: material.color.clone(),
    map: material.map,
    emissive: material.emissive.clone(),
    emissiveMap: material.emissiveMap,
    envMapIntensity: material.envMapIntensity,
    metalness: material.metalness,
    roughness: material.roughness,
    transmission: 0,
    thickness: 0,
    clearcoat: 0,
    clearcoatRoughness: 0,
    specularIntensity: 1,
  };

  if (material instanceof THREE.MeshPhysicalMaterial) {
    snapshot.transmission = material.transmission;
    snapshot.thickness = material.thickness;
    snapshot.clearcoat = material.clearcoat;
    snapshot.clearcoatRoughness = material.clearcoatRoughness;
    snapshot.specularIntensity = material.specularIntensity;
  }

  return snapshot;
}

function snapshotMaterial(material: THREE.Material): MaterialSnapshot {
  const snapshot: MaterialSnapshot = {
    material,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
    side: material.side,
    alphaTest: material.alphaTest,
  };

  if (isPbrMaterial(material)) {
    snapshot.pbr = snapshotPbrFields(material);
  }

  return snapshot;
}

function applyGlassExportFix(material: THREE.Material, meshName: string) {
  if (!isGlassMaterial(material, meshName) || !isPbrMaterial(material)) {
    return null;
  }

  const snapshot = snapshotMaterial(material);
  const namedGlass = matchesGlassName(material.name, meshName);
  const opacity = resolveExportOpacity(material, namedGlass);

  material.map = null;
  material.emissive.setRGB(0, 0, 0);
  material.emissiveMap = null;
  material.envMapIntensity = 0;
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.alphaTest = 0;
  material.metalness = 0;
  material.roughness = EXPORT_GLASS_ROUGHNESS;

  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.transmission = 0;
    material.thickness = 0;
    material.clearcoat = 0;
    material.clearcoatRoughness = 1;
    material.specularIntensity = 0;
  }

  material.needsUpdate = true;
  return snapshot;
}

function restoreMaterialSnapshot(snapshot: MaterialSnapshot) {
  const { material } = snapshot;

  material.transparent = snapshot.transparent;
  material.opacity = snapshot.opacity;
  material.depthWrite = snapshot.depthWrite;
  material.side = snapshot.side;
  material.alphaTest = snapshot.alphaTest;

  if (snapshot.pbr && isPbrMaterial(material)) {
    const pbr = snapshot.pbr;
    material.color.copy(pbr.color);
    material.map = pbr.map;
    material.emissive.copy(pbr.emissive);
    material.emissiveMap = pbr.emissiveMap;
    material.envMapIntensity = pbr.envMapIntensity;
    material.metalness = pbr.metalness;
    material.roughness = pbr.roughness;

    if (material instanceof THREE.MeshPhysicalMaterial) {
      material.transmission = pbr.transmission;
      material.thickness = pbr.thickness;
      material.clearcoat = pbr.clearcoat;
      material.clearcoatRoughness = pbr.clearcoatRoughness;
      material.specularIntensity = pbr.specularIntensity;
    }
  }

  material.needsUpdate = true;
}

export function withGlassMaterialsFixed(
  root: THREE.Object3D,
  run: () => Promise<void>,
): Promise<void> {
  const snapshots: MaterialSnapshot[] = [];

  root.traverse((object) => {
    if (!isMesh(object)) {
      return;
    }

    for (const material of toMaterialArray(object.material)) {
      const snapshot = applyGlassExportFix(material, object.name);

      if (snapshot) {
        snapshots.push(snapshot);
      }
    }
  });

  return run().finally(() => {
    for (const snapshot of snapshots) {
      restoreMaterialSnapshot(snapshot);
    }
  });
}
