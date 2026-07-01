import type { WingFlapPreset, WingFlapTrack } from "../../types/wing-rigging";

function makeKeys(
  duration: number,
  values: number[],
  offsets: number[] = [],
): Array<{ time: number; value: number }> {
  const count = values.length;
  const step = duration / (count - 1);
  return values.map((value, index) => ({
    time: index * step + (offsets[index] ?? 0),
    value,
  }));
}

function makeTrack(
  bone: WingFlapTrack["bone"],
  duration: number,
  values: number[],
  axis: WingFlapTrack["axis"] = "z",
  delay = 0,
  amplitude = 1,
): WingFlapTrack {
  const keys = makeKeys(duration, values).map((key) => ({
    time: key.time + delay,
    value: key.value * amplitude,
  }));

  return {
    bone,
    space: "local",
    rotationType: "quaternion",
    axis,
    keys,
  };
}

const slowFlapDuration = 0.8;
const slowValues = [0, 0.5, -0.35, 0];

const fastDuration = 0.35;
const fastValues = [0, 0.9, -0.9, 0.8, -0.6, 0];

const takeoffDuration = 1.2;
const takeoffValues = [0, -1.2, 0.8, -0.6, 0];

const glideDuration = 2.5;
const glideValues = [0, 0.08, -0.08, 0];

const hoverDuration = 0.45;
const hoverValues = [0, 0.55, -0.55, 0.35, -0.35, 0];

export const wingFlapPresets: WingFlapPreset[] = [
  {
    name: "slow_flap",
    duration: slowFlapDuration,
    loop: true,
    mirrorRight: true,
    tracks: [
      makeTrack("L_Wing_01_Shoulder", slowFlapDuration, slowValues),
      makeTrack("L_Wing_02_Mid", slowFlapDuration, slowValues, "z", 0.05, 0.6),
      makeTrack("L_Wing_03_Tip", slowFlapDuration, slowValues, "z", 0.1, 0.4),
      makeTrack("R_Wing_01_Shoulder", slowFlapDuration, slowValues),
      makeTrack("R_Wing_02_Mid", slowFlapDuration, slowValues, "z", 0.05, 0.6),
      makeTrack("R_Wing_03_Tip", slowFlapDuration, slowValues, "z", 0.1, 0.4),
    ],
  },
  {
    name: "fast_flap",
    duration: fastDuration,
    loop: true,
    mirrorRight: true,
    tracks: [
      makeTrack("L_Wing_01_Shoulder", fastDuration, fastValues),
      makeTrack("L_Wing_02_Mid", fastDuration, fastValues, "z", 0.03, 0.7),
      makeTrack("L_Wing_03_Tip", fastDuration, fastValues, "z", 0.05, 0.45),
      makeTrack("R_Wing_01_Shoulder", fastDuration, fastValues),
      makeTrack("R_Wing_02_Mid", fastDuration, fastValues, "z", 0.03, 0.7),
      makeTrack("R_Wing_03_Tip", fastDuration, fastValues, "z", 0.05, 0.45),
    ],
  },
  {
    name: "takeoff_flap",
    duration: takeoffDuration,
    loop: false,
    mirrorRight: true,
    tracks: [
      makeTrack("L_Wing_01_Shoulder", takeoffDuration, takeoffValues),
      makeTrack("L_Wing_02_Mid", takeoffDuration, takeoffValues, "z", 0.08, 0.7),
      makeTrack("L_Wing_03_Tip", takeoffDuration, takeoffValues, "z", 0.12, 0.45),
      makeTrack("R_Wing_01_Shoulder", takeoffDuration, takeoffValues),
      makeTrack("R_Wing_02_Mid", takeoffDuration, takeoffValues, "z", 0.08, 0.7),
      makeTrack("R_Wing_03_Tip", takeoffDuration, takeoffValues, "z", 0.12, 0.45),
    ],
  },
  {
    name: "glide_idle",
    duration: glideDuration,
    loop: true,
    mirrorRight: true,
    tracks: [
      makeTrack("L_Wing_01_Shoulder", glideDuration, glideValues),
      makeTrack("L_Wing_02_Mid", glideDuration, glideValues, "z", 0.06, 0.6),
      makeTrack("L_Wing_03_Tip", glideDuration, glideValues, "z", 0.12, 0.4),
      makeTrack("R_Wing_01_Shoulder", glideDuration, glideValues),
      makeTrack("R_Wing_02_Mid", glideDuration, glideValues, "z", 0.06, 0.6),
      makeTrack("R_Wing_03_Tip", glideDuration, glideValues, "z", 0.12, 0.4),
    ],
  },
  {
    name: "hover_flap",
    duration: hoverDuration,
    loop: true,
    mirrorRight: true,
    tracks: [
      makeTrack("L_Wing_01_Shoulder", hoverDuration, hoverValues),
      makeTrack("L_Wing_02_Mid", hoverDuration, hoverValues, "z", 0.02, 0.6),
      makeTrack("L_Wing_03_Tip", hoverDuration, hoverValues, "z", 0.03, 0.35),
      makeTrack("R_Wing_01_Shoulder", hoverDuration, hoverValues),
      makeTrack("R_Wing_02_Mid", hoverDuration, hoverValues, "z", 0.02, 0.6),
      makeTrack("R_Wing_03_Tip", hoverDuration, hoverValues, "z", 0.03, 0.35),
    ],
  },
];
