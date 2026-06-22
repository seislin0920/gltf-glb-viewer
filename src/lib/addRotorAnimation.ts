import * as THREE from "three";
import { isMesh } from "./modelUtils";
import type { RotorTargetConfig, Vector3Values } from "../types/glb-viewer";

export const DEFAULT_ANIMATION_NAME = "RotorSpin";
export const DEFAULT_KEYFRAMES = 24;
export const MIN_POINTS_REQUIRED = 16;
export const AUTO_OUTLIER_RATIO = 0.15;
export const ROTOR_PIVOT_NAME_PREFIX = "RotorPivot_";

const ROTOR_PIVOT_USERDATA_KEY = "rotorPivot";
const ROTOR_TARGET_UUID_USERDATA_KEY = "rotorTargetUuid";

export type RotationTargetConfig = {
  name: string;
  pivot: [number, number, number];
  axis: [number, number, number];
  reverse?: boolean;
  rpm?: number;
  frequency?: number;
  duration?: number;
  keyframes?: number;
  animationName?: string;
};

export interface ResolvedRotorTarget {
  object: THREE.Object3D;
  config: RotationTargetConfig;
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _invTarget = new THREE.Matrix4();

function vector3FromValues(values: Vector3Values): THREE.Vector3 {
  return new THREE.Vector3(values.x, values.y, values.z);
}

function valuesFromVector3(v: THREE.Vector3): Vector3Values {
  return { x: v.x, y: v.y, z: v.z };
}

function normalizeVector(v: THREE.Vector3, eps = 1e-12): THREE.Vector3 {
  const n = v.length();
  if (n < eps) {
    return v.clone();
  }
  return v.clone().divideScalar(n);
}

function getRps(config: RotationTargetConfig) {
  if (config.rpm != null) {
    return config.rpm / 60;
  }
  if (config.frequency != null) {
    return config.frequency;
  }
  return 1;
}

function hasMeshDescendant(object: THREE.Object3D): boolean {
  if (isMesh(object)) {
    return true;
  }

  for (const child of object.children) {
    if (hasMeshDescendant(child)) {
      return true;
    }
  }

  return false;
}

export function collectMeshLocalPoints(object: THREE.Object3D): THREE.Vector3[] {
  object.updateMatrixWorld(true);
  _invTarget.copy(object.matrixWorld).invert();

  const points: THREE.Vector3[] = [];

  object.traverse((child) => {
    if (!isMesh(child)) {
      return;
    }

    const position = child.geometry.getAttribute("position");

    if (!position) {
      return;
    }

    _m.multiplyMatrices(_invTarget, child.matrixWorld);

    for (let i = 0; i < position.count; i++) {
      _v.fromBufferAttribute(position, i);
      _v.applyMatrix4(_m);
      points.push(_v.clone());
    }
  });

  return points;
}

function trimOutliersByRadius(
  points: THREE.Vector3[],
  keepRatio = 0.85,
): THREE.Vector3[] {
  if (points.length < 10) {
    return points;
  }

  const center = new THREE.Vector3();
  for (const p of points) {
    center.add(p);
  }
  center.divideScalar(points.length);

  const distances = points.map((p) => p.distanceTo(center));
  const sorted = [...distances].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(keepRatio * (sorted.length - 1))] ?? sorted.at(-1)!;

  const trimmed = points.filter((_, i) => distances[i] <= threshold);

  if (trimmed.length < Math.max(MIN_POINTS_REQUIRED, Math.floor(points.length * 0.2))) {
    return points;
  }

  return trimmed;
}

function symmetricEigen3x3(cov: number[][]): { values: number[]; vectors: THREE.Vector3[] } {
  const a = [
    [cov[0][0], cov[0][1], cov[0][2]],
    [cov[1][0], cov[1][1], cov[1][2]],
    [cov[2][0], cov[2][1], cov[2][2]],
  ];

  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const maxSweeps = 50;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;

    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        off += Math.abs(a[p][q]);
      }
    }

    if (off < 1e-12) {
      break;
    }

    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-12) {
          continue;
        }

        const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
        const c = Math.cos(phi);
        const s = Math.sin(phi);

        const app = a[p][p];
        const aqq = a[q][q];
        a[p][p] = c * c * app + s * s * aqq - 2 * s * c * a[p][q];
        a[q][q] = s * s * app + c * c * aqq + 2 * s * c * a[p][q];
        a[p][q] = 0;
        a[q][p] = 0;

        for (let r = 0; r < 3; r++) {
          if (r === p || r === q) {
            continue;
          }
          const arp = a[r][p];
          const arq = a[r][q];
          a[r][p] = c * arp - s * arq;
          a[p][r] = a[r][p];
          a[r][q] = s * arp + c * arq;
          a[q][r] = a[r][q];
        }

        for (let r = 0; r < 3; r++) {
          const vrp = v[r][p];
          const vrq = v[r][q];
          v[r][p] = c * vrp - s * vrq;
          v[r][q] = s * vrp + c * vrq;
        }
      }
    }
  }

  const values = [a[0][0], a[1][1], a[2][2]];
  const order = [0, 1, 2].sort((i, j) => values[i] - values[j]);
  const sortedValues = order.map((i) => values[i]);
  const vectors = order.map((i) => new THREE.Vector3(v[0][i], v[1][i], v[2][i]));

  return { values: sortedValues, vectors };
}

