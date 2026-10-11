// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import SettingsScreen from '../../src/presentation/settings/SettingsScreen.svelte';
import {deviceInput} from '../../src/presentation/input/deviceInput';
import {startInputRuntime} from '../../src/presentation/input/runtime';
import {get} from 'svelte/store';
import {displayPreferences} from '../../src/presentation/settings/displayPreferences';
const pad=(pressed:number[])=>({id:'Xbox',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i),value:pressed.includes(i)?1:0}))});
afterEach(()=>{vi.unstubAllGlobals();deviceInput.poll(null,0);deviceInput.claim('keyboard');document.body.innerHTML='';displayPreferences.reset();});
it('routes controller focus, slider adjustment and back through the actual settings modal',async()=>{
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});vi.stubGlobal('matchMedia',()=>({matches:true}));const close=vi.fn();const app=mount(SettingsScreen,{target:document.body,props:{onClose:close}});flushSync();const stop=startInputRuntime();let t=0;
 const press=(button:number)=>{deviceInput.poll(pad([]),t+=20);deviceInput.poll(pad([button]),t+=20);flushSync();};
 // Shoulder traversal reaches every control, including sliders and selects.
 let visited=0;while(document.activeElement?.getAttribute('aria-label')!=='亮度'&&visited++<30)press(5);
 expect(visited).toBeLessThan(30);press(15);expect(get(displayPreferences).brightness).toBe(101);
 press(1);expect(close).toHaveBeenCalledOnce();stop();await unmount(app);
});
it('pauses active play when its controller disappears',()=>{
 let callback:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});
 let connected=true;Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>connected?[pad([])]:[]});const rig=deviceInput.registerGameplay(true);rig.setEnabled(true);const paused=vi.fn((e:KeyboardEvent)=>{if(e.key==='Escape')rig.setEnabled(false);});window.addEventListener('keydown',paused);
 const stop=startInputRuntime();callback(0);deviceInput.claim('gamepad');connected=false;callback(16);expect(paused).toHaveBeenCalledOnce();expect(deviceInput.getState().playing).toBe(false);stop();rig.dispose();window.removeEventListener('keydown',paused);
});

it('never re-arms or navigates from a controller while the window is blurred',()=>{
 let callback:FrameRequestCallback=()=>{};vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});
 let pressed:number[]=[];Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad(pressed)]});document.body.innerHTML='<div data-input-scope><button>select</button></div>';const click=vi.fn();document.querySelector('button')!.addEventListener('click',click);
 const stop=startInputRuntime();callback(0);window.dispatchEvent(new Event('blur'));callback(16);pressed=[0];callback(32);expect(click).not.toHaveBeenCalled();window.dispatchEvent(new Event('focus'));callback(48);expect(click).not.toHaveBeenCalled();pressed=[];callback(64);pressed=[0];callback(80);expect(click).toHaveBeenCalledOnce();stop();
});

it('consumes X at a world interaction and attacks only when the world declines it',()=>{
 vi.stubGlobal('requestAnimationFrame',()=>1);vi.stubGlobal('cancelAnimationFrame',()=>{});
 const rig=deviceInput.registerGameplay(true,true);rig.setEnabled(true);const attack=vi.fn();const off=deviceInput.onAction(attack);let nearby=true;
 const interact=(event:KeyboardEvent)=>{if(event.key==='e'&&nearby)event.preventDefault();};window.addEventListener('keydown',interact);
 const stop=startInputRuntime();deviceInput.poll(pad([]),0);deviceInput.poll(pad([2]),10);expect(attack).not.toHaveBeenCalled();
 nearby=false;deviceInput.poll(pad([]),20);deviceInput.poll(pad([2]),30);expect(attack).toHaveBeenCalledExactlyOnceWith('attack');
 stop();off();rig.dispose();window.removeEventListener('keydown',interact);
});

it('routes unmapped Chromium Android pads through the real poller without extra idle axes blocking input',()=>{
 let callback:FrameRequestCallback=()=>{};
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{callback=fn;return 1;});vi.stubGlobal('cancelAnimationFrame',()=>{});
 vi.spyOn(navigator,'userAgent','get').mockReturnValue('Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0');
 let pressed:number[]=[],axes=[0,0,0,0,-1];
 vi.spyOn(navigator,'getGamepads').mockImplementation(()=>[{...pad(pressed),id:'AYANEO Controller',mapping:'',axes} as unknown as Gamepad]);
 document.body.innerHTML='<div data-input-scope><button>continue</button></div>';
 const confirm=vi.fn();document.querySelector('button')!.addEventListener('click',confirm);
 const stop=startInputRuntime();callback(0);pressed=[0];callback(16);expect(confirm).toHaveBeenCalledOnce();
 const rig=deviceInput.registerGameplay(true);rig.setEnabled(true);pressed=[];callback(32);
 axes=[1,0,.5,0,-1];callback(48);expect(deviceInput.axis().x).toBe(1);expect(deviceInput.look(.016).x).toBeGreaterThan(0);
 const pause=vi.fn((e:KeyboardEvent)=>{if(e.key==='Escape')rig.setEnabled(false);});window.addEventListener('keydown',pause);
 pressed=[9];callback(64);expect(pause).toHaveBeenCalledOnce();expect(deviceInput.getState().playing).toBe(false);
 window.removeEventListener('keydown',pause);stop();rig.dispose();vi.restoreAllMocks();
});
