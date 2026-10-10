import {expect,it,vi} from 'vitest';
import {waitForSceneReadiness} from '../../src/presentation/babylon/sceneReadiness';
it('reports its own timeout message, and resolves when aborted while Babylon never settles',async()=>{
 vi.useFakeTimers();
 try{
  const never={whenReadyAsync:()=>new Promise<void>(()=>{})};
  const timedOut=waitForSceneReadiness(never,new AbortController().signal,'portrait not ready',50);
  const check=expect(timedOut).rejects.toThrow('portrait not ready');
  await vi.advanceTimersByTimeAsync(50);await check;
  const stop=new AbortController(),aborted=waitForSceneReadiness(never,stop.signal,'unused',50);
  stop.abort();await expect(aborted).resolves.toBe('aborted');
 }finally{vi.useRealTimers();}
});