export function estimatePivotAndAxis(
  object: THREE.Object3D,
  outlierRatio = AUTO_OUTLIER_RATIO,
): { pivot: Vector3Values; axis: Vector3Values } {
  let points = collectMeshLocalPoints(object);

  if (points.length < MIN_POINTS_REQUIRED) {
    throw new Error("頂點數不足，無法自動估計 pivot / axis");
  }

  if (outlierRatio > 0 && outlierRatio < 1) {
    points = trimOutliersByRadius(points, 1 - outlierRatio);
  }

  const mean = new THREE.Vector3();
  for (const p of points) {
    mean.add(p);
  }
  mean.divideScalar(points.length);

  let cxx = 0;
  let cyy = 0;
  let czz = 0;
  let cxy = 0;
  let cxz = 0;
  let cyz = 0;

  for (const p of points) {
    const dx = p.x - mean.x;
    const dy = p.y - mean.y;
    const dz = p.z - mean.z;
    cxx += dx * dx;
    cyy += dy * dy;
    czz += dz * dz;
    cxy += dx * dy;
    cxz += dx * dz;
    cyz += dy * dz;
  }

  const n = points.length;
  const cov = [
    [cxx / n, cxy / n, cxz / n],
    [cxy / n, cyy / n, cyz / n],
    [cxz / n, cyz / n, czz / n],
  ];

  const { vectors } = symmetricEigen3x3(cov);
  const axisLocal = normalizeVector(vectors[0]);

  const basis = vectors;
  let mins = [Infinity, Infinity, Infinity];
  let maxs = [-Infinity, -Infinity, -Infinity];

  for (const p of points) {
    const dx = p.x - mean.x;
    const dy = p.y - mean.y;
    const dz = p.z - mean.z;
    const proj = [
      dx * basis[0].x + dy * basis[0].y + dz * basis[0].z,
      dx * basis[1].x + dy * basis[1].y + dz * basis[1].z,
      dx * basis[2].x + dy * basis[2].y + dz * basis[2].z,
    ];

    for (let i = 0; i < 3; i++) {
      mins[i] = Math.min(mins[i], proj[i]);
      maxs[i] = Math.max(maxs[i], proj[i]);
    }
  }

  const obbCenter = mean.clone();
  for (let i = 0; i < 3; i++) {
    const mid = (mins[i] + maxs[i]) * 0.5;
    obbCenter.addScaledVector(basis[i], mid);
  }

  const pivotParentLocal = obbCenter.clone().add(object.position);

  return {
    pivot: valuesFromVector3(pivotParentLocal),
    axis: valuesFromVector3(axisLocal),
  };
}

export function resolveTargetConfig(
  object: THREE.Object3D,
  input: RotorTargetConfig,
): RotationTargetConfig {
  let pivot: Vector3Values;
  let axis: Vector3Values;

  if (input.pivotMode === "auto" || input.axisMode === "auto") {
    const estimated = estimatePivotAndAxis(object);
    pivot = input.pivotMode === "auto" ? estimated.pivot : input.pivot;
    axis = input.axisMode === "auto" ? estimated.axis : input.axis;
  } else {
    pivot = input.pivot;
    axis = input.axis;
  }

  const axisVec = normalizeVector(vector3FromValues(axis));
  if (input.reverse) {
    axisVec.negate();
  }

  return {
    name: object.name || input.nodeId,
    pivot: [pivot.x, pivot.y, pivot.z],
    axis: [axisVec.x, axisVec.y, axisVec.z],
    reverse: false,
    rpm: input.rpm,
    duration: input.duration,
    keyframes: input.keyframes,
  };
}

