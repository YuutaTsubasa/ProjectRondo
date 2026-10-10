import {afterEach, expect, it, vi} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {AssetContainer} from '@babylonjs/core/assetContainer';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import {AnimationGroup} from '@babylonjs/core/Animations/animationGroup';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import type {Scene} from '@babylonjs/core/scene';
import {createMenuPortraitScene} from '../../src/presentation/menu/menuPortraitScene';
const stub=vi.hoisted(()=>({load:vi.fn(),blink:vi.fn(()=>vi.fn())}));
vi.mock('@babylonjs/core/Loading/sceneLoader',()=>({LoadAssetContainerAsync:stub.load}));
vi.mock('../../src/presentation/menu/portraitPainting',()=>({applyPortraitPainting:vi.fn(()=>vi.fn())}));
vi.mock('../../src/presentation/babylon/playerMaterials',()=>({applyPlayerMaterials:vi.fn()}));
vi.mock('../../src/presentation/babylon/playerBlink',()=>({attachPlayerBlink:stub.blink}));
let engine:NullEngine;
afterEach(()=>{engine?.dispose();vi.clearAllMocks();});
function model(scene:Scene){
 const container=new AssetContainer(scene),root=new TransformNode('root',scene);
 const mesh=MeshBuilder.CreateBox('body',{height:2},scene);mesh.parent=root;
 const idle=new AnimationGroup('Idle',scene);
 container.meshes.push(mesh);container.transformNodes.push(root);container.animationGroups.push(idle);
 return container;
}
it('uses a transparent right-handed scene, shares the player model and reframes for Loading',async()=>{
 engine=new NullEngine();stub.load.mockImplementation((_url,scene)=>Promise.resolve(model(scene)));
 const view=createMenuPortraitScene(engine);await view.ready;
 expect(stub.load.mock.calls[0][0]).toMatch(/player-v20.glb/);
 expect(view.scene.clearColor.a).toBe(0);expect(view.scene.useRightHandedSystem).toBe(true);
 expect(stub.blink).toHaveBeenCalledOnce();
 const camera=view.scene.activeCamera!;const wide=camera.position.clone();
 view.setPresentation('loading',true,true);view.render();
 expect(camera.position.equals(wide)).toBe(false);
 expect(view.scene.getPhysicsEngine()).toBeFalsy();
 view.dispose();expect(view.scene.isDisposed).toBe(true);
});
it('disposes a late model without adding it after the portrait has been released',async()=>{
 engine=new NullEngine();let finish!:(value:AssetContainer)=>void;
 stub.load.mockImplementation(()=>new Promise<AssetContainer>(resolve=>finish=resolve));
 const view=createMenuPortraitScene(engine);const asset=model(view.scene);
 const add=vi.spyOn(asset,'addAllToScene'),dispose=vi.spyOn(asset,'dispose');
 view.dispose();finish(asset);await view.ready;
 expect(add).not.toHaveBeenCalled();expect(dispose).toHaveBeenCalled();
 expect(stub.blink).not.toHaveBeenCalled();
});
it('skips paused frames and freezes animation for reduced motion while allowing a still render',async()=>{
 engine=new NullEngine();stub.load.mockImplementation((_url,scene)=>Promise.resolve(model(scene)));
 const view=createMenuPortraitScene(engine);await view.ready;
 const render=vi.spyOn(view.scene,'render').mockImplementation(()=>{});
 view.setPresentation('menu',false,false);view.render();expect(render).not.toHaveBeenCalled();
 view.setPresentation('menu',true,true);view.render();expect(render).toHaveBeenCalledOnce();
 expect(view.scene.animationsEnabled).toBe(false);
 view.render();expect(render).toHaveBeenCalledOnce();
 view.setPresentation('menu',true,false);view.render();expect(render).toHaveBeenCalledTimes(2);
 expect(view.scene.animationsEnabled).toBe(true);view.dispose();
});
it('releases its scene when model loading fails',async()=>{
 engine=new NullEngine();stub.load.mockRejectedValue(new Error('model unavailable'));
 const view=createMenuPortraitScene(engine);await expect(view.ready).rejects.toThrow('model unavailable');
 expect(view.scene.isDisposed).toBe(true);
});
it('snaps to a new screen pose in one frame and primes shaders while hidden',async()=>{
 engine=new NullEngine();stub.load.mockImplementation((_url,scene)=>Promise.resolve(model(scene)));
 const view=createMenuPortraitScene(engine);await view.ready;
 const render=vi.spyOn(view.scene,'render').mockImplementation(()=>{});
 view.prime();expect(render).toHaveBeenCalledOnce();
 const camera=view.scene.activeCamera!;
 // With motion on, a normal frame only eases toward the pose; a takeover frames it at once.
 view.setPresentation('loading',true,false);view.snapToPose();view.render();
 expect(camera.position.x).toBeCloseTo(-1.65,5);expect(camera.position.z).toBeCloseTo(1.02,5);
 view.setPresentation('menu',true,false);view.render();
 expect(camera.position.x).toBeLessThan(2.2);view.dispose();
});
