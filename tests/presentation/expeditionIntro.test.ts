// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {navigateUi} from '../../src/presentation/input/uiNavigation';
import ExpeditionIntro from '../../src/presentation/region/ExpeditionIntro.svelte';
import {PALACE_LAYOUT} from '../../src/domain/palace/palaceLayout';
let app:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
const button=(name:string)=>document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
beforeEach(()=>vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
async function render(expedition:'course'|'palace'='course',completed=false){const start=vi.fn(),close=vi.fn(),map=vi.fn();app=mount(ExpeditionIntro,{target:document.body,props:{expedition,completed,onStart:start,onClose:close,onMap:map}});await settle();return {start,close,map};}
it('uses actual stage data and completion state without fictional rewards',async()=>{
 await render('palace',true);expect(document.querySelector('h1')?.textContent).toBe('白宮引水道');
 const info=document.querySelector('[aria-label="關卡情報"]')!;expect(info.textContent).toContain(`${PALACE_LAYOUT.coins.length}枚`);
 expect(document.body.textContent).toContain('已完成 · 可再次挑戰');expect(document.body.textContent).not.toContain('可能獲得');
 expect(document.querySelector('img')?.getAttribute('src')).toBe('/stages/palace-aqueduct.webp');
});
it('opens settings and returns focus to the introduction without starting',async()=>{
 const {start,close}=await render();button('系統設定').click();await settle();expect(document.querySelector('.settings-screen')).not.toBeNull();
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();
 expect(document.querySelector('.expedition-intro')?.hasAttribute('inert')).toBe(false);expect(document.activeElement).toBe(button('系統設定'));expect(start).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
});
it('locks repeated activation until its start transition completes',async()=>{
 const {start,close}=await render();vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();button('開始遠征').click();button('開始遠征').click();button('稍後再來').click();flushSync();
 expect(start).not.toHaveBeenCalled();vi.advanceTimersByTime(280);expect(start).toHaveBeenCalledTimes(1);expect(close).not.toHaveBeenCalled();
});
it('supports map selection through the same modal controls',async()=>{const {map,start}=await render();button('查看關卡地圖').click();expect(map).toHaveBeenCalledTimes(1);expect(start).not.toHaveBeenCalled();});

it.each(['course','palace'] as const)('defaults %s to starting the expedition, not the map',async expedition=>{
 const {start,map}=await render(expedition);
 expect(document.activeElement).toBe(button('開始遠征'));
 navigateUi('confirm');
 expect(start).toHaveBeenCalledTimes(1);expect(map).not.toHaveBeenCalled();
});
