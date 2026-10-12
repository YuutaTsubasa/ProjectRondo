import {expect,it,vi} from 'vitest';
import {get} from 'svelte/store';
import {createDisplayPreferences,DEFAULT_DISPLAY} from '../../src/presentation/settings/displayPreferences';
it('rejects malformed persisted settings and clamps numeric changes',()=>{
 const storage={getItem:()=>'{bad',setItem:vi.fn()};
 const prefs=createDisplayPreferences(storage);
 expect(get(prefs)).toEqual(DEFAULT_DISPLAY);
 prefs.set('brightness',400);expect(get(prefs).brightness).toBe(150);
 prefs.set('contrast',NaN);expect(get(prefs).contrast).toBe(100);
 prefs.set('renderScale',.75);prefs.set('bloom',false);
 const restored=createDisplayPreferences({getItem:()=>storage.setItem.mock.calls.at(-1)![1],setItem:()=>{}});
 expect(get(restored).renderScale).toBe(.75);expect(get(restored).bloom).toBe(false);
 prefs.reset();expect(get(prefs)).toEqual(DEFAULT_DISPLAY);
});
it('survives blocked storage and rejects invalid enums/types',()=>{
 const prefs=createDisplayPreferences({getItem(){throw Error();},setItem(){throw Error();}});
 prefs.set('samples',3 as 4);prefs.set('shadows','yes' as unknown as boolean);
 expect(get(prefs)).toEqual(DEFAULT_DISPLAY);
 prefs.set('contrast',80);expect(get(prefs).contrast).toBe(80);
});
it('starts Android on balanced graphics but preserves explicit saved choices',()=>{
 const android='Mozilla/5.0 (Linux; Android 14) Chrome/130.0';
 const prefs=createDisplayPreferences(undefined,android);
 expect(get(prefs)).toMatchObject({renderScale:.75,samples:2,bloom:false,shadows:true});
 prefs.set('renderScale',1);prefs.reset();expect(get(prefs).renderScale).toBe(.75);
 const saved=createDisplayPreferences({getItem:()=>JSON.stringify({renderScale:1,samples:4,bloom:true}),setItem:()=>{}},android);
 expect(get(saved)).toMatchObject({renderScale:1,samples:4,bloom:true});
 expect(get(createDisplayPreferences(undefined,'Windows'))).toEqual(DEFAULT_DISPLAY);
});
