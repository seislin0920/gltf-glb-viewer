import * as THREE from "three";

type ArmatureResolution = {
  armature: THREE.Object3D;
  owned: boolean;
};

function hasBoneChild(node: THREE.Object3D) {
  return node.children.some((child) => child instanceof THREE.Bone);
}

export function isArmatureContainer(node: THREE.Object3D) {
  if (/armature/i.test(node.name)) {
    return true;
  }

  return hasBoneChild(node);
}

function findArmatureInSiblings(parent: THREE.Object3D | null) {
  if (!parent) {
    return null;
  }

  return parent.children.find((child) => isArmatureContainer(child)) ?? null;
}

function insertArmatureBetween(
  parent: THREE.Object3D,
  target: THREE.Object3D,
) {
  const armature = new THREE.Group();
  armature.name = "Armature";
  armature.position.copy(target.position);
  armature.quaternion.copy(target.quaternion);
  armature.scale.copy(target.scale);

  target.position.set(0, 0, 0);
  target.quaternion.identity();
  target.scale.set(1, 1, 1);

  parent.add(armature);
  armature.add(target);

  return armature;
}

export function resolveArmatureContainer(
  target: THREE.Object3D,
  modelRoot: THREE.Object3D,
): ArmatureResolution {
  const parent = target.parent ?? modelRoot;

  if (isArmatureContainer(parent)) {
    return { armature: parent, owned: false };
  }

  const existing = findArmatureInSiblings(parent) ?? findArmatureInSiblings(modelRoot);
  if (existing) {
    return { armature: existing, owned: false };
  }

  if (target.parent) {
    return { armature: insertArmatureBetween(target.parent, target), owned: true };
  }

  const armature = new THREE.Group();
  armature.name = "Armature";
  modelRoot.add(armature);
  armature.add(target);
  return { armature, owned: true };
}
