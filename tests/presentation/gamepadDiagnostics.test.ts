import {it,expect} from 'vitest';
import {inspectGamepads} from '../../src/presentation/input/gamepadDiagnostics';
it('explains why LAN HTTP cannot provide gamepads',()=>{expect(inspectGamepads(false,undefined).message).toContain('HTTPS');});
it('distinguishes blocked access, no controller and unmapped controllers',()=>{
 expect(inspectGamepads(true,()=>{throw new Error('SecurityError');}).available).toBe(false);
 expect(inspectGamepads(true,()=>[]).message).toContain('尚未偵測');
 const pad={connected:true,id:'Android controller',mapping:'',axes:[0,0],buttons:[{pressed:true,value:1}]} as unknown as Gamepad;
 const result=inspectGamepads(true,()=>[null,pad]);expect(result.pads[0].pressed).toBe('0');expect(result.message).toContain('未提供標準');
});
