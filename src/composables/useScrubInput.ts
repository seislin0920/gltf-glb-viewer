import { onBeforeUnmount } from "vue";

export interface ScrubInputOptions {
  step: number;
  sensitivity?: number;
  getValue: () => number;
  onUpdate: (value: number) => void;
}

const DRAG_THRESHOLD = 3;

function roundToStep(value: number, step: number) {
  const decimals = step.toString().includes(".")
    ? step.toString().split(".")[1]?.length ?? 0
    : 0;
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

export function useScrubInput() {
  let scrubState: {
    startX: number;
    startValue: number;
    active: boolean;
    options: ScrubInputOptions;
    pointerId: number;
  } | null = null;

  function clearScrubListeners() {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", endScrub);
    window.removeEventListener("pointercancel", endScrub);
  }

  function resetScrubStyles() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function handlePointerMove(event: PointerEvent) {
    if (!scrubState || scrubState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - scrubState.startX;

    if (!scrubState.active) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD) {
        return;
      }

      scrubState.active = true;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    event.preventDefault();

    const sensitivity = scrubState.options.sensitivity ?? 4;
    const delta = (deltaX / sensitivity) * scrubState.options.step;
    const nextValue = roundToStep(
      scrubState.startValue + delta,
      scrubState.options.step,
    );

    scrubState.options.onUpdate(nextValue);
  }

  function endScrub(event: PointerEvent) {
    if (!scrubState || scrubState.pointerId !== event.pointerId) {
      return;
    }

    const wasScrubbing = scrubState.active;
    const target = event.target as HTMLInputElement | null;

    scrubState = null;
    clearScrubListeners();
    resetScrubStyles();

    if (wasScrubbing) {
      event.preventDefault();
      target?.blur();
    }
  }

  function onScrubPointerDown(
    event: PointerEvent,
    options: ScrubInputOptions,
  ) {
    if (event.button !== 0) {
      return;
    }

    if (scrubState) {
      clearScrubListeners();
      resetScrubStyles();
      scrubState = null;
    }

    scrubState = {
      startX: event.clientX,
      startValue: options.getValue(),
      active: false,
      options,
      pointerId: event.pointerId,
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endScrub);
    window.addEventListener("pointercancel", endScrub);
  }

  onBeforeUnmount(() => {
    clearScrubListeners();
    resetScrubStyles();
    scrubState = null;
  });

  return { onScrubPointerDown };
}
