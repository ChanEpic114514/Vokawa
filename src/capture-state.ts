// Track existing capture sessions without requesting another microphone stream.
const sources = new Set<symbol>();
const listeners = new Set<() => void>();
export function setCaptureActive(source: symbol, active: boolean) {
  const wasActive = sources.size > 0;
  if (active) sources.add(source);
  else sources.delete(source);
  if (wasActive !== (sources.size > 0)) listeners.forEach((notify) => notify());
}
export const getCaptureActive = () => sources.size > 0;
export const getServerCaptureActive = () => false;
export function subscribeCapture(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}
