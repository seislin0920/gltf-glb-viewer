import * as THREE from "three";
import type { WingLandmarks, WingWeightOptions } from "../../types/wing-rigging";
import { buildBirdSkeleton } from "./buildBirdSkeleton";
import { computeWingSkinWeights } from "./computeWingSkinWeights";
import {
  bakeGeometryToMeshLocal,
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

export function applyWingRigToMesh(
  mesh: THREE.Mesh,
  landmarks: WingLandmarks,
  parent: THREE.Object3D,
  options?: Partial<WingWeightOptions>,
) {
  const { rootBone, skeleton, boneByName } = buildBirdSkeleton(landmarks, parent);
  const localLandmarks = toLocalLandmarks(landmarks, parent);
  const bakedGeometry = bakeGeometryToMeshLocal(mesh, parent);

  const boneIndexByName: Record<string, number> = {};
  skeleton.bones.forEach((bone, index) => {
    boneIndexByName[bone.name] = index;
  });

  const { skinIndex, skinWeight } = computeWingSkinWeights(
    bakedGeometry.getAttribute("position"),
    localLandmarks,
    boneIndexByName,
    withDefaultWingWeightOptions(options),
  );

  const skinned = createSkinnedMeshFromGeometry(
    bakedGeometry,
    mesh,
    skeleton,
    rootBone,
    skinIndex,
    skinWeight,
  );

  return { skinned, skeleton, rootBone, boneByName, localLandmarks };
}
