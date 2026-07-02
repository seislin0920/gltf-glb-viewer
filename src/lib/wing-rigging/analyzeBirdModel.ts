import * as THREE from "three";
import { isMesh } from "../modelUtils";
import type { BirdModelAnalysis, WingBoneSlotId } from "../../types/wing-rigging";

const LEFT_HINTS = ["left", "_l", ".l", "l_", "-l", "wing_l", "lwing", "lleg", "_lleg"];
const RIGHT_HINTS = ["right", "_r", ".r", "r_", "-r", "wing_r", "rwing", "rleg", "_rleg"];
const WING_HINTS = ["wing", "flap", "feather", "leg", "platform", "hub"];
const BODY_HINTS = ["body", "torso", "spine", "root"];

const LEFT_BONE_SLOT_ORDER: WingBoneSlotId[] = [
  "L_Wing_01_Shoulder",
  "L_Wing_02_Mid",
  "L_Wing_03_Tip",
];
const RIGHT_BONE_SLOT_ORDER: WingBoneSlotId[] = [
  "R_Wing_01_Shoulder",
  "R_Wing_02_Mid",
  "R_Wing_03_Tip",
];

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

function scoreBoneCandidate(name: string, side: "left" | "right") {
  const lower = name.toLowerCase();
  let score = 0;

  if (includesAny(lower, side === "left" ? LEFT_HINTS : RIGHT_HINTS)) {
    score += 4;
  }
  if (includesAny(lower, WING_HINTS)) {
    score += 2;
  }
  if (lower.includes("01") || lower.includes("1_") || lower.includes("_1")) {
    score += 1;
  }
  if (lower.includes("02") || lower.includes("2_") || lower.includes("_2")) {
    score += 0.5;
  }
  if (lower.includes("03") || lower.includes("3_") || lower.includes("_3")) {
    score += 0.25;
  }

  return score;
}

function assignBoneCandidates(
  bones: Array<{ uuid: string; name: string; side: "left" | "right" | "unknown" }>,
) {
  const leftBoneCandidates: Partial<Record<WingBoneSlotId, string>> = {};
  const rightBoneCandidates: Partial<Record<WingBoneSlotId, string>> = {};

  const leftBones = bones
    .filter((bone) => bone.side === "left")
    .sort(
      (a, b) =>
        scoreBoneCandidate(b.name, "left") - scoreBoneCandidate(a.name, "left"),
    );
  const rightBones = bones
    .filter((bone) => bone.side === "right")
    .sort(
      (a, b) =>
        scoreBoneCandidate(b.name, "right") - scoreBoneCandidate(a.name, "right"),
    );

  LEFT_BONE_SLOT_ORDER.forEach((slot, index) => {
    const candidate = leftBones[index];
    if (candidate) {
      leftBoneCandidates[slot] = candidate.uuid;
    }
  });
  RIGHT_BONE_SLOT_ORDER.forEach((slot, index) => {
    const candidate = rightBones[index];
    if (candidate) {
      rightBoneCandidates[slot] = candidate.uuid;
    }
  });

  return { leftBoneCandidates, rightBoneCandidates };
}

export function analyzeBirdModel(root: THREE.Object3D): BirdModelAnalysis {
  const warnings: string[] = [];
  const leftWingMeshCandidates: string[] = [];
  const rightWingMeshCandidates: string[] = [];
  const bodyMeshCandidates: string[] = [];
  const boneRecords: Array<{
    uuid: string;
    name: string;
    side: "left" | "right" | "unknown";
  }> = [];

  let meshCount = 0;
  let hasSkinnedMesh = false;
  let hasExistingSkeleton = false;
  let largestMeshUuid: string | null = null;
  let largestMeshSize = -1;

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  root.traverse((object) => {
    if (object instanceof THREE.Bone) {
      hasExistingSkeleton = true;
      const name = object.name.toLowerCase();
      boneRecords.push({
        uuid: object.uuid,
        name: object.name,
        side: classifyWingSide(name),
      });
    }

    if (!isMesh(object)) {
      return;
    }

    meshCount += 1;

    if (object instanceof THREE.SkinnedMesh) {
      hasSkinnedMesh = true;
    }

    box.setFromObject(object);
    box.getSize(size);
    box.getCenter(center);

    const meshSize = size.length();
    if (meshSize > largestMeshSize) {
      largestMeshSize = meshSize;
      largestMeshUuid = object.uuid;
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

  const { leftBoneCandidates, rightBoneCandidates } =
    assignBoneCandidates(boneRecords);

  if (meshCount === 0) {
    warnings.push("找不到任何 Mesh，請確認 GLB 是否含可渲染物件。");
  }

  if (hasSkinnedMesh) {
    warnings.push("偵測到 SkinnedMesh，可改用「既有骨骼」模式直接加拍翅動畫。");
  }

  if (
    hasExistingSkeleton &&
    (!leftBoneCandidates.L_Wing_01_Shoulder ||
      !rightBoneCandidates.R_Wing_01_Shoulder)
  ) {
    warnings.push("無法自動辨識左右翅骨骼，請在「既有骨骼」模式手動指定。");
  }

  if (leftWingMeshCandidates.length === 0 || rightWingMeshCandidates.length === 0) {
    warnings.push("左右翅 mesh 無法完整辨識，建議使用 6 點標記模式。");
  }

  if (meshCount > 8 && !hasSkinnedMesh) {
    warnings.push("Mesh 數量偏多，建議確認左右翅與身體是否拆分。");
  }

  if (largestMeshUuid && meshCount > 1 && bodyMeshCandidates.length === 0) {
    bodyMeshCandidates.push(largestMeshUuid);
  }

  const suggestedMode: BirdModelAnalysis["suggestedMode"] =
    hasSkinnedMesh || hasExistingSkeleton
      ? "existing-skeleton"
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
    leftBoneCandidates,
    rightBoneCandidates,
    suggestedMode,
    warnings,
  };
}
