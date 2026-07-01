import * as THREE from "three";
import { isMesh } from "../modelUtils";
import type { BirdModelAnalysis } from "../../types/wing-rigging";

const LEFT_HINTS = ["left", "_l", ".l", "l_", "-l", "wing_l", "lwing"];
const RIGHT_HINTS = ["right", "_r", ".r", "r_", "-r", "wing_r", "rwing"];
const WING_HINTS = ["wing", "flap", "feather"];
const BODY_HINTS = ["body", "torso", "spine", "root"];

function includesAny(name: string, hints: string[]) {
  return hints.some((hint) => name.includes(hint));
}

function classifyWingSide(name: string) {
  if (includesAny(name, LEFT_HINTS)) {
    return "left";
  }
  if (includesAny(name, RIGHT_HINTS)) {
    return "right";
  }
  return "unknown";
}

export function analyzeBirdModel(root: THREE.Object3D): BirdModelAnalysis {
  const warnings: string[] = [];
  const leftWingMeshCandidates: string[] = [];
  const rightWingMeshCandidates: string[] = [];
  const bodyMeshCandidates: string[] = [];

  let meshCount = 0;
  let hasSkinnedMesh = false;
  let hasExistingSkeleton = false;
  let largestMesh: { uuid: string; size: number } | null = null;

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  root.traverse((object) => {
    if (object instanceof THREE.Bone) {
      hasExistingSkeleton = true;
    }

    if (!isMesh(object)) {
      return;
    }

    meshCount += 1;

    if (object.isSkinnedMesh) {
      hasSkinnedMesh = true;
    }

    box.setFromObject(object);
    box.getSize(size);
    box.getCenter(center);

    const meshSize = size.length();
    if (!largestMesh || meshSize > largestMesh.size) {
      largestMesh = { uuid: object.uuid, size: meshSize };
    }

    const name = object.name.toLowerCase();
    const side = classifyWingSide(name);
    const isWingNamed = includesAny(name, WING_HINTS);
    const isBodyNamed = includesAny(name, BODY_HINTS);

    if (side === "left" || (side === "unknown" && center.x < 0 && isWingNamed)) {
      leftWingMeshCandidates.push(object.uuid);
      return;
    }

    if (side === "right" || (side === "unknown" && center.x > 0 && isWingNamed)) {
      rightWingMeshCandidates.push(object.uuid);
      return;
    }

    if (isBodyNamed) {
      bodyMeshCandidates.push(object.uuid);
    }
  });

  if (meshCount === 0) {
    warnings.push("找不到任何 Mesh，請確認 GLB 是否含可渲染物件。");
  }

  if (hasSkinnedMesh) {
    warnings.push("偵測到 SkinnedMesh，套用新骨骼可能覆寫既有骨架。");
  }

  if (leftWingMeshCandidates.length === 0 || rightWingMeshCandidates.length === 0) {
    warnings.push("左右翅 mesh 無法完整辨識，建議使用 6 點標記模式。");
  }

  if (meshCount > 8 && !hasSkinnedMesh) {
    warnings.push("Mesh 數量偏多，建議確認左右翅與身體是否拆分。");
  }

  if (largestMesh && meshCount > 1 && bodyMeshCandidates.length === 0) {
    bodyMeshCandidates.push(largestMesh.uuid);
  }

  const suggestedMode: BirdModelAnalysis["suggestedMode"] =
    hasSkinnedMesh || hasExistingSkeleton
      ? "manual"
      : leftWingMeshCandidates.length > 0 && rightWingMeshCandidates.length > 0
        ? "node-pivot"
        : "full-rig";

  return {
    meshCount,
    hasSkinnedMesh,
    hasExistingSkeleton,
    leftWingMeshCandidates,
    rightWingMeshCandidates,
    bodyMeshCandidates,
    suggestedMode,
    warnings,
  };
}
