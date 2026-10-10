import { waitForSceneReadiness, type ReadyScene } from '../presentation/babylon/sceneReadiness';

export const REGION_READY_TIMEOUT_MS = 30_000;

/** Bound the region's ready wait and let unmount return the built level to levelSwap, which
 * already owns scene-before-engine disposal. */
export function waitForRegionReadiness(
  scene: ReadyScene,
  signal: AbortSignal,
  timeoutMs = REGION_READY_TIMEOUT_MS,
): Promise<'ready' | 'aborted'> {
  return waitForSceneReadiness(scene, signal, 'Region backdrop was not ready before the loading timeout.', timeoutMs);
}
