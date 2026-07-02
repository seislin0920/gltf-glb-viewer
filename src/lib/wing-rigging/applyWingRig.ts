import * as THREE from "three";
import type { WingLandmarks, WingWeightOptions } from "../../types/wing-rigging";
import { buildBirdSkeleton } from "./buildBirdSkeleton";
import { computeWingSkinWeights } from "./computeWingSkinWeights";
import {
  bakeGeometryToMeshLocal,
  bindSkinnedMesh,
  createSkinnedMeshFromGeometry,
} from "./convertToSkinnedMesh";
import { withDefaultWingWeightOptions } from "./resolveWingWeightScale";

function toLocalLandmarks(
  landmarks: WingLandmarks,
  parent: THREE.Object3D,
): Record<string, THREE.Vector3> {
  parent.updateMatrixWorld(true);
  const inv = parent.matrixWorld.clone().invert();
  const local: Record<string, THREE.Vector3> = {};

  for (const [key, value] of Object.entries(landmarks)) {
    local[key] = value.clone().applyMatrix4(inv);
  }

  return local;
}

export function createWingSkeleton(
  landmarks: WingLandmarks,
  armature: THREE.Object3D,
) {
  const { rootBone, skeleton, boneByName } = buildBirdSkeleton(
    landmarks,
    armature,
  );
  armature.add(rootBone);
  return { rootBone, skeleton, boneByName };
}

export function bindMeshToWingSkeleton(
  mesh: THREE.Mesh,
  armature: THREE.Object3D,
  skeleton: THREE.Skeleton,
  localLandmarks: Record<string, THREE.Vector3>,
  options?: Partial<WingWeightOptions>,
) {
  const bakedGeometry = bakeGeometryToMeshLocal(mesh, armature);

  const boneIndexByName: Record<string, number> = {};
  skeleton.bones.forEach((bone, index) => {
    boneIndexByName[bone.name] = index;
  });

  const position = bakedGeometry.getAttribute("position");
  if (!(position instanceof THREE.BufferAttribute)) {
    throw new Error("找不到可用的頂點座標資料。");
  }

  const { skinIndex, skinWeight } = computeWingSkinWeights(
    position,
    localLandmarks,
    boneIndexByName,
    withDefaultWingWeightOptions(options),
  );

  const skinned = createSkinnedMeshFromGeometry(
    bakedGeometry,
    mesh,
    skinIndex,
    skinWeight,
  );
  armature.add(skinned);
  bindSkinnedMesh(skinned, skeleton);

  return { skinned, boneIndexByName };
}

export function applyWingRigToMesh(
  mesh: THREE.Mesh,
  landmarks: WingLandmarks,
  armature: THREE.Object3D,
  options?: Partial<WingWeightOptions>,
) {
  const { rootBone, skeleton, boneByName } = createWingSkeleton(
    landmarks,
    armature,
  );
  const localLandmarks = toLocalLandmarks(landmarks, armature);
  const { skinned, boneIndexByName } = bindMeshToWingSkeleton(
    mesh,
    armature,
    skeleton,
    localLandmarks,
    options,
  );

  return {
    skinned,
    skeleton,
    rootBone,
    boneByName,
    boneIndexByName,
    localLandmarks,
  };
}
