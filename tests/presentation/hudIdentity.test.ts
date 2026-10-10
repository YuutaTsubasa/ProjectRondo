// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import HudIdentity from '../../src/presentation/hud/HudIdentity.svelte';
it('shows local time across midnight and releases its timer on unmount',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,9,23,59,50));
 const app=mount(HudIdentity,{target:document.body});
 try{flushSync();expect(document.querySelector('time')?.textContent).toBe('23:59:50');
 expect(document.querySelector('.date')?.textContent).toBe('2026.10.09');
 expect(document.querySelector('img')?.alt).toBe('PROJECT RONDO');
 await vi.advanceTimersByTimeAsync(1000);flushSync();expect(document.querySelector('time')?.textContent).toBe('23:59:51');
 await vi.advanceTimersByTimeAsync(9000);flushSync();expect(document.querySelector('time')?.textContent).toBe('00:00:00');expect(document.querySelector('.date')?.textContent).toBe('2026.10.10');
 }finally{await unmount(app);expect(vi.getTimerCount()).toBe(0);vi.useRealTimers();document.body.innerHTML='';}
});
