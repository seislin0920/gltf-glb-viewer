import * as THREE from "three";

export function bakeGeometryToMeshLocal(
  mesh: THREE.Mesh,
  parent?: THREE.Object3D | null,
): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone();
  mesh.updateMatrixWorld(true);

  if (parent) {
    parent.updateMatrixWorld(true);
    const parentInv = parent.matrixWorld.clone().invert();
    const localMatrix = parentInv.multiply(mesh.matrixWorld);
    geometry.applyMatrix4(localMatrix);
  } else {
    geometry.applyMatrix4(mesh.matrixWorld);
  }

  return geometry;
}

export function convertMeshToSkinned(
  mesh: THREE.Mesh,
  skeleton: THREE.Skeleton,
  rootBone: THREE.Bone,
  skinIndex: THREE.BufferAttribute,
  skinWeight: THREE.BufferAttribute,
): THREE.SkinnedMesh {
  const geometry = bakeGeometryToMeshLocal(mesh, mesh.parent);
  return createSkinnedMeshFromGeometry(
    geometry,
    mesh,
    skeleton,
    rootBone,
    skinIndex,
    skinWeight,
  );
}

export function createSkinnedMeshFromGeometry(
  geometry: THREE.BufferGeometry,
  sourceMesh: THREE.Mesh,
  skeleton: THREE.Skeleton,
  rootBone: THREE.Bone,
  skinIndex: THREE.BufferAttribute,
  skinWeight: THREE.BufferAttribute,
): THREE.SkinnedMesh {
  geometry.setAttribute("skinIndex", skinIndex);
  geometry.setAttribute("skinWeight", skinWeight);

  const skinned = new THREE.SkinnedMesh(geometry, sourceMesh.material);
  skinned.name = sourceMesh.name;
  skinned.castShadow = sourceMesh.castShadow;
  skinned.receiveShadow = sourceMesh.receiveShadow;

  skinned.add(rootBone);
  skinned.bind(skeleton);
  skinned.normalizeSkinWeights();

  skinned.position.set(0, 0, 0);
  skinned.quaternion.identity();
  skinned.scale.set(1, 1, 1);

  return skinned;
}
