export const REGION_READY_TIMEOUT_MS = 30_000;

interface ReadyScene { whenReadyAsync(checkRenderTargets?: boolean): Promise<unknown> }

/** Babylon's ready promise never rejects on its own timeout. Bound that wait and let unmount
 * return the built level to levelSwap, which already owns scene-before-engine disposal. */
export function waitForRegionReadiness(
  scene: ReadyScene,
  signal: AbortSignal,
  timeoutMs = REGION_READY_TIMEOUT_MS,
): Promise<'ready' | 'aborted'> {
  if (signal.aborted) return Promise.resolve('aborted');
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: 'ready' | 'aborted' | 'failed', error?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (result === 'failed') reject(error);
      else resolve(result);
    };
    const abort = () => finish('aborted');
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish('failed', new Error('Region backdrop was not ready before the loading timeout.')), timeoutMs);
    try {
      void scene.whenReadyAsync(true).then(() => finish('ready'), error => finish('failed', error));
    } catch (error) { finish('failed', error); }
  });
}
