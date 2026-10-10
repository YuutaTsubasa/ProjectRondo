// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import RegionWorld from '../../src/app/RegionWorld.svelte';
const fake=vi.hoisted(()=>({build:vi.fn(),frame:()=>{},dispose:vi.fn(),resize:vi.fn()}));
vi.mock('../../src/presentation/region/regionScene',()=>({createRegionScene:fake.build}));
vi.mock('@babylonjs/core/Engines/engine',()=>({Engine:class{runRenderLoop(fn:()=>void){fake.frame=fn;}getDeltaTime(){return 16;}resize(){fake.resize();}dispose(){fake.dispose();}}}));
let app:ReturnType<typeof mount>|undefined;
const settle=async()=>{flushSync();await new Promise(r=>setTimeout(r,0));flushSync();};
const level=()=>({scene:{whenReadyAsync:vi.fn().mockResolvedValue(undefined),render:vi.fn(),resetLastAnimationTimeFrame:vi.fn()},player:{capsulePosition:()=>({x:0,y:1.3,z:-35})},audio:{play:vi.fn(),setMusicScene:vi.fn()},getLocationLabel:()=> '白色王城',setWaterRestored:vi.fn(),setObjective:vi.fn(),suspendInput:vi.fn(),reset:vi.fn(),dispose:vi.fn()});
afterEach(async()=>{if(app)await unmount(app);app=undefined;document.body.innerHTML='';vi.clearAllMocks();vi.restoreAllMocks();vi.useRealTimers();});
it('loads suspended for dialogue and skips stale frame after resuming',async()=>{
 const scene=level(),ready=vi.fn();fake.build.mockResolvedValue(scene);
 let paused=true;
 // Accessor props permit the same mounted component to change pause state.
 app=mount(RegionWorld,{target:document.body,props:{get paused(){return paused;},waterRestored:false,spawn:{x:0,y:1.3,z:-35},onReady:ready,onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn()}});await settle();
 expect(ready).toHaveBeenCalledOnce();expect(scene.suspendInput).toHaveBeenLastCalledWith(true);
 expect(scene.scene.render).toHaveBeenCalledOnce();
 fake.frame();expect(scene.scene.render).toHaveBeenCalledOnce();
 paused=false;fake.frame();fake.frame();expect(scene.scene.render).toHaveBeenCalledTimes(2);
 expect(scene.scene.resetLastAnimationTimeFrame).toHaveBeenCalled();
});
it('does not render a hidden frame and requests pause',async()=>{
 const scene=level(),pause=vi.fn();fake.build.mockResolvedValue(scene);
 app=mount(RegionWorld,{target:document.body,props:{paused:false,waterRestored:true,onReady:vi.fn(),onFailure:vi.fn(),onPosition:vi.fn(),onPause:pause}});await settle();
 scene.scene.render.mockClear();vi.spyOn(document,'hidden','get').mockReturnValue(true);fake.frame();expect(scene.scene.render).not.toHaveBeenCalled();expect(pause).toHaveBeenCalled();
});
it('cleans a late scene before disposing its engine after unmount',async()=>{
 const scene=level(),order:string[]=[];scene.dispose.mockImplementation(()=>order.push('scene'));fake.dispose.mockImplementation(()=>order.push('engine'));
 let resolve!:(value:unknown)=>void;fake.build.mockReturnValue(new Promise(done=>resolve=done));const ready=vi.fn();
 app=mount(RegionWorld,{target:document.body,props:{paused:false,waterRestored:false,onReady:ready,onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn()}});await settle();await unmount(app);app=undefined;
 expect(fake.dispose).not.toHaveBeenCalled();resolve(scene);await settle();expect(order).toEqual(['scene','engine']);expect(ready).not.toHaveBeenCalled();
});
it('reports live build failure and releases engine',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{});const error=new Error('model unavailable'),fail=vi.fn();fake.build.mockRejectedValue(error);
 app=mount(RegionWorld,{target:document.body,props:{paused:false,waterRestored:false,onReady:vi.fn(),onFailure:fail,onPosition:vi.fn(),onPause:vi.fn()}});await settle();expect(fail).toHaveBeenCalledWith(error);
 await unmount(app);app=undefined;expect(fake.dispose).toHaveBeenCalledOnce();
});

