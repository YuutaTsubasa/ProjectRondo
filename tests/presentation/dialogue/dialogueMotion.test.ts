// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {flushSync} from 'svelte';
import {renderOverlay,q,resetOverlay} from './overlayHarness';
afterEach(()=>{resetOverlay();vi.useRealTimers();vi.restoreAllMocks();});
it('holds the last line and completes once after its exit, even with repeated SKIP',()=>{
 vi.useFakeTimers();const done=vi.fn();renderOverlay(':: a\n悠太翼: 海風。\n-> END',done);
 const skip=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('SKIP'))!;
 skip.click();flushSync();skip.click();flushSync();
 expect(q('.overlay.leaving')).not.toBeNull();expect(document.body.textContent).toContain('海風。');expect(done).not.toHaveBeenCalled();
 vi.advanceTimersByTime(359);expect(done).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(done).toHaveBeenCalledTimes(1);
});
it('does not fire an old dialogue completion after its owner is removed',()=>{
 vi.useFakeTimers();const done=vi.fn();renderOverlay(':: a\n悠太翼: 海風。\n-> END',done);
 [...document.querySelectorAll('button')].find(b=>b.textContent?.includes('SKIP'))!.click();flushSync();resetOverlay();vi.advanceTimersByTime(1000);expect(done).not.toHaveBeenCalled();
});
