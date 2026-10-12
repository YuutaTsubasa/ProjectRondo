import {it,expect} from 'vitest';
import {normalizeGamepad,gamepadProfile} from '../../src/presentation/input/gamepadProfile';
const android='Mozilla/5.0 (Linux; Android 14; AYANEO) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36';
const pad=(mapping='')=>({id:'AYANEO Controller',index:0,mapping,axes:[0,0,.5,-.25,-1],buttons:Array.from({length:16},(_,i)=>({pressed:i===0,value:i===0?1:0}))});
it('uses Chromium Android canonical buttons and stick axes even without the standard label',()=>{
 const p=normalizeGamepad(pad(),android)!;
 expect(gamepadProfile(pad(),android)).toBe('android');
 expect(p.mapping).toBe('standard');expect(p.buttons[0].pressed).toBe(true);expect(p.axes).toEqual([0,0,.5,-.25]);
});
it('never guesses a layout for unmapped desktop or incomplete controllers',()=>{
 expect(normalizeGamepad(pad(),'Mozilla/5.0 Windows Chrome/130')).toBeNull();
 expect(normalizeGamepad({...pad(),buttons:[]},android)).toBeNull();
 expect(normalizeGamepad(pad(),'Android Firefox/130')).toBeNull();
});
it('preserves standard layouts on all platforms',()=>{
 const p=pad('standard');expect(normalizeGamepad(p,'')).toBe(p);
});
