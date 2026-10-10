// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import Fixture from './LocationMarqueeFixture.svelte';
let app:ReturnType<typeof mount>|undefined;
function start(reduced=false){
 vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 app=mount(Fixture,{target:document.body});flushSync();
}
function choose(name:string){[...document.querySelectorAll('button')].find(b=>b.textContent===name)!.click();flushSync();}
const names=()=>[...document.querySelectorAll('.edge')].map(e=>e.textContent);
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
it('keeps both old labels during exit and replaces them only when offscreen',async()=>{
 start();choose('草原');
 expect(names().every(t=>t?.includes('白色王城'))).toBe(true);
 expect(document.querySelector('.location-marquee')?.classList.contains('leaving')).toBe(true);
 await vi.advanceTimersByTimeAsync(449);flushSync();expect(names().every(t=>t?.includes('白色王城'))).toBe(true);
 await vi.advanceTimersByTimeAsync(1);flushSync();expect(names().every(t=>t?.includes('草原'))).toBe(true);
 expect(document.querySelector('.location-marquee')?.classList.contains('leaving')).toBe(false);
});
it('uses the latest destination on quick boundary changes and cancels pending work on unmount',async()=>{
 start();choose('草原');await vi.advanceTimersByTimeAsync(90);choose('潮音海岸');
 await vi.advanceTimersByTimeAsync(450);flushSync();expect(names().every(t=>t?.includes('潮音海岸'))).toBe(true);
 choose('草原');await unmount(app!);app=undefined;expect(vi.getTimerCount()).toBe(0);
});
it('cancels departure when returning to the displayed location',async()=>{
 start();choose('草原');choose('白色王城');await vi.advanceTimersByTimeAsync(300);flushSync();
 expect(names().every(t=>t?.includes('白色王城'))).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('changes immediately when reduced motion is requested',()=>{
 start(true);choose('草原');expect(names().every(t=>t?.includes('草原'))).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
