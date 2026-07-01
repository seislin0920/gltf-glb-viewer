import * as THREE from "three";
import type { WingLandmarks, WingWeightOptions, WingWeightScaleHint } from "../../types/wing-rigging";
import { DEFAULT_WING_WEIGHT_OPTIONS } from "../../types/wing-rigging";

export function measureWingWeightScale(
  landmarks: Record<string, THREE.Vector3>,
): { shoulderSpan: number; avgWingSegment: number } {
  const shoulderSpan = landmarks.L_Shoulder.distanceTo(landmarks.R_Shoulder);
  const segmentLengths = [
    landmarks.L_Shoulder.distanceTo(landmarks.L_Mid),
    landmarks.L_Mid.distanceTo(landmarks.L_Tip),
    landmarks.R_Shoulder.distanceTo(landmarks.R_Mid),
    landmarks.R_Mid.distanceTo(landmarks.R_Tip),
  ];
  const avgWingSegment =
    segmentLengths.reduce((sum, length) => sum + length, 0) / segmentLengths.length;

  return {
    shoulderSpan: Math.max(shoulderSpan, 1e-6),
    avgWingSegment: Math.max(avgWingSegment, 1e-6),
  };
}

export function resolveWingWeightAbsolute(
  options: WingWeightOptions,
  landmarks: Record<string, THREE.Vector3>,
): { bodyRadius: number; falloff: number } {
  const { shoulderSpan, avgWingSegment } = measureWingWeightScale(landmarks);

  return {
    bodyRadius: shoulderSpan * options.bodyRadiusRatio,
    falloff: avgWingSegment * options.falloffRatio,
  };
}

export function buildWingWeightScaleHint(
  options: WingWeightOptions,
  landmarks: WingLandmarks,
): WingWeightScaleHint {
  const scale = measureWingWeightScale(landmarks);
  const absolute = resolveWingWeightAbsolute(options, landmarks);

  return {
    ...scale,
    ...absolute,
  };
}

export function withDefaultWingWeightOptions(
  options?: Partial<WingWeightOptions>,
): WingWeightOptions {
  return {
    bodyRadiusRatio:
      options?.bodyRadiusRatio ?? DEFAULT_WING_WEIGHT_OPTIONS.bodyRadiusRatio,
    falloffRatio: options?.falloffRatio ?? DEFAULT_WING_WEIGHT_OPTIONS.falloffRatio,
  };
}
