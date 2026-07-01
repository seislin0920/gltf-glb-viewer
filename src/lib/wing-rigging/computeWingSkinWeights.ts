import * as THREE from "three";
import type { WingWeightOptions } from "../../types/wing-rigging";
import { DEFAULT_WING_WEIGHT_OPTIONS } from "../../types/wing-rigging";
import { resolveWingWeightAbsolute } from "./resolveWingWeightScale";

type BoneSegment = {
  boneIndex: number;
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** 若為 true，頂點落在 segment 起點「身體側」時會衰減權重 */
  attenuateBodySide?: boolean;
};

function closestPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq < 1e-12) {
    return a.clone();
  }

  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / lengthSq, 0, 1);
  return a.clone().add(ab.multiplyScalar(t));
}

function segmentParameter(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a);
  const lengthSq = ab.lengthSq();
  if (lengthSq < 1e-12) {
    return 0;
  }

  return p.clone().sub(a).dot(ab) / lengthSq;
}

function createTipExtension(_shoulder: THREE.Vector3, mid: THREE.Vector3, tip: THREE.Vector3) {
  return tip.clone().add(tip.clone().sub(mid));
}

function computeBodyAffinity(
  axisDistance: number,
  bodyRadius: number,
): number {
  if (bodyRadius <= 1e-6) {
    return axisDistance <= 1e-6 ? 1 : 0;
  }

  return Math.exp(-axisDistance / bodyRadius);
}

function computeOutwardFactor(t: number): number {
  // 翅根段上，參數 t < 0 代表落在肩點「身體內側」，需抑制翅膀權重
  return THREE.MathUtils.smoothstep(0, 0.18, t);
}

function pickWingSide(
  p: THREE.Vector3,
  leftSegs: BoneSegment[],
  rightSegs: BoneSegment[],
) {
  const leftDist = Math.min(
    ...leftSegs.map((seg) => p.distanceTo(closestPointOnSegment(p, seg.a, seg.b))),
  );
  const rightDist = Math.min(
    ...rightSegs.map((seg) => p.distanceTo(closestPointOnSegment(p, seg.a, seg.b))),
  );

  return leftDist < rightDist ? leftSegs : rightSegs;
}

function computeWingInfluences(
  p: THREE.Vector3,
  segs: BoneSegment[],
  falloff: number,
) {
  const influences: { index: number; w: number }[] = [];

  for (const seg of segs) {
    const cp = closestPointOnSegment(p, seg.a, seg.b);
    const dist = p.distanceTo(cp);
    let w = Math.exp(-dist / falloff);

    if (seg.attenuateBodySide) {
      w *= computeOutwardFactor(segmentParameter(p, seg.a, seg.b));
    }

    if (w <= 1e-6) {
      continue;
    }

    influences.push({
      index: seg.boneIndex,
      w,
    });
  }

  return influences;
}

function normalizeInfluences(influences: { index: number; w: number }[]) {
  const merged = new Map<number, number>();

  for (const inf of influences) {
    merged.set(inf.index, (merged.get(inf.index) ?? 0) + inf.w);
  }

  const sorted = [...merged.entries()]
    .map(([index, w]) => ({ index, w }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 4);

  const sum = sorted.reduce((total, inf) => total + inf.w, 0) || 1;
  return sorted.map((inf) => ({ index: inf.index, w: inf.w / sum }));
}

export function computeWingSkinWeights(
  positions: THREE.BufferAttribute,
  landmarks: Record<string, THREE.Vector3>,
  boneIndexByName: Record<string, number>,
  options: WingWeightOptions = DEFAULT_WING_WEIGHT_OPTIONS,
) {
  const count = positions.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const { bodyRadius, falloff } = resolveWingWeightAbsolute(options, landmarks);
  const birdRootIndex = boneIndexByName.BirdRoot;

  const leftTipExtend = createTipExtension(
    landmarks.L_Shoulder,
    landmarks.L_Mid,
    landmarks.L_Tip,
  );
  const rightTipExtend = createTipExtension(
    landmarks.R_Shoulder,
    landmarks.R_Mid,
    landmarks.R_Tip,
  );

  const leftSegs: BoneSegment[] = [
    {
      boneIndex: boneIndexByName.L_Wing_01_Shoulder,
      a: landmarks.L_Shoulder,
      b: landmarks.L_Mid,
      attenuateBodySide: true,
    },
    {
      boneIndex: boneIndexByName.L_Wing_02_Mid,
      a: landmarks.L_Mid,
      b: landmarks.L_Tip,
    },
    {
      boneIndex: boneIndexByName.L_Wing_03_Tip,
      a: landmarks.L_Tip,
      b: leftTipExtend,
    },
  ];

  const rightSegs: BoneSegment[] = [
    {
      boneIndex: boneIndexByName.R_Wing_01_Shoulder,
      a: landmarks.R_Shoulder,
      b: landmarks.R_Mid,
      attenuateBodySide: true,
    },
    {
      boneIndex: boneIndexByName.R_Wing_02_Mid,
      a: landmarks.R_Mid,
      b: landmarks.R_Tip,
    },
    {
      boneIndex: boneIndexByName.R_Wing_03_Tip,
      a: landmarks.R_Tip,
      b: rightTipExtend,
    },
  ];

  const p = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    p.fromBufferAttribute(positions, i);

    const axisDistance = p.distanceTo(
      closestPointOnSegment(p, landmarks.L_Shoulder, landmarks.R_Shoulder),
    );
    const bodyAffinity = computeBodyAffinity(axisDistance, bodyRadius);
    const segs = pickWingSide(p, leftSegs, rightSegs);
    const wingInfluences = computeWingInfluences(p, segs, falloff);

    const combined: { index: number; w: number }[] = [];
    if (bodyAffinity > 1e-6 && birdRootIndex !== undefined) {
      combined.push({ index: birdRootIndex, w: bodyAffinity });
    }

    const wingScale = 1 - bodyAffinity;
    for (const inf of wingInfluences) {
      combined.push({ index: inf.index, w: inf.w * wingScale });
    }

    const top = normalizeInfluences(combined);
    top.forEach((inf, k) => {
      skinIndex[i * 4 + k] = inf.index;
      skinWeight[i * 4 + k] = inf.w;
    });
  }

  return {
    skinIndex: new THREE.BufferAttribute(skinIndex, 4),
    skinWeight: new THREE.BufferAttribute(skinWeight, 4),
  };
}