export function validateRotorTarget(object: THREE.Object3D, input: RotorTargetConfig): void {
  if (!object.parent) {
    throw new Error(`${object.name || input.nodeId}：節點沒有 parent`);
  }

  if (!hasMeshDescendant(object)) {
    throw new Error(`${object.name || input.nodeId}：節點沒有 mesh`);
  }

  if (input.pivotMode === "manual" && !input.pivot) {
    throw new Error(`${object.name || input.nodeId}：manual pivot 需要 pivot 值`);
  }

  if (input.axisMode === "manual" && !input.axis) {
    throw new Error(`${object.name || input.nodeId}：manual axis 需要 axis 值`);
  }

  if (input.duration <= 0) {
    throw new Error(`${object.name || input.nodeId}：duration 必須 > 0`);
  }

  if (input.keyframes < 2) {
    throw new Error(`${object.name || input.nodeId}：keyframes 至少為 2`);
  }
}

export function createDefaultRotorTargetConfig(nodeId: string): RotorTargetConfig {
  return {
    nodeId,
    pivotMode: "auto",
    pivot: { x: 0, y: 0, z: 0 },
    axisMode: "auto",
    axis: { x: 0, y: 0, z: 1 },
    reverse: true,
    rpm: 3000,
    duration: 0.5,
    keyframes: DEFAULT_KEYFRAMES,
  };
}

export function getRotorPivotName(target: THREE.Object3D): string {
  return `${ROTOR_PIVOT_NAME_PREFIX}${target.uuid}`;
}

export function markRotorPivotNode(pivot: THREE.Object3D, target: THREE.Object3D) {
  pivot.userData[ROTOR_PIVOT_USERDATA_KEY] = true;
  pivot.userData[ROTOR_TARGET_UUID_USERDATA_KEY] = target.uuid;
}

export function resolveRotorAnimationTrackNode(
  root: THREE.Object3D,
  trackNodeName: string,
): THREE.Object3D | null {
  const byName = root.getObjectByName(trackNodeName);
  if (byName) {
    return byName;
  }

  if (!trackNodeName.startsWith(ROTOR_PIVOT_NAME_PREFIX)) {
    return null;
  }

  const targetUuid = trackNodeName.slice(ROTOR_PIVOT_NAME_PREFIX.length);
  let resolved: THREE.Object3D | null = null;

  root.traverse((object) => {
    if (
      object.userData[ROTOR_PIVOT_USERDATA_KEY] === true &&
      object.userData[ROTOR_TARGET_UUID_USERDATA_KEY] === targetUuid
    ) {
      resolved = object;
    }
  });

  return resolved;
}

function findExistingPivot(target: THREE.Object3D): THREE.Object3D | null {
  const parent = target.parent;
  if (parent && isRotorPivotNode(parent)) {
    return parent;
  }

  return null;
}

const _worldBefore = new THREE.Matrix4();
const _worldAfter = new THREE.Matrix4();
const _inverseParent = new THREE.Matrix4();

export function createPivotForTarget(
  target: THREE.Object3D,
  pivotLocal: THREE.Vector3,
): THREE.Object3D {
  const existing = findExistingPivot(target);
  if (existing) {
    return existing;
  }

  const parent = target.parent;

  if (!parent) {
    throw new Error(`目標節點沒有 parent：${target.name}`);
  }

  parent.updateMatrixWorld(true);
  _worldBefore.copy(target.matrixWorld);

  const localPosition = target.position.clone();
  const localQuaternion = target.quaternion.clone();
  const localScale = target.scale.clone();

  const pivot = new THREE.Object3D();
  pivot.name = getRotorPivotName(target);
  markRotorPivotNode(pivot, target);
  pivot.position.copy(pivotLocal);
  pivot.quaternion.set(0, 0, 0, 1);
  pivot.scale.set(1, 1, 1);

  parent.add(pivot);
  pivot.add(target);

  // 對齊 Python：pivot.translation = pivot；child.translation = child_t - pivot
  target.position.copy(localPosition.sub(pivotLocal));
  target.quaternion.copy(localQuaternion);
  target.scale.copy(localScale);
  target.updateMatrixWorld(true);

  _worldAfter.copy(target.matrixWorld);
  if (!_worldBefore.equals(_worldAfter)) {
    restorePivotWithWorldMatrix(target, pivot, _worldBefore);
  }

  return pivot;
}

function restorePivotWithWorldMatrix(
  target: THREE.Object3D,
  pivot: THREE.Object3D,
  worldMatrix: THREE.Matrix4,
) {
  pivot.quaternion.set(0, 0, 0, 1);
  pivot.scale.set(1, 1, 1);
  pivot.updateMatrixWorld(true);

  const inversePivotWorld = pivot.matrixWorld.clone().invert();
  target.matrix.copy(inversePivotWorld.multiply(worldMatrix));
  target.matrix.decompose(target.position, target.quaternion, target.scale);
  target.updateMatrixWorld(true);
}

