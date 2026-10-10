export interface ReadyScene { whenReadyAsync(checkRenderTargets?: boolean): Promise<unknown> }

/** Babylon's ready promise never settles once its scene is disposed, and never rejects on its own.
 * Bound that wait: resolve 'aborted' when the caller gives up, reject with `failure` on timeout. */
export function waitForSceneReadiness(
  scene: ReadyScene,
  signal: AbortSignal,
  failure: string,
  timeoutMs: number,
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
    timer = setTimeout(() => finish('failed', new Error(failure)), timeoutMs);
    try {
      void scene.whenReadyAsync(true).then(() => finish('ready'), error => finish('failed', error));
    } catch (error) { finish('failed', error); }
  });
}
