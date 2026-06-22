import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import {
  resolveRotorAnimationTrackNode,
} from "./addRotorAnimation";
import { isMesh, toMaterialArray } from "./modelUtils";
import type { AnimationClipSettings } from "../types/glb-viewer";

export function deriveExportedFileName(sourceFileName: string) {
  const base = sourceFileName.replace(/\.(glb|gltf)$/i, "");
  return `${base}_exported.glb`;
}

interface MixerSnapshot {
  clip: THREE.AnimationClip;
  time: number;
  paused: boolean;
  enabled: boolean;
}

function snapshotMixer(
  mixer: THREE.AnimationMixer,
  animations: THREE.AnimationClip[],
): MixerSnapshot[] {
  return animations.map((clip) => {
    const action = mixer.clipAction(clip);
    return {
      clip,
      time: action.time,
      paused: action.paused,
      enabled: action.enabled,
    };
  });
}

function resetMixerToBindPose(
  root: THREE.Object3D,
  mixer: THREE.AnimationMixer,
  animations: THREE.AnimationClip[],
) {
  for (const clip of animations) {
    const action = mixer.clipAction(clip);
    action.stop();
    action.reset();
    action.time = 0;
  }

  mixer.update(0);

  for (const clip of animations) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith(".quaternion")) {
        continue;
      }

      const nodeName = track.name.slice(0, -".quaternion".length);
      const node = resolveRotorAnimationTrackNode(root, nodeName);

      if (!node || track.values.length < 4) {
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

function restoreMixer(mixer: THREE.AnimationMixer, snapshots: MixerSnapshot[]) {
  mixer.stopAllAction();

  for (const snapshot of snapshots) {
    if (!snapshot.enabled) {
      continue;
    }

    const action = mixer.clipAction(snapshot.clip);
    action.reset();
    action.play();
    action.time = snapshot.time;
    action.paused = snapshot.paused;
  }

  mixer.update(0);
}

function withAnimationBindPose(
  root: THREE.Object3D,
  mixer: THREE.AnimationMixer | null | undefined,
  exportAnimations: THREE.AnimationClip[],
  runtimeAnimations: THREE.AnimationClip[],
  run: () => Promise<void>,
): Promise<void> {
  if (!mixer || exportAnimations.length === 0) {
    root.updateMatrixWorld(true);
    return run();
  }

  const snapshots = snapshotMixer(mixer, runtimeAnimations);
  resetMixerToBindPose(root, mixer, exportAnimations);

  return run().finally(() => {
    restoreMixer(mixer, snapshots);
    root.updateMatrixWorld(true);
  });
}

export function cloneAnimationClipForExport(
  clip: THREE.AnimationClip,
  meta?: AnimationClipSettings,
): THREE.AnimationClip {
  const exportClip = clip.clone();
  exportClip.name = clip.name;

  const timeScale = meta?.timeScale ?? 1;
  if (timeScale === 1) {
    return exportClip;
  }

  const factor = 1 / timeScale;
  exportClip.duration = clip.duration * factor;

  for (const track of exportClip.tracks) {
    const scaledTimes = track.times.slice();
    for (let i = 0; i < scaledTimes.length; i += 1) {
      scaledTimes[i] = scaledTimes[i]! * factor;
    }
    track.times = scaledTimes;
  }

  return exportClip;
}

export function prepareAnimationClipsForExport(
  clips: THREE.AnimationClip[],
  metaByUuid: Map<string, AnimationClipSettings>,
): THREE.AnimationClip[] {
  return clips.map((clip) =>
    cloneAnimationClipForExport(clip, metaByUuid.get(clip.uuid)),
  );
}

function withRootOriginOffset(
  root: THREE.Object3D,
  originOffset: THREE.Vector3 | null | undefined,
  run: () => Promise<void>,
): Promise<void> {
  if (!originOffset || originOffset.lengthSq() === 0) {
    return run();
  }

  const savedPosition = root.position.clone();
  root.position.add(originOffset);
  root.updateMatrixWorld(true);

  return run().finally(() => {
    root.position.copy(savedPosition);
    root.updateMatrixWorld(true);
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function withWireframeDisabled(
  root: THREE.Object3D,
  wireframeEnabled: boolean,
  run: () => Promise<void>,
): Promise<void> {
  if (!wireframeEnabled) {
    return run();
  }

  const restoredMaterials: THREE.Material[] = [];

  root.traverse((object) => {
    if (!isMesh(object)) {
      return;
    }

    for (const material of toMaterialArray(object.material)) {
      const wireframeMaterial = material as THREE.Material & {
        wireframe?: boolean;
      };

      if (!wireframeMaterial.wireframe) {
        continue;
      }

      wireframeMaterial.wireframe = false;
      material.needsUpdate = true;
      restoredMaterials.push(material);
    }
  });

  return run().finally(() => {
    for (const material of restoredMaterials) {
      const wireframeMaterial = material as THREE.Material & {
        wireframe?: boolean;
      };
      wireframeMaterial.wireframe = true;
      material.needsUpdate = true;
    }
  });
}

export async function exportObjectAsGlb(options: {
  root: THREE.Object3D;
  animations?: THREE.AnimationClip[];
  runtimeAnimations?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer | null;
  originOffset?: THREE.Vector3 | null;
  fileName: string;
  wireframeEnabled?: boolean;
}) {
  const {
    root,
    animations = [],
    runtimeAnimations = animations,
    mixer = null,
    originOffset = null,
    fileName,
    wireframeEnabled = false,
  } = options;

  await withWireframeDisabled(root, wireframeEnabled, async () => {
    await withRootOriginOffset(root, originOffset, async () => {
      await withAnimationBindPose(
        root,
        mixer,
        animations,
        runtimeAnimations,
        async () => {
        const exporter = new GLTFExporter();
        const result = await exporter.parseAsync(root, {
          binary: true,
          animations,
          embedImages: true,
          onlyVisible: false,
        });

        const blob = new Blob([result as ArrayBuffer], {
          type: "model/gltf-binary",
        });
        downloadBlob(blob, fileName);
        },
      );
    });
  });
}