export function isRotorPivotNode(object: THREE.Object3D) {
  if (object.userData[ROTOR_PIVOT_USERDATA_KEY] === true) {
    return true;
  }

  // 相容舊版以節點名稱結尾 `_Pivot` 建立的 pivot。
  return object.name.endsWith("_Pivot");
}

export function collectRotorPivotNodes(root: THREE.Object3D) {
  const pivots: THREE.Object3D[] = [];

  root.traverse((object) => {
    if (isRotorPivotNode(object)) {
      pivots.push(object);
    }
  });

  return pivots;
}

export function unwrapRotorPivot(pivot: THREE.Object3D) {
  const parent = pivot.parent;

  if (!parent || pivot.children.length !== 1) {
    return null;
  }

  const target = pivot.children[0] as THREE.Object3D;

  pivot.quaternion.set(0, 0, 0, 1);
  pivot.updateMatrixWorld(true);

  const targetWorld = target.matrixWorld.clone();
  parent.add(target);
  parent.remove(pivot);

  parent.updateMatrixWorld(true);
  _inverseParent.copy(parent.matrixWorld).invert();
  target.matrix.copy(_inverseParent.multiply(targetWorld));
  target.matrix.decompose(target.position, target.quaternion, target.scale);
  target.updateMatrixWorld(true);

  return target;
}

export function removeRotorAnimationFromScene(root: THREE.Object3D) {
  const pivots = collectRotorPivotNodes(root);

  for (const pivot of pivots) {
    unwrapRotorPivot(pivot);
  }

  return pivots.map((pivot) => pivot.name);
}

export function resetRotorPivotsToBindPose(
  root: THREE.Object3D,
  animations: THREE.AnimationClip[],
) {
  for (const clip of animations) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion") || track.values.length < 4) {
        continue;
      }

      const nodeName = track.name.slice(0, -".quaternion".length);
      const node = resolveRotorAnimationTrackNode(root, nodeName);

      if (!node) {
        continue;
      }

      node.quaternion.set(
        track.values[0],
        track.values[1],
        track.values[2],
        track.values[3],
      );
    }
  }

  root.updateMatrixWorld(true);
}

export function createRotationClipForPivot(
  pivot: THREE.Object3D,
  config: RotationTargetConfig,
  animationName: string,
): THREE.AnimationClip {
  const rps = getRps(config);
  const duration = config.duration != null ? config.duration : 1 / rps;
  const rotations = rps * duration;
  const keyframeCount =
    config.keyframes ?? Math.max(DEFAULT_KEYFRAMES, Math.ceil(rotations * 32));

  const axis = new THREE.Vector3(...config.axis).normalize();

  const times: number[] = [];
  const values: number[] = [];
  let previousQuaternion: THREE.Quaternion | null = null;

  for (let i = 0; i <= keyframeCount; i++) {
    const t = (duration * i) / keyframeCount;
    const angle = 2 * Math.PI * rps * t;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);

    if (previousQuaternion && previousQuaternion.dot(q) < 0) {
      q.set(-q.x, -q.y, -q.z, -q.w);
    }

    times.push(t);
    values.push(q.x, q.y, q.z, q.w);
    previousQuaternion = q.clone();
  }

  const track = new THREE.QuaternionKeyframeTrack(
    `${pivot.name}.quaternion`,
    times,
    values,
  );

  return new THREE.AnimationClip(animationName, duration, [track]);
}

export function addRotationAnimationToNode(
  target: THREE.Object3D,
  config: RotationTargetConfig,
  animationName = DEFAULT_ANIMATION_NAME,
) {
  const pivot = createPivotForTarget(
    target,
    new THREE.Vector3(...config.pivot),
  );

  const clip = createRotationClipForPivot(pivot, config, animationName);

  return { pivot, clip };
}

export interface RotorAnimationBatchResult {
  clip: THREE.AnimationClip;
  pivots: THREE.Object3D[];
}

export function addRotorAnimationBatch(
  targets: ResolvedRotorTarget[],
  animationName = DEFAULT_ANIMATION_NAME,
): RotorAnimationBatchResult {
  const tracks: THREE.KeyframeTrack[] = [];
  let maxDuration = 0;

  const pivotsByUuid = new Map<string, THREE.Object3D>();

  for (const { object, config } of targets) {
    const { pivot, clip } = addRotationAnimationToNode(object, config, animationName);
    pivotsByUuid.set(pivot.uuid, pivot);
    maxDuration = Math.max(maxDuration, clip.duration);

    for (const track of clip.tracks) {
      tracks.push(track);
    }
  }

  const clip = new THREE.AnimationClip(animationName, maxDuration, tracks);
  return { clip, pivots: [...pivotsByUuid.values()] };
}
