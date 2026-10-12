// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {TransformNode} from '@babylonjs/core/Meshes/transformNode';
import {createFollowCamera} from '../../src/presentation/babylon/followCamera';
import {deviceInput} from '../../src/presentation/input/deviceInput';
const releases:(()=>void)[]=[];afterEach(()=>{for(const release of releases.splice(0))release();});
function mount(){
 const engine=new NullEngine();engine.getDeltaTime=()=>1000/60;
 const scene=new Scene(engine),target=new TransformNode('player',scene),canvas=document.createElement('canvas');
 const owner=deviceInput.registerGameplay(true);owner.setEnabled(true);deviceInput.claim('keyboard');
 const follow=createFollowCamera(scene,target,canvas,()=>null,false,0,{distance:7.5,initialPitch:0});
 releases.push(()=>{follow.dispose();owner.dispose();scene.dispose();engine.dispose();});
 const frames=(n=90)=>{for(let i=0;i<n;i++)scene.render();};frames(1);
 const wheel=(deltaY:number,deltaMode=0,ctrlKey=false)=>{const e=new WheelEvent('wheel',{deltaY,deltaMode,ctrlKey,cancelable:true});canvas.dispatchEvent(e);return e;};
 return{scene,follow,owner,frames,wheel,distance:()=>follow.camera.position.z};
}
it('smoothly zooms the real camera in both directions with the wheel',()=>{
 const r=mount(),start=r.distance();expect(r.wheel(-120).defaultPrevented).toBe(true);r.frames(1);
 expect(r.distance()).toBeLessThan(start);const first=r.distance();r.frames();expect(r.distance()).toBeLessThan(first);
 r.wheel(240);r.frames();expect(r.distance()).toBeGreaterThan(start);
});
it('bounds extreme wheel input and normalizes line scrolling',()=>{
 const r=mount();for(let i=0;i<100;i++)r.wheel(-1000);r.frames();expect(r.distance()).toBeCloseTo(3,4);
 for(let i=0;i<100;i++)r.wheel(1000);r.frames();expect(r.distance()).toBeCloseTo(14,4);
 r.wheel(-3,1);r.frames();expect(r.distance()).toBeLessThan(14);
});
it('ignores paused, browser zoom and disposed wheel events',()=>{
 const r=mount(),start=r.distance();r.follow.setEnabled(false);expect(r.wheel(120).defaultPrevented).toBe(false);r.frames();expect(r.distance()).toBe(start);
 r.follow.setEnabled(true);expect(r.wheel(120,0,true).defaultPrevented).toBe(false);r.frames();expect(r.distance()).toBe(start);
 r.owner.setEnabled(false);expect(r.wheel(120).defaultPrevented).toBe(false);r.owner.setEnabled(true);
 r.follow.dispose();expect(r.wheel(120).defaultPrevented).toBe(false);
});

it('applies touch zoom through the same camera and freezes an unfinished zoom on pause',()=>{
 const r=mount(),start=r.distance();deviceInput.touchZoom(-1);r.frames();expect(r.distance()).toBeCloseTo(start-1,4);
 r.wheel(240);r.frames(1);r.follow.setEnabled(false);const paused=r.distance();r.frames();expect(r.distance()).toBe(paused);
 r.follow.setEnabled(true);r.frames();expect(r.distance()).toBe(paused);
});
it('consumes held gamepad triggers in the real follow camera',()=>{
 const r=mount();deviceInput.poll({id:'zoom-test',index:0,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))},0);
 deviceInput.poll({id:'zoom-test',index:0,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===7,value:i===7?1:0}))},1);
 const before=r.distance();r.frames(30);expect(r.distance()).toBeLessThan(before-1);deviceInput.poll(null,2);const stopped=r.distance();r.frames();expect(r.distance()).toBeGreaterThan(stopped-.7);
});
