import {it,expect} from 'vitest';
import {inspectGamepads} from '../../src/presentation/input/gamepadDiagnostics';
it('explains why LAN HTTP cannot provide gamepads',()=>{expect(inspectGamepads(false,undefined).message).toContain('HTTPS');});
it('distinguishes blocked access, no controller and unmapped controllers',()=>{
 expect(inspectGamepads(true,()=>{throw new Error('SecurityError');}).available).toBe(false);
 expect(inspectGamepads(true,()=>[]).message).toContain('尚未偵測');
 const pad={connected:true,id:'Android controller',mapping:'',axes:[0,0],buttons:[{pressed:true,value:1}]} as unknown as Gamepad;
 const result=inspectGamepads(true,()=>[null,pad]);expect(result.pads[0].pressed).toBe('0');expect(result.message).toContain('未提供標準');
});

it('reports the same Android fallback that gameplay uses',()=>{
 const pad={connected:true,id:'AYANEO Controller',index:0,mapping:'',axes:[0,0,0,0,-1],buttons:Array.from({length:16},()=>({pressed:false,value:0}))} as unknown as Gamepad;
 const result=inspectGamepads(true,()=>[pad],'Linux Android Chrome/130.0');
 expect(result.pads[0].mapping).toContain('Android 相容配置');expect(result.pads[0].supported).toBe(true);expect(result.message).toContain('可用');
});
