// @vitest-environment jsdom
import {readStageBest} from '../../src/app/stageRecords';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import PalaceSession from '../../src/app/PalaceSession.svelte';
import {createPalaceRun} from '../../src/domain/palace/palaceRun';
const stub=vi.hoisted(()=>({build:vi.fn(),disposeEngine:vi.fn(),frame:(()=>{}) as ()=>void}));
vi.mock('../../src/presentation/palace/palaceScene',()=>({createPalaceScene:stub.build}));
vi.mock('@babylonjs/core/Engines/engine',()=>({Engine:class{
 runRenderLoop(fn:()=>void){stub.frame=fn;} resize(){} getDeltaTime(){return 20;} dispose(){stub.disposeEngine();}
}}));
beforeEach(()=>{localStorage.clear();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>vi.unstubAllGlobals());
let app:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.clearAllMocks();vi.restoreAllMocks();});
function level(){
 let state=createPalaceRun();
 return {get state(){return state;},scene:{resetLastAnimationTimeFrame:vi.fn()},advance:vi.fn(()=>state),reset:vi.fn(()=>state=createPalaceRun()),suspendInput:vi.fn(),dispose:vi.fn(),finish(){state={...state,elapsed:28.3,finished:true};}};
}
it('reports each completed expedition once and prioritizes its return action',async()=>{
 const palace=level(),onComplete=vi.fn(),onExit=vi.fn();stub.build.mockResolvedValue(palace);
 app=mount(PalaceSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn(),onComplete,onExit,exitLabel:'返回白潮原野'}});await settle();
 palace.finish();stub.frame();await settle();stub.frame();stub.frame();
 expect(readStageBest('palace')).toBe(28.3);
 expect(onComplete).toHaveBeenCalledTimes(1);expect(document.body.textContent).toContain('STAGE CLEAR');
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')];
 expect(buttons[0]?.textContent).toContain('返回白潮原野');expect(document.activeElement).toBe(buttons[0]);
 buttons.find(button=>button.textContent?.includes('重新挑戰'))!.click();await settle();
 expect(onComplete).toHaveBeenCalledTimes(1);stub.frame();
 palace.finish();stub.frame();await settle();expect(onComplete).toHaveBeenCalledTimes(2);
 document.querySelector<HTMLButtonElement>('[role=dialog] button')!.click();
 expect(onExit).toHaveBeenCalledTimes(1);expect(onComplete).toHaveBeenCalledTimes(2);
});
it('does not complete an expedition when paused, restarted or abandoned',async()=>{
 const palace=level(),onComplete=vi.fn(),onExit=vi.fn();stub.build.mockResolvedValue(palace);
 app=mount(PalaceSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn(),onComplete,onExit,exitLabel:'返回白潮原野'}});await settle();
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await settle();
 [...document.querySelectorAll('button')].find(button=>button.textContent?.includes('重新開始'))!.click();await settle();
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await settle();
 const exit=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('返回白潮原野'));
 expect(exit).toBeDefined();exit!.click();
 expect(onExit).toHaveBeenCalledTimes(1);expect(onComplete).not.toHaveBeenCalled();
});
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
 stub.frame(); // Discard stale resume delta.
 palace.finish();stub.frame();await settle();expect(document.body.textContent).toContain('STAGE CLEAR');
 expect(document.querySelector('[role=dialog] button')?.textContent).toContain('重新挑戰');
 expect([...document.querySelectorAll('[role=dialog] button')].at(-1)?.textContent).toContain('返回主選單');
 const calls=palace.advance.mock.calls.length;stub.frame();expect(palace.advance).toHaveBeenCalledTimes(calls);
 [...document.querySelectorAll('button')].find(b=>b.textContent?.includes('重新挑戰'))!.click();await settle();
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

 it.each(['resume','visibility','restart'] as const)('discards the first resumed simulation frame on %s', async action => {
  const scene=level();stub.build.mockResolvedValue(scene);
  app=mount(PalaceSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn()}});await settle();
  stub.frame();
  if(action==='visibility') {
    vi.spyOn(document,'hidden','get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
  } else window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  await settle();
  if(action==='restart') [...document.querySelectorAll('button')].find(b=>b.textContent?.includes('重新開始'))!.click();
  else {
    if(action==='visibility')vi.spyOn(document,'hidden','get').mockReturnValue(false);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  }
  await settle();
  const calls=scene.advance.mock.calls.length;
  stub.frame();expect(scene.advance).toHaveBeenCalledTimes(calls);
  stub.frame();expect(scene.advance).toHaveBeenCalledTimes(calls+1);
 });

it('loads the selected palace course and shows its own counts and title',async()=>{
 const palace=level();stub.build.mockResolvedValue(palace);
 app=mount(PalaceSession,{target:document.body,props:{stageId:'palace-1-2',onReady:vi.fn(),onFailure:vi.fn()}});await settle();
 expect(stub.build.mock.calls[0][1]).toMatchObject({id:'palace-1-2',number:'1-2'});
 expect(document.body.textContent).toContain('1-2');expect(document.body.textContent).toContain('0 / 17');
});
