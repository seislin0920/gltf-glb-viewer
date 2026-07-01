import * as THREE from "three";

interface PivotFlapTarget {
  pivot: THREE.Object3D;
  mirrorSign?: number;
}

interface PivotFlapOptions {
  name: string;
  duration: number;
  amplitude: number;
  axis?: "x" | "y" | "z";
}

const _axis = new THREE.Vector3();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();

export function createFlapClipForPivot(
  targets: PivotFlapTarget[],
  options: PivotFlapOptions,
): THREE.AnimationClip {
  const axis = options.axis ?? "z";
  const times = [0, 0.25, 0.5, 0.75, 1].map((t) => t * options.duration);
  const baseAngles = [0, -1, 0, 1, 0];

  const tracks: THREE.KeyframeTrack[] = [];

  for (const target of targets) {
    const values: number[] = [];
    let prev: THREE.Quaternion | null = null;

    for (let i = 0; i < times.length; i += 1) {
      const angle = baseAngles[i]! * options.amplitude * (target.mirrorSign ?? 1);
      _axis.set(0, 0, 0);
      _axis[axis] = 1;
      _euler.set(0, 0, 0);
      _euler[axis] = angle;
      _q.setFromEuler(_euler);

      if (prev && prev.dot(_q) < 0) {
        _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      }

      values.push(_q.x, _q.y, _q.z, _q.w);
      prev = _q.clone();
    }

    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${target.pivot.name}.quaternion`,
        times,
        values,
      ),
    );
  }

  return new THREE.AnimationClip(options.name, options.duration, tracks);
}
