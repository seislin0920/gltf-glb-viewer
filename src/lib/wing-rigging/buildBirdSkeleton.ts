import * as THREE from "three";
import type { WingLandmarks, BirdBoneName } from "../../types/wing-rigging";

const BONE_NAMES = {
  root: "BirdRoot",
  L: ["L_Wing_01_Shoulder", "L_Wing_02_Mid", "L_Wing_03_Tip"],
  R: ["R_Wing_01_Shoulder", "R_Wing_02_Mid", "R_Wing_03_Tip"],
} as const;

export function buildBirdSkeleton(
  landmarks: WingLandmarks,
  attachParent: THREE.Object3D,
) {
  const rootWorld = new THREE.Vector3()
    .addVectors(landmarks.L_Shoulder, landmarks.R_Shoulder)
    .multiplyScalar(0.5);

  const rootBone = new THREE.Bone();
  rootBone.name = BONE_NAMES.root;

  function createChain(
    parent: THREE.Bone,
    parentWorld: THREE.Vector3,
    worldPoints: THREE.Vector3[],
    names: BirdBoneName[],
  ) {
    let currentParent = parent;
    let currentWorld = parentWorld.clone();

    for (let i = 0; i < names.length; i += 1) {
      const bone = new THREE.Bone();
      bone.name = names[i];

      const targetWorld = worldPoints[i]!;
      bone.position.copy(targetWorld.clone().sub(currentWorld));

      currentParent.add(bone);
      currentParent = bone;
      currentWorld = targetWorld.clone();
    }
  }

  createChain(
    rootBone,
    rootWorld,
    [landmarks.L_Shoulder, landmarks.L_Mid, landmarks.L_Tip],
    [...BONE_NAMES.L],
  );
  createChain(
    rootBone,
    rootWorld,
    [landmarks.R_Shoulder, landmarks.R_Mid, landmarks.R_Tip],
    [...BONE_NAMES.R],
  );

  attachParent.updateMatrixWorld(true);
  const parentInv = attachParent.matrixWorld.clone().invert();
  const rootLocal = rootWorld.clone().applyMatrix4(parentInv);
  rootBone.position.copy(rootLocal);

  const bones: THREE.Bone[] = [];
  rootBone.traverse((node) => {
    if (node instanceof THREE.Bone) {
      bones.push(node);
    }
  });

  const skeleton = new THREE.Skeleton(bones);
  const boneByName = new Map<string, THREE.Bone>();
  bones.forEach((bone) => boneByName.set(bone.name, bone));

  return { rootBone, skeleton, boneByName };
}
