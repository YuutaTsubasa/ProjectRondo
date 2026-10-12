import {inputHint} from '../../src/presentation/input/hints';
import {describe,it,expect} from 'vitest';
import {createDeviceHub,deadzone} from '../../src/presentation/input/deviceInput';
const pad=(buttons:number[]=[],axes=[0,0,0,0])=>({id:'Xbox',index:0,mapping:'standard',buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0})),axes});
describe('shared device input',()=>{
 it('removes drift and bounds diagonal input',()=>{expect(deadzone(.1,.1)).toEqual({x:0,y:0});const a=deadzone(1,1);expect(Math.hypot(a.x,a.y)).toBeCloseTo(1);});
 it('emits one jump per press and requires release across context changes',()=>{
  const h=createDeviceHub();const actions:string[]=[];h.onAction(a=>actions.push(a));const rig=h.registerGameplay(true);rig.setEnabled(true);
  h.poll(pad(),0);h.poll(pad([0]),10);h.poll(pad([0]),20);expect(actions).toEqual(['jump']);
  rig.setEnabled(false);rig.setEnabled(true);h.poll(pad([0]),30);expect(actions).toEqual(['jump']);
  h.poll(pad(),40);h.poll(pad([0]),50);expect(actions).toEqual(['jump','jump']);rig.dispose();
 });
 it('clears movement on disconnect and waits for neutral after resuming',()=>{
  const h=createDeviceHub();const rig=h.registerGameplay(true);rig.setEnabled(true);h.poll(pad(),0);h.poll(pad([],[1,0,0,0]),10);expect(h.axis().x).toBe(1);
  rig.setEnabled(false);rig.setEnabled(true);h.poll(pad([],[1,0,0,0]),20);expect(h.axis().x).toBe(0);
  h.poll(pad(),30);h.poll(pad([],[1,0,0,0]),40);expect(h.axis().x).toBe(1);h.poll(null,50);expect(h.axis().x).toBe(0);rig.dispose();
 });
 it('routes confirm and cancel to UI without gameplay edges',()=>{
  const h=createDeviceHub();const ui:string[]=[],game:string[]=[];h.onUi(a=>ui.push(a));h.onAction(a=>game.push(a));h.poll(pad(),0);h.poll(pad([0]),10);h.poll(pad(),20);h.poll(pad([1]),30);
  expect(ui).toEqual(['confirm','back']);expect(game).toEqual([]);
 });
 it('drops touch movement and look on suspension',()=>{
  const h=createDeviceHub();const rig=h.registerGameplay(true);rig.setEnabled(true);h.touchAxis(1,0);h.touchLook(50,20);expect(h.axis().x).toBe(1);rig.setEnabled(false);expect(h.axis()).toEqual({x:0,y:0});expect(h.look(.016)).toEqual({x:0,y:0});rig.dispose();
 });
});

it('releasing touch controls never steals a later keyboard or gamepad selection',()=>{
 const h=createDeviceHub(),rig=h.registerGameplay(true);rig.setEnabled(true);h.touchAxis(1,0);h.claim('keyboard');h.releaseTouch();expect(h.getState().device).toBe('keyboard');rig.dispose();
});
it('does not accept a held button when first connected and repeats menu directions at a controlled rate',()=>{
 const h=createDeviceHub(),ui:string[]=[];h.onUi(a=>ui.push(a));h.poll(pad([0]),0);expect(ui).toEqual([]);h.poll(pad(),10);h.poll(pad([13]),20);h.poll(pad([13]),30);h.poll(pad([13]),381);expect(ui).toEqual(['down','down']);
});

it('uses X for a consumed interaction, otherwise attacks, and never talks on B',()=>{
 const h=createDeviceHub(),game:string[]=[],ui:string[]=[];let nearby=true;
 h.onAction(a=>game.push(a));h.onUi(a=>{ui.push(a);return a==='interact'&&nearby;});
 const rig=h.registerGameplay(true,true);rig.setEnabled(true);
 h.poll(pad(),0);h.poll(pad([2]),10);h.poll(pad([2]),20);
 expect(ui).toEqual(['interact']);expect(game).toEqual([]);
 nearby=false;h.poll(pad(),30);h.poll(pad([2]),40);expect(game).toEqual(['attack']);
 h.poll(pad(),50);h.poll(pad([1]),60);expect(ui).toEqual(['interact','interact']);rig.dispose();
});
it('maps menu X to interaction while keeping A confirm and B back',()=>{
 const h=createDeviceHub(),ui:string[]=[];h.onUi(a=>{ui.push(a);});
 h.poll(pad(),0);h.poll(pad([2]),10);h.poll(pad(),20);h.poll(pad([0]),30);h.poll(pad(),40);h.poll(pad([1]),50);
 expect(ui).toEqual(['interact','confirm','back']);
});

it('labels interaction X or Square, while menu confirm and cancel retain their own keys',()=>{
 expect(inputHint('E',{device:'gamepad',family:'xbox'})).toBe('X');
 expect(inputHint('E',{device:'gamepad',family:'playstation'})).toBe('□');
 expect(inputHint('Enter',{device:'gamepad',family:'xbox'})).toBe('A');
 expect(inputHint('Esc',{device:'gamepad',family:'xbox'})).toBe('B');
});

it('uses held triggers for camera zoom but preserves trigger actions in menus',()=>{
 const h=createDeviceHub(),rig=h.registerGameplay(true),ui:string[]=[];h.onUi(a=>ui.push(a));rig.setEnabled(true);
 h.poll(pad(),0);h.poll(pad([6]),10);expect(h.cameraZoom(.05)).toBeGreaterThan(0);
 h.poll(pad([7]),20);expect(h.cameraZoom(.05)).toBeLessThan(0);
 rig.setEnabled(false);expect(h.cameraZoom(.05)).toBe(0);h.poll(pad(),30);h.poll(pad([7]),40);expect(ui).toEqual(['zoomIn']);rig.dispose();
});
it('consumes touch zoom once and drops it when leaving camera gameplay',()=>{
 const h=createDeviceHub(),rig=h.registerGameplay(true);rig.setEnabled(true);h.touchZoom(-1);expect(h.cameraZoom(.016)).toBe(-1);expect(h.cameraZoom(.016)).toBe(0);
 h.touchZoom(1);rig.setEnabled(false);rig.setEnabled(true);expect(h.cameraZoom(.016)).toBe(0);rig.dispose();
 const fixed=h.registerGameplay(false);fixed.setEnabled(true);h.touchZoom(1);expect(h.cameraZoom(.016)).toBe(0);fixed.dispose();
});
