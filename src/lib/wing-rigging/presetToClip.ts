import * as THREE from "three";
import type {
  WingFlapPreset,
  WingFlapApplyOptions,
} from "../../types/wing-rigging";

const _axis = new THREE.Vector3();
const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _bindQ = new THREE.Quaternion();

export function presetToAnimationClip(
  preset: WingFlapPreset,
  boneByName: Map<string, THREE.Bone>,
  options: WingFlapApplyOptions = {},
): THREE.AnimationClip {
  const speed = options.speedMultiplier ?? 1;
  const amp = options.amplitudeMultiplier ?? 1;
  const mirror = options.mirrorRight ?? preset.mirrorRight;
  const duration = preset.duration / speed;

  const tracks: THREE.KeyframeTrack[] = [];

  for (const trackDef of preset.tracks) {
    const isRight = trackDef.bone.startsWith("R_");
    const bone = boneByName.get(trackDef.bone);
    if (!bone) {
      continue;
    }

    bone.updateWorldMatrix(true, false);
    _bindQ.copy(bone.quaternion);

    const times: number[] = [];
    const values: number[] = [];
    let prev: THREE.Quaternion | null = null;

    for (const key of trackDef.keys) {
      const t = key.time / speed;
      let angle = key.value * amp;
      if (mirror && isRight) {
        angle *= trackDef.mirrorSign ?? -1;
      }

      _axis.set(0, 0, 0);
      _axis[trackDef.axis] = 1;
      _euler.set(0, 0, 0);
      _euler[trackDef.axis] = angle;
      _q.setFromEuler(_euler).multiply(_bindQ);

      if (prev && prev.dot(_q) < 0) {
        _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
      }

      times.push(t);
      values.push(_q.x, _q.y, _q.z, _q.w);
      prev = _q.clone();
    }

    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${bone.name}.quaternion`,
        times,
        values,
      ),
    );
  }

  return new THREE.AnimationClip(preset.name, duration, tracks);
}
