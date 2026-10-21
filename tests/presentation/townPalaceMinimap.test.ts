// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import RegionMinimap from '../../src/presentation/region/RegionMinimap.svelte';
import {PALACE_SURFACES} from '../../src/domain/town/townPalace';

it('draws the public palace beyond the captured atlas and retains it when the atlas fails',async()=>{
 const app=mount(RegionMinimap,{target:document.body,props:{position:{x:-10,y:13.3,z:253},navigationId:null}});
 try{
  flushSync();
  for(const floor of PALACE_SURFACES){
   const footprint=document.querySelector(`[data-palace-floor="${floor.id}"]`);
   expect(footprint).not.toBeNull();
   expect(Number(footprint!.getAttribute('x'))).toBe(floor.minX);
   expect(Number(footprint!.getAttribute('y'))).toBe(floor.minZ);
   expect(Number(footprint!.getAttribute('height'))).toBe(floor.maxZ-floor.minZ);
  }
  document.querySelector('image')!.dispatchEvent(new Event('error'));flushSync();
  expect(document.querySelectorAll('[data-palace-floor]')).toHaveLength(PALACE_SURFACES.length);
 }finally{await unmount(app);document.body.innerHTML='';}
});
