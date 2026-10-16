
const sources = new Set<symbol>();
const listeners = new Set<() => void>();

let captureLevel = 0;

export function setCaptureActive(source: symbol, active: boolean) {
  const wasActive = sources.size > 0;

  if (active) sources.add(source);
  else sources.delete(source);

  if (sources.size === 0) captureLevel = 0;

  if (wasActive !== (sources.size > 0)) {
    listeners.forEach((notify) => notify());
  }
}

export function setCaptureLevel(value: number) {
  if (sources.size === 0) return;

  captureLevel = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

export function getCaptureLevel() {
  return captureLevel;
}

export const getCaptureActive = () => sources.size > 0;
export const getServerCaptureActive = () => false;

export function subscribeCapture(notify: () => void) {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}
