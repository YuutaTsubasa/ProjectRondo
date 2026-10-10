import {expect,it} from 'vitest';
import {readRegionSave,writeRegionSave,REGION_SAVE_KEY,hasRegionSave,backupRegionSave} from '../../src/app/regionSave';
import {createRegionProgress} from '../../src/domain/region/regionProgress';
it('round-trips chapter progress and a supported position',()=>{
 const memory=new Map<string,string>();const storage={getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>{memory.set(k,v);}};
 const save={progress:createRegionProgress(),position:{x:0,y:1.3,z:-90}};
 expect(writeRegionSave(storage,save)).toBe(true);expect(readRegionSave(storage).position.x).toBe(0);expect(readRegionSave(storage).position.z).toBe(-90);
 expect(memory.has(REGION_SAVE_KEY)).toBe(true);
});
it('survives corrupt saves, blocked storage and unsafe positions',()=>{
 const broken={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
 expect(readRegionSave(broken).progress.chapter).toBe('arrival');expect(writeRegionSave(broken,readRegionSave())).toBe(false);
 expect(readRegionSave({getItem:()=>'{bad'}).progress.chapter).toBe('arrival');
 const raw=JSON.stringify({version:1,progress:createRegionProgress(),position:{x:999,y:5,z:999}});
 expect(readRegionSave({getItem:()=>raw}).position.x).toBe(0);
});

it('does not restore an old airborne or rooftop save inside a building',()=>{
 const raw=JSON.stringify({version:1,progress:createRegionProgress(),position:{x:14,y:20,z:-30}});
 const loaded=readRegionSave({getItem:()=>raw});expect(loaded.position.x).toBe(0);expect(loaded.position.z).toBe(-35);
});

it('rejects corrupted progress as a loadable save and leaves the current slot untouched on backup failure',()=>{
 expect(hasRegionSave({getItem:()=>JSON.stringify({version:1,progress:{version:1,chapter:'complete',discoveries:[],completedExpeditions:[]}})})).toBe(false);
 const old='existing';let current=old;
 const blocked={getItem:()=>current,setItem:()=>{throw new Error('quota');}};
 expect(backupRegionSave(blocked)).toBe(false);expect(current).toBe(old);
});
