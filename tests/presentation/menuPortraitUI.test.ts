// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {flushSync,mount,unmount} from 'svelte';
import MenuPortrait from '../../src/presentation/menu/MenuPortrait.svelte';
const stub=vi.hoisted(()=>({mount:vi.fn()}));
vi.mock('../../src/presentation/menu/menuPortraitRuntime',()=>({mountMenuPortrait:stub.mount}));
let component:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(resolve=>setTimeout(resolve,0));flushSync();};
afterEach(async()=>{if(component)await unmount(component);component=undefined;document.body.innerHTML='';vi.unstubAllGlobals();vi.restoreAllMocks();});
function support(){
 vi.stubGlobal('WebGLRenderingContext',class{});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
}
function renderer(ready=Promise.resolve()){
 return {ready,resize:vi.fn(),start:vi.fn(),stop:vi.fn(),dispose:vi.fn(),setPresentation:vi.fn()};
}
it('shows the canvas when ready, pauses while hidden and disposes on removal',async()=>{
 support();const view=renderer();stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body,props:{active:true,pose:'loading'}});await settle();
 expect(view.setPresentation).toHaveBeenLastCalledWith('loading',true,false);
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true');
 vi.spyOn(document,'hidden','get').mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));await settle();
 expect(view.setPresentation).toHaveBeenLastCalledWith('loading',false,false);expect(view.stop).toHaveBeenCalled();
 await unmount(component);component=undefined;expect(view.dispose).toHaveBeenCalledOnce();
});
it('does not reveal or restart a pending portrait after removal',async()=>{
 support();let resolve!:()=>void;const view=renderer(new Promise<void>(done=>resolve=done));stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body});await settle();
 await unmount(component);component=undefined;view.start.mockClear();view.resize.mockClear();
 resolve();await settle();expect(view.dispose).toHaveBeenCalledOnce();expect(view.start).not.toHaveBeenCalled();expect(view.resize).not.toHaveBeenCalled();
});
it('keeps the background after a model failure without inserting a 2D character or leaving a renderer alive',async()=>{
 support();vi.spyOn(console,'warn').mockImplementation(()=>{});
 let reject!:(error:Error)=>void;const view=renderer(new Promise<void>((_,fail)=>reject=fail));stub.mount.mockReturnValue(view);
 component=mount(MenuPortrait,{target:document.body});await settle();reject(new Error('offline'));await settle();
 expect(document.querySelector('img')).toBeNull();
 expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('false');expect(view.dispose).toHaveBeenCalled();
});

it('never swaps to the old 2D character while the menu remounts and loads its model',async()=>{
 support();
 for(let visit=0;visit<2;visit++){
  let resolve!:()=>void;
  const view=renderer(new Promise<void>(done=>resolve=done));stub.mount.mockReturnValue(view);
  component=mount(MenuPortrait,{target:document.body});await settle();
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('false');
  resolve();await settle();
  expect(document.querySelector('canvas')?.getAttribute('data-ready')).toBe('true');
  expect(document.querySelector('img')).toBeNull();
  await unmount(component);component=undefined;
  expect(view.dispose).toHaveBeenCalledOnce();
 }
});
