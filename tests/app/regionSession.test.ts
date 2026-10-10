// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import RegionSession from '../../src/app/RegionSession.svelte';
import {regionHeight} from '../../src/domain/region/regionLayout';
import {REGION_SAVE_KEY} from '../../src/app/regionSave';
vi.mock('../../src/app/RegionWorld.svelte',async()=>({default:(await import('./RegionWorldFixture.svelte')).default}));
vi.mock('../../src/app/CourseSession.svelte',async()=>({default:(await import('./RegionExpeditionFixture.svelte')).default}));
vi.mock('../../src/app/PalaceSession.svelte',async()=>({default:(await import('./RegionExpeditionFixture.svelte')).default}));
beforeEach(()=>{vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));});
let app:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
const button=(name:string)=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name||b.textContent?.trim()===name)!;
const key=(value:string)=>window.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
const skip=async()=>{button('SKIP').click();await settle();};
const start=async()=>{app=mount(RegionSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn(),onExit:vi.fn()}});await settle();};
const move=async(id:string)=>{button('fixture '+id).click();await settle();};
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';document.documentElement.removeAttribute('data-defer-region-ready');localStorage.clear();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('plays a real chapter through both expedition finishes and a homecoming choice',async()=>{
 await start();expect(document.querySelector('.chapter .titles p')?.textContent).toContain('潮聲未到的午後');expect(document.querySelector('.overlay time')).not.toBeNull();expect(document.activeElement).toBe(button('advance dialogue'));expect(document.body.textContent).toContain('悠太翼');await skip();
 expect(document.querySelector('[data-world-paused=false]')).not.toBeNull();
 key('e');await settle();expect(button('SKIP')).toBeUndefined();
 await move('signal');key('e');await settle();expect(document.querySelector('.chapter .titles p')?.textContent).toContain('草原上的閉閘聲');await skip();
 await move('course');key('e');await settle();button('開始遠征').click();await settle();
 expect(document.querySelector('[data-expedition]')).not.toBeNull();button('fixture clear').click();await settle();
 expect(document.querySelector('[data-expedition]')).not.toBeNull();
 expect(JSON.parse(localStorage.getItem(REGION_SAVE_KEY)!).progress.chapter).toBe('relay-report');
 button('返回白塔廣場').click();await settle();expect(document.activeElement).toBe(button('advance dialogue'));await skip();
 await move('palace');key('e');await settle();button('開始遠征').click();await settle();button('fixture clear').click();await settle();button('返回白潮原野').click();await settle();await skip();
 await move('homecoming');key('e');await settle();await skip();
 [...document.querySelectorAll('button')].find(b=>b.textContent?.includes('就寫路過的人吧。'))!.click();await settle();await skip();
 expect(JSON.parse(localStorage.getItem(REGION_SAVE_KEY)!).progress.chapter).toBe('complete');
});
it('does not complete abandoned expeditions and suspends interactions behind map',async()=>{
 await start();await skip();button('開啟區域地圖').click();await settle();expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();key('e');await settle();expect(document.querySelector('[data-expedition]')).toBeNull();button('關閉區域地圖').click();await settle();
 await move('signal');key('e');await settle();await skip();await move('course');key('e');await settle();button('開始遠征').click();await settle();button('返回白塔廣場').click();await settle();
 expect(JSON.parse(localStorage.getItem(REGION_SAVE_KEY)!).progress.chapter).toBe('relay');expect(button('SKIP')).toBeUndefined();
});
it('recovers an expedition loading failure back to the region',async()=>{
 await start();await skip();await move('signal');key('e');await settle();await skip();await move('course');key('e');await settle();button('開始遠征').click();await settle();button('fixture expedition fail').click();await settle();
 expect(document.body.textContent).toContain('暫時無法抵達');button('返回原野').click();await settle();expect(document.querySelector('[data-world-paused=false]')).not.toBeNull();
});

it('saves the last safe ground position when leaving in midair',async()=>{
 await start();await skip();await move('signal');button('fixture airborne').click();await settle();
 window.dispatchEvent(new Event('pagehide'));await settle();
 const saved=JSON.parse(localStorage.getItem(REGION_SAVE_KEY)!);
 expect(saved.position.x).toBe(0);expect(saved.position.z).toBe(-118);
});

it('uses fresh progress only for NEW GAME while LOAD GAME resumes the existing chapter',async()=>{
 const saved=JSON.stringify({version:1,progress:{version:1,chapter:'relay',discoveries:[],completedExpeditions:[]},position:{x:0,y:1.3,z:-118}});
 localStorage.setItem(REGION_SAVE_KEY,saved);await start();expect(button('SKIP')).toBeUndefined();
 await unmount(app!);app=undefined;document.body.innerHTML='';
 app=mount(RegionSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn(),freshStart:true}});await settle();
 expect(button('SKIP')).toBeTruthy();expect(document.body.textContent).toContain('悠太翼');
});

