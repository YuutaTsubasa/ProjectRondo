// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import PalaceSession from '../../src/app/PalaceSession.svelte';
import {createPalaceRun} from '../../src/domain/palace/palaceRun';
const stub=vi.hoisted(()=>({build:vi.fn(),disposeEngine:vi.fn(),frame:(()=>{}) as ()=>void}));
vi.mock('../../src/presentation/palace/palaceScene',()=>({createPalaceScene:stub.build}));
vi.mock('@babylonjs/core/Engines/engine',()=>({Engine:class{
 runRenderLoop(fn:()=>void){stub.frame=fn;} resize(){} getDeltaTime(){return 20;} dispose(){stub.disposeEngine();}
}}));
let app:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.clearAllMocks();vi.restoreAllMocks();});
function level(){
 let state=createPalaceRun();
 return {get state(){return state;},scene:{resetLastAnimationTimeFrame:vi.fn()},advance:vi.fn(()=>state),reset:vi.fn(()=>state=createPalaceRun()),suspendInput:vi.fn(),dispose:vi.fn(),finish(){state={...state,finished:true};}};
}
it('resumes on initial readiness, freezes pause, shows results and resets for replay',async()=>{
 const palace=level();stub.build.mockResolvedValue(palace);
 app=mount(PalaceSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn()}});await settle();
 expect(palace.suspendInput).toHaveBeenLastCalledWith(false);
 stub.frame();expect(palace.advance).toHaveBeenCalledTimes(1);
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await settle();stub.frame();
 expect(palace.advance).toHaveBeenCalledTimes(1);expect(palace.suspendInput).toHaveBeenLastCalledWith(true);
 expect(document.activeElement?.textContent).toContain('繼續遊戲');
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await settle();
 expect(palace.suspendInput).toHaveBeenLastCalledWith(false);
 palace.finish();stub.frame();await settle();expect(document.body.textContent).toContain('STAGE CLEAR');
 const calls=palace.advance.mock.calls.length;stub.frame();expect(palace.advance).toHaveBeenCalledTimes(calls);
 [...document.querySelectorAll('button')].find(b=>b.textContent?.includes('再玩一次'))!.click();await settle();
 expect(palace.reset).toHaveBeenCalledTimes(1);expect(document.body.textContent).not.toContain('STAGE CLEAR');
 expect(document.body.textContent).toContain('00:00');
});
it('disposes late scene before engine when unmounted during loading',async()=>{
 const palace=level();let resolve!:(s:unknown)=>void;const ready=vi.fn();
 stub.build.mockReturnValue(new Promise(r=>resolve=r));
 app=mount(PalaceSession,{target:document.body,props:{onReady:ready,onFailure:vi.fn()}});await settle();
 await unmount(app);app=undefined;expect(stub.disposeEngine).not.toHaveBeenCalled();
 resolve(palace);await settle();
 expect(palace.dispose).toHaveBeenCalledTimes(1);expect(stub.disposeEngine).toHaveBeenCalledTimes(1);expect(ready).not.toHaveBeenCalled();
});
it('suspends on hidden page and keeps keyboard focus inside the pause menu',async()=>{
 const palace=level();stub.build.mockResolvedValue(palace);
 app=mount(PalaceSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn()}});await settle();
 vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await settle();
 expect(palace.suspendInput).toHaveBeenLastCalledWith(true);stub.frame();expect(palace.advance).not.toHaveBeenCalled();
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true}));await settle();
 expect(document.activeElement?.textContent).toContain('返回主選單');
});
