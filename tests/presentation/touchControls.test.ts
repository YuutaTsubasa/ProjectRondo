// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {mount,unmount,tick} from 'svelte';
import TouchControls from '../../src/presentation/input/TouchControls.svelte';
import {deviceInput} from '../../src/presentation/input/deviceInput';
function pointer(el:Element,type:string,id:number,x:number,y:number){const e=new Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:id,clientX:x,clientY:y,button:0,pointerType:'touch'});el.dispatchEvent(e);}
it('keeps movement while another finger jumps, then clears a cancelled pointer',async()=>{
 const rig=deviceInput.registerGameplay(true);rig.setEnabled(true);const target=document.createElement('div');document.body.append(target);const app=mount(TouchControls,{target,props:{camera:true}});await tick();
 const stick=target.querySelector('[aria-label="移動搖桿"]')!;Object.assign(stick,{setPointerCapture:vi.fn(),hasPointerCapture:()=>false});vi.spyOn(stick,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:120,height:120} as DOMRect);
 const actions:string[]=[];const stop=deviceInput.onAction(a=>actions.push(a));pointer(stick,'pointerdown',1,100,60);expect(deviceInput.axis().x).toBeGreaterThan(0);
 const jump=target.querySelector('[aria-label="跳躍／二段跳"]')!;pointer(jump,'pointerdown',2,0,0);expect(actions).toEqual(['jump']);expect(deviceInput.axis().x).toBeGreaterThan(0);
 pointer(stick,'pointercancel',1,100,60);expect(deviceInput.axis()).toEqual({x:0,y:0});stop();await unmount(app);target.remove();rig.dispose();
});

it('shows working zoom buttons only for the controllable 3D camera',async()=>{
 const rig=deviceInput.registerGameplay(true);rig.setEnabled(true);const target=document.createElement('div');document.body.append(target);
 const app=mount(TouchControls,{target,props:{camera:true}});await tick();
 (target.querySelector('[aria-label="拉近視角"]') as HTMLButtonElement).click();expect(deviceInput.cameraZoom(.016)).toBe(-1);
 (target.querySelector('[aria-label="拉遠視角"]') as HTMLButtonElement).click();expect(deviceInput.cameraZoom(.016)).toBe(1);
 await unmount(app);rig.dispose();
 const fixed=mount(TouchControls,{target,props:{camera:false}});await tick();expect(target.querySelector('[aria-label="拉近視角"]')).toBeNull();await unmount(fixed);target.remove();
});
