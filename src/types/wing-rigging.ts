import type * as THREE from "three";

export type WingLandmarkId =
  | "L_Shoulder"
  | "L_Mid"
  | "L_Tip"
  | "R_Shoulder"
  | "R_Mid"
  | "R_Tip";

export type WingLandmarks = Record<WingLandmarkId, THREE.Vector3>;

export type WingWorkflowMode = "node-pivot" | "full-rig" | "existing-skeleton";

export type WingLandmarkStepStatus = "pending" | "active" | "done";

export interface WingLandmarkStep {
  id: WingLandmarkId;
  label: string;
  index: number;
  status: WingLandmarkStepStatus;
}

export const WING_LANDMARK_STEPS: Array<{ id: WingLandmarkId; label: string }> = [
  { id: "L_Shoulder", label: "左翅根部" },
  { id: "L_Mid", label: "左翅中段" },
  { id: "L_Tip", label: "左翅尖" },
  { id: "R_Shoulder", label: "右翅根部" },
  { id: "R_Mid", label: "右翅中段" },
  { id: "R_Tip", label: "右翅尖" },
];

export interface WingWeightOptions {
  /** 身體鎖定範圍，相對於左右肩距離；越大越能把軀幹鎖在 BirdRoot */
  bodyRadiusRatio: number;
  /** Falloff，相對於平均翅骨段長度的比例 */
  falloffRatio: number;
}

export const DEFAULT_WING_WEIGHT_OPTIONS: WingWeightOptions = {
  bodyRadiusRatio: 0.35,
  falloffRatio: 0.35,
};

export interface WingWeightScaleHint {
  shoulderSpan: number;
  avgWingSegment: number;
  bodyRadius: number;
  falloff: number;
}

export type BirdBoneName =
  | "BirdRoot"
  | "L_Wing_01_Shoulder"
  | "L_Wing_02_Mid"
  | "L_Wing_03_Tip"
  | "R_Wing_01_Shoulder"
  | "R_Wing_02_Mid"
  | "R_Wing_03_Tip";

export type WingBoneSlotId = Exclude<BirdBoneName, "BirdRoot">;

export const WING_BONE_SLOT_OPTIONS: Array<{
  id: WingBoneSlotId;
  label: string;
  required: boolean;
}> = [
  { id: "L_Wing_01_Shoulder", label: "左翅根部骨骼", required: true },
  { id: "L_Wing_02_Mid", label: "左翅中段骨骼", required: false },
  { id: "L_Wing_03_Tip", label: "左翅尖端骨骼", required: false },
  { id: "R_Wing_01_Shoulder", label: "右翅根部骨骼", required: true },
  { id: "R_Wing_02_Mid", label: "右翅中段骨骼", required: false },
  { id: "R_Wing_03_Tip", label: "右翅尖端骨骼", required: false },
];

export interface BirdModelAnalysis {
  meshCount: number;
  hasSkinnedMesh: boolean;
  hasExistingSkeleton: boolean;
  leftWingMeshCandidates: string[];
  rightWingMeshCandidates: string[];
  bodyMeshCandidates: string[];
  leftBoneCandidates: Partial<Record<WingBoneSlotId, string>>;
  rightBoneCandidates: Partial<Record<WingBoneSlotId, string>>;
  suggestedMode: "node-pivot" | "full-rig" | "manual" | "existing-skeleton";
  warnings: string[];
}

export interface WingFlapPreset {
  name: string;
  duration: number;
  loop: boolean;
  mirrorRight: boolean;
  tracks: WingFlapTrack[];
}

export interface WingFlapTrack {
  bone: Exclude<BirdBoneName, "BirdRoot">;
  space: "local";
  rotationType: "euler" | "quaternion";
  axis: "x" | "y" | "z";
  keys: Array<{ time: number; value: number }>;
  mirrorSign?: number;
}

export interface WingAnimationOptions {
  speedMultiplier: number;
  amplitudeMultiplier: number;
  mirrorRight: boolean;
  loopMode: "repeat" | "once" | "pingpong";
}

export interface WingFlapApplyOptions {
  speedMultiplier?: number;
  amplitudeMultiplier?: number;
  mirrorRight?: boolean;
  loopMode?: "repeat" | "once" | "pingpong";
}