it('keeps loading until the backdrop materials are ready',async()=>{
 const scene=level(),ready=vi.fn();let resolve!:()=>void;
 scene.scene.whenReadyAsync.mockReturnValue(new Promise<void>(done=>resolve=done));fake.build.mockResolvedValue(scene);
 app=mount(RegionWorld,{target:document.body,props:{paused:true,waterRestored:false,onReady:ready,onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn()}});await settle();
 expect(ready).not.toHaveBeenCalled();expect(scene.scene.render).not.toHaveBeenCalled();expect(scene.suspendInput).toHaveBeenLastCalledWith(true);
 resolve();await settle();expect(scene.scene.render).toHaveBeenCalledOnce();expect(ready).toHaveBeenCalledOnce();
});
it('cancels a material wait on unmount and disposes the scene before the engine',async()=>{
 const scene=level(),order:string[]=[],ready=vi.fn(),failure=vi.fn();
 scene.scene.whenReadyAsync.mockReturnValue(new Promise<void>(()=>{}));fake.build.mockResolvedValue(scene);
 scene.dispose.mockImplementation(()=>order.push('scene'));fake.dispose.mockImplementation(()=>order.push('engine'));
 app=mount(RegionWorld,{target:document.body,props:{paused:true,waterRestored:false,onReady:ready,onFailure:failure,onPosition:vi.fn(),onPause:vi.fn()}});await settle();
 await unmount(app);app=undefined;await settle();
 expect(order).toEqual(['scene','engine']);expect(ready).not.toHaveBeenCalled();expect(failure).not.toHaveBeenCalled();
});
it('reports a bounded material timeout and releases its built scene',async()=>{
 vi.useFakeTimers();vi.spyOn(console,'error').mockImplementation(()=>{});
 const scene=level(),failure=vi.fn(),ready=vi.fn();
 scene.scene.whenReadyAsync.mockReturnValue(new Promise<void>(()=>{}));fake.build.mockResolvedValue(scene);
 app=mount(RegionWorld,{target:document.body,props:{paused:true,waterRestored:false,onReady:ready,onFailure:failure,onPosition:vi.fn(),onPause:vi.fn()}});
 flushSync();await vi.advanceTimersByTimeAsync(30_100);flushSync();
 expect(failure).toHaveBeenCalledWith(expect.objectContaining({message:expect.stringContaining('ready')}));
 expect(scene.dispose).toHaveBeenCalledOnce();expect(ready).not.toHaveBeenCalled();
 await unmount(app);app=undefined;expect(fake.dispose).toHaveBeenCalledOnce();
});
it('preserves the paused backdrop on resize and updates the buffer before resumed rendering',async()=>{
 const scene=level();fake.build.mockResolvedValue(scene);let paused=true;
 app=mount(RegionWorld,{target:document.body,props:{get paused(){return paused;},waterRestored:false,onReady:vi.fn(),onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn()}});await settle();
 expect(fake.resize).toHaveBeenCalledOnce();fake.resize.mockClear();scene.scene.render.mockClear();
 window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('resize'));fake.frame();
 expect(fake.resize).not.toHaveBeenCalled();expect(scene.scene.render).not.toHaveBeenCalled();
 const order:string[]=[];fake.resize.mockImplementation(()=>order.push('resize'));scene.scene.render.mockImplementation(()=>order.push('render'));
 paused=false;fake.frame();fake.frame();
 expect(order).toEqual(['resize','render']);
});

it('reports the real camera planar heading with the existing HUD sampling interval',async()=>{
 const scene={...level(),follow:{planarBasis:()=>({forward:{x:1,z:0},right:{x:0,z:1}})}};
 fake.build.mockResolvedValue(scene);const heading=vi.fn();
 app=mount(RegionWorld,{target:document.body,props:{paused:false,waterRestored:false,onReady:vi.fn(),onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn(),onHeading:heading}});
 await settle();for(let i=0;i<9;i++)fake.frame();expect(heading).toHaveBeenLastCalledWith(90);
});

it('reports player facing independently of a stationary camera, including the first frame',async()=>{
 const scene={...level(),follow:{planarBasis:()=>({forward:{x:0,z:1}})}};
 Object.assign(scene.player,{motion:{facing:{x:0,y:-1}}});
 const player=scene.player as typeof scene.player & {motion:{facing:{x:number;y:number}}};
 fake.build.mockResolvedValue(scene);const cameraHeading=vi.fn(),playerHeading=vi.fn();
 app=mount(RegionWorld,{target:document.body,props:{paused:false,waterRestored:false,onReady:vi.fn(),onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn(),onHeading:cameraHeading,onPlayerHeading:playerHeading}});
 await settle();expect(playerHeading).toHaveBeenLastCalledWith(180);
 for(const [facing,degrees] of [[{x:1,y:0},90],[{x:-1,y:0},270],[{x:0,y:1},0]] as const){
  player.motion.facing=facing;for(let i=0;i<9;i++)fake.frame();
  expect(playerHeading).toHaveBeenLastCalledWith(degrees);expect(cameraHeading).toHaveBeenLastCalledWith(0);
 }
});

it('places the selected mission marker before the initial paused backdrop is drawn',async()=>{
 const scene=level(),order:string[]=[];fake.build.mockResolvedValue(scene);
 scene.setObjective.mockImplementation(()=>order.push('target'));scene.scene.render.mockImplementation(()=>order.push('render'));
 app=mount(RegionWorld,{target:document.body,props:{paused:true,waterRestored:false,targetId:'palace',onReady:vi.fn(),onFailure:vi.fn(),onPosition:vi.fn(),onPause:vi.fn()}});
 await settle();expect(scene.setObjective).toHaveBeenCalledWith('palace');expect(order.indexOf('target')).toBeLessThan(order.indexOf('render'));
});
