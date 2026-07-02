import * as THREE from "three";
import type { WingBoneSlotId } from "../../types/wing-rigging";
import { WING_BONE_SLOT_OPTIONS } from "../../types/wing-rigging";

export function buildWingBoneMapping(
  slotNodeIds: Partial<Record<WingBoneSlotId, string>>,
  resolveObject: (nodeId: string) => THREE.Object3D | undefined,
) {
  const mapping = new Map<string, THREE.Bone>();

  for (const slot of WING_BONE_SLOT_OPTIONS) {
    const nodeId = slotNodeIds[slot.id];
    if (!nodeId) {
      continue;
    }

    const object = resolveObject(nodeId);
    if (!(object instanceof THREE.Bone)) {
      continue;
    }

    mapping.set(slot.id, object);
  }

  return mapping;
}

export function isWingBoneMappingReady(
  slotNodeIds: Partial<Record<WingBoneSlotId, string>>,
) {
  return WING_BONE_SLOT_OPTIONS.filter((slot) => slot.required).every(
    (slot) => Boolean(slotNodeIds[slot.id]),
  );
}
