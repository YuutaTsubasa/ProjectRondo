import {afterEach,expect,it,vi} from 'vitest';
import {waitForAudioReadiness} from '../../src/presentation/audio/audioReadiness';
afterEach(()=>vi.useRealTimers());
it('waits for decoding rather than just a completed scene',async()=>{
 let done!:()=>void;const ready=vi.fn();
 const pending=waitForAudioReadiness(()=>new Promise<void>(r=>done=r)).then(ready);
 await Promise.resolve();expect(ready).not.toHaveBeenCalled();done();await pending;expect(ready).toHaveBeenCalledOnce();
});
it('reports preparation failure without swallowing it',async()=>{
 await expect(waitForAudioReadiness(async()=>{throw new Error('HTTP 500');})).rejects.toThrow('HTTP 500');
});
it('times out a hung download and clears the timer',async()=>{
 vi.useFakeTimers();const waiting=waitForAudioReadiness(()=>new Promise(()=>{}),1000);
 const failure=expect(waiting).rejects.toThrow('音樂載入逾時');
 await vi.advanceTimersByTimeAsync(1000);await failure;expect(vi.getTimerCount()).toBe(0);
});