it('keeps world input suspended throughout the AVG outro and reuses its HUD',async()=>{
 await start();const hud=document.querySelector('.hud');expect(hud?.classList.contains('subdued')).toBe(true);
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));vi.useFakeTimers();
 button('SKIP').click();flushSync();
 expect(document.querySelector('.overlay.leaving')).not.toBeNull();expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();
 key('e');key('Escape');vi.advanceTimersByTime(359);flushSync();expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();
 vi.advanceTimersByTime(1);flushSync();expect(document.querySelector('.overlay')).toBeNull();expect(document.querySelector('[data-world-paused=false]')).not.toBeNull();
 expect(document.querySelector('.hud')).toBe(hud);expect(hud?.classList.contains('subdued')).toBe(false);vi.useRealTimers();
});

it('uses the designed loading page after results until the returning world is ready',async()=>{
 await start();await skip();await move('signal');key('e');await settle();await skip();await move('course');key('e');await settle();button('開始遠征').click();await settle();button('fixture clear').click();await settle();
 document.documentElement.setAttribute('data-defer-region-ready','');
 button('返回白塔廣場').click();await settle();
 expect(document.querySelector('[aria-label="載入畫面"] .artwork.loading')).not.toBeNull();
 expect(document.querySelector('.loading-composition [role="progressbar"]')).not.toBeNull();
 expect(document.querySelector('.loading-composition [role="status"]')?.textContent).toContain('返回白潮原野');
 expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();
 key('e');key('Escape');await settle();expect(document.querySelector('[aria-label="載入畫面"]')).not.toBeNull();
 button('fixture world ready').click();await settle();
 expect(document.querySelector('[aria-label="載入畫面"]')).toBeNull();expect(button('advance dialogue')).toBe(document.activeElement);
});

it.each(['relay','relay-report'])('relocates a legacy %s save at the old course entrance to the city',async(chapter)=>{
 localStorage.setItem(REGION_SAVE_KEY,JSON.stringify({version:1,progress:{version:1,chapter,discoveries:[],completedExpeditions:chapter==='relay-report'?['course']:[]},position:{x:-64,y:regionHeight(-64,-170)+1.3,z:-170}}));
 await start();expect(JSON.parse(document.querySelector('[data-spawn]')!.getAttribute('data-spawn')!)).toEqual({x:-20,y:1.3,z:40});
 if(chapter==='relay-report')await skip();
 expect(button('查看入口 · 白宮天廊')).toBeTruthy();
});
it('preserves a later free-roam save near the former course entrance',async()=>{
 localStorage.setItem(REGION_SAVE_KEY,JSON.stringify({version:1,progress:{version:1,chapter:'complete',discoveries:[],completedExpeditions:['course','palace']},position:{x:-64,y:regionHeight(-64,-170)+1.3,z:-170}}));
 await start();expect(JSON.parse(document.querySelector('[data-spawn]')!.getAttribute('data-spawn')!).z).toBe(-170);
});
it('returns safely in front of the city portal when abandoning or completing the course',async()=>{
 await start();await skip();await move('course');key('e');await settle();expect(document.querySelector('[data-expedition]')).toBeNull();
 await move('signal');key('e');await settle();await skip();
 for(const finish of [false,true]){
  await move('course');key('e');await settle();expect(document.querySelector('#region-dialog-title')!.textContent).toBe('白宮天廊');
  button('開始遠征').click();await settle();if(finish){button('fixture clear').click();await settle();}
  button('返回白塔廣場').click();await settle();
  expect(JSON.parse(document.querySelector('[data-spawn]')!.getAttribute('data-spawn')!)).toEqual({x:-20,y:1.3,z:40});
  expect(JSON.parse(localStorage.getItem(REGION_SAVE_KEY)!).position).toEqual({x:-20,y:1.3,z:40});
 }
});

it('keeps the region paused through the mission introduction exit animation',async()=>{
 await start();await skip();await move('signal');key('e');await settle();await skip();await move('course');key('e');await settle();
 expect(document.querySelector('[aria-label="關卡介紹"]')).not.toBeNull();
 expect(document.body.textContent).toContain('騎士守衛');
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));vi.useFakeTimers();
 key('Escape');flushSync();
 expect(document.querySelector('.expedition-intro.leaving')).not.toBeNull();
 expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();
 vi.advanceTimersByTime(279);flushSync();expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();
 vi.advanceTimersByTime(1);flushSync();expect(document.querySelector('[data-world-paused=false]')).not.toBeNull();vi.useRealTimers();
});

it('returns from a mission map to the same introduction and keeps the world paused',async()=>{
 await start();await skip();await move('signal');key('e');await settle();await skip();await move('course');key('e');await settle();
 button('查看關卡地圖').click();await settle();expect(document.querySelector('.map-screen')).not.toBeNull();
 button('關閉區域地圖').click();await settle();expect(document.querySelector('[aria-label="關卡介紹"]')).not.toBeNull();expect(document.querySelector('[data-world-paused=true]')).not.toBeNull();
 expect(document.querySelector('[aria-label="最佳紀錄"]')?.textContent).toBe('—');expect(document.querySelector('[aria-label="建議時間"]')?.textContent).toBe('00:45.00');
 button('稍後再來').click();await settle();expect(document.querySelector('[data-world-paused=false]')).not.toBeNull();
});
