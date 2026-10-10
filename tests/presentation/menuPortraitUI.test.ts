// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import MenuPortrait from '../../src/presentation/menu/MenuPortrait.svelte';
import {disposeMenuPortrait,retainMenuPortrait,PORTRAIT_IDLE_RELEASE_MS} from '../../src/presentation/menu/sharedMenuPortrait';
const stub=vi.hoisted(()=>({mount:vi.fn()}));
vi.mock('../../src/presentation/menu/menuPortraitRuntime',()=>({mountMenuPortrait:stub.mount}));
let component:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(resolve=>setTimeout(resolve,0));flushSync();};
// Under fake timers: drain promises and zero-delay timers without moving the idle clock.
const fsettle=async()=>{flushSync();await vi.advanceTimersByTimeAsync(0);flushSync();};
afterEach(async()=>{vi.useRealTimers();if(component)await unmount(component);component=undefined;disposeMenuPortrait();await new Promise(resolve=>setTimeout(resolve,0));stub.mount.mockReset();document.body.innerHTML='';vi.unstubAllGlobals();vi.restoreAllMocks();});
function support(){
 vi.stubGlobal('WebGLRenderingContext',class{});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
}
function renderer(ready=Promise.resolve()){
 return {ready,resize:vi.fn(),start:vi.fn(),stop:vi.fn(),dispose:vi.fn(),setPresentation:vi.fn(),snapToPose:vi.fn(),prime:vi.fn()};
}
it('shows the canvas when ready, pauses while hidden and keeps the shared renderer on removal',async()=>{
 support();const view=renderer();stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body,props:{active:true,pose:'loading'}});await settle();
 expect(view.setPresentation).toHaveBeenLastCalledWith('loading',true,false);
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true');
 vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await settle();
 expect(view.setPresentation).toHaveBeenLastCalledWith('loading',false,false);expect(view.stop).toHaveBeenCalled();
 view.stop.mockClear();await unmount(component);component=undefined;await settle();
 expect(view.stop).toHaveBeenCalled();expect(view.dispose).not.toHaveBeenCalled();expect(document.querySelector('canvas')).toBeNull();
});
it('does not reveal or restart a pending portrait after removal',async()=>{
 support();let resolve!:()=>void;const view=renderer(new Promise<void>(done=>resolve=done));stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body});await settle();
 await unmount(component);component=undefined;view.start.mockClear();view.resize.mockClear();
 resolve();await settle();expect(view.dispose).not.toHaveBeenCalled();expect(view.start).not.toHaveBeenCalled();expect(view.resize).not.toHaveBeenCalled();
});
it('keeps the background after a model failure without inserting a 2D character or leaving a renderer alive',async()=>{
 support();vi.spyOn(console,'warn').mockImplementation(()=>{});
 let reject!:(error:Error)=>void;const view=renderer(new Promise<void>((_,fail)=>reject=fail));stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body});await settle();reject(new Error('offline'));await settle();
 expect(document.querySelector('img')).toBeNull();
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('false');expect(view.dispose).toHaveBeenCalled();
});

it('reuses one loaded renderer across menu and results screens instead of building another engine',async()=>{
 support();
 let resolve!:()=>void;
 const view=renderer(new Promise<void>(done=>resolve=done));stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body});await settle();
 expect(document.querySelector('img')).toBeNull();
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('false');
 resolve();await settle();
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true');
 await unmount(component);component=undefined;await settle();
 // The second screen gets the same canvas, already loaded: no second engine, no 2D fallback.
 component=mount(MenuPortrait,{target:document.body,props:{pose:'loading'}});await settle();
 expect(stub.mount).toHaveBeenCalledOnce();
 expect(document.querySelector('img')).toBeNull();
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true');
 expect(view.setPresentation).toHaveBeenLastCalledWith('loading',true,false);
 expect(view.dispose).not.toHaveBeenCalled();
});

it('frees an unused portrait after the idle delay, and a re-acquire cancels it',async()=>{
 support();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const view=renderer();stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body});await fsettle();
 await unmount(component);component=undefined;
 await vi.advanceTimersByTimeAsync(PORTRAIT_IDLE_RELEASE_MS-1);
 component=mount(MenuPortrait,{target:document.body});await fsettle();
 await vi.advanceTimersByTimeAsync(PORTRAIT_IDLE_RELEASE_MS);await fsettle();
 expect(view.dispose).not.toHaveBeenCalled();
 await unmount(component);component=undefined;
 await vi.advanceTimersByTimeAsync(PORTRAIT_IDLE_RELEASE_MS);await fsettle();
 expect(view.dispose).toHaveBeenCalledOnce();
});

it('a warm-up keeps the portrait loaded and lets the results screen show it at once',async()=>{
 support();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const view=renderer();stub.mount.mockReturnValue(view);
 const release=retainMenuPortrait();await fsettle();
 await vi.advanceTimersByTimeAsync(PORTRAIT_IDLE_RELEASE_MS*2);await fsettle();
 expect(view.dispose).not.toHaveBeenCalled();
 component=mount(MenuPortrait,{target:document.body});flushSync();
 // Already loaded: ready before any promise turn, so the canvas never fades in from empty.
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true');
 expect(document.querySelector('.portrait')?.classList.contains('ready')).toBe(true);
 release();await unmount(component);component=undefined;
 await vi.advanceTimersByTimeAsync(PORTRAIT_IDLE_RELEASE_MS);await fsettle();
 expect(view.dispose).toHaveBeenCalledOnce();
});

it('primes a warmed portrait while hidden and snaps a taken-over portrait to the new pose',async()=>{
 support();vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
 const view=renderer();stub.mount.mockReturnValue(view);
 const release=retainMenuPortrait();await fsettle();
 // Shaders compile during the warm-up, not on the results screen's first frame.
 expect(view.prime).toHaveBeenCalledOnce();
 component=mount(MenuPortrait,{target:document.body});await fsettle();
 expect(view.snapToPose).toHaveBeenCalled();
 expect(view.snapToPose.mock.invocationCallOrder[0]).toBeLessThan(view.setPresentation.mock.invocationCallOrder.at(-1)!);
 release();
});
