import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { isMesh, toMaterialArray } from "./modelUtils";

export function deriveExportedFileName(sourceFileName: string) {
  const base = sourceFileName.replace(/\.(glb|gltf)$/i, "");
  return `${base}_exported.glb`;
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
  fileName: string;
  wireframeEnabled?: boolean;
}) {
  const {
    root,
    animations = [],
    fileName,
    wireframeEnabled = false,
  } = options;

  await withWireframeDisabled(root, wireframeEnabled, async () => {
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
  });
}
