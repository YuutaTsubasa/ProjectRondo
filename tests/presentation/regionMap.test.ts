// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import RegionMap from '../../src/presentation/region/RegionMap.svelte';
import {createRegionProgress} from '../../src/domain/region/regionProgress';
it('previews a keyboard-selected landmark before explicitly tracking it',async()=>{
 const track=vi.fn(),close=vi.fn();const app=mount(RegionMap,{target:document.body,props:{progress:createRegionProgress(),position:{x:0,y:1.3,z:-35},onTrack:track,onClose:close}});
 try{
  flushSync();const marker=document.querySelector<SVGElement>('[aria-label="選取潮音海灣"]');expect(marker).not.toBeNull();
  marker!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));flushSync();
  expect(document.querySelector('[data-location-detail]')?.textContent).toContain('潮音海灣');expect(track).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('[aria-label="追蹤潮音海灣"]')!.click();expect(track).toHaveBeenCalledWith('cove');
  document.querySelector<HTMLButtonElement>('[aria-label="關閉區域地圖"]')!.click();expect(close).not.toHaveBeenCalled(); // Tracking already owns the exit; ignore repeat actions.
 }finally{await unmount(app);document.body.innerHTML='';}
});

it('selects from the location list and displays real progress without tracking',async()=>{
 const track=vi.fn();const app=mount(RegionMap,{target:document.body,props:{progress:{...createRegionProgress(),chapter:'relay',discoveries:['ridge'],completedExpeditions:[]},position:{x:0,y:1.3,z:-35},onTrack:track,onClose:vi.fn()}});
 try{flushSync();const list=document.querySelector('[aria-label="地點導覽"]');expect(list).not.toBeNull();
 list!.querySelector<HTMLButtonElement>('[data-place="palace"]')!.click();flushSync();
 expect(document.querySelector('[data-location-detail]')?.textContent).toContain('隨旅程開放');expect(track).not.toHaveBeenCalled();
 expect(document.querySelector('[aria-label="探索紀錄"]')?.textContent).toContain('1 / 3');
 expect(document.querySelector('[aria-label="探索紀錄"]')?.textContent).toContain('0 / 10');
 expect(document.querySelector('image')?.getAttribute('href')).toContain('/maps/white-tide-atlas.png');
 }finally{await unmount(app);document.body.innerHTML='';}
});
it('supports zoom, current position and marker visibility without changing progress',async()=>{
 const app=mount(RegionMap,{target:document.body,props:{progress:createRegionProgress(),position:{x:16,y:1.3,z:-74},onTrack:vi.fn(),onClose:vi.fn()}});
 try{flushSync();const atlas=document.querySelector('[data-region-atlas]')!;const initial=atlas.getAttribute('viewBox');
 document.querySelector<HTMLButtonElement>('[aria-label="放大地圖"]')!.click();flushSync();expect(atlas.getAttribute('viewBox')).not.toBe(initial);
 document.querySelector<HTMLButtonElement>('[aria-label="回到目前位置"]')!.click();flushSync();const box=atlas.getAttribute('viewBox')!.split(' ').map(Number);expect(box[0]+box[2]/2).toBeCloseTo(16);expect(box[1]+box[3]/2).toBeCloseTo(74);
 document.querySelector<HTMLButtonElement>('[aria-label="顯示地圖標記"]')!.click();flushSync();expect(document.querySelector('[aria-label="選取潮音海灣"]')).toBeNull();expect(document.querySelector('[aria-label="悠太翼目前位置"]')).not.toBeNull();
 }finally{await unmount(app);document.body.innerHTML='';}
});

it('closes once after its outro and consumes Escape before the world sees it',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));vi.useFakeTimers();const close=vi.fn(),parent=vi.fn();
 const app=mount(RegionMap,{target:document.body,props:{progress:createRegionProgress(),position:{x:0,y:1.3,z:0},onTrack:vi.fn(),onClose:close}});
 try{flushSync();window.addEventListener('keydown',parent);const dialog=document.querySelector('[role=dialog]')!;
 dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));flushSync();
 expect(document.querySelector('.map-screen.leaving')).not.toBeNull();expect(close).not.toHaveBeenCalled();expect(parent).not.toHaveBeenCalled();
 dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'m',bubbles:true,cancelable:true}));vi.advanceTimersByTime(320);expect(close).toHaveBeenCalledTimes(1);
 }finally{window.removeEventListener('keydown',parent);await unmount(app);document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();}
});
it('keeps markers available when the captured atlas fails to load',async()=>{
 const app=mount(RegionMap,{target:document.body,props:{progress:createRegionProgress(),position:{x:0,y:1.3,z:0},onTrack:vi.fn(),onClose:vi.fn()}});
 try{flushSync();document.querySelector('[data-region-atlas] image')!.dispatchEvent(new Event('error'));flushSync();expect(document.querySelector('.fallback')).not.toBeNull();expect(document.querySelector('[aria-label="選取潮音海灣"]')).not.toBeNull();
 const initialWidth=Number(document.querySelector('[data-region-atlas]')!.getAttribute('viewBox')!.split(' ')[2]);
 const plus=document.querySelector<HTMLButtonElement>('[aria-label="放大地圖"]')!;for(let i=0;i<30;i++)plus.click();flushSync();expect(Number(document.querySelector('[data-region-atlas]')!.getAttribute('viewBox')!.split(' ')[2])).toBeCloseTo(initialWidth/3.5);
 }finally{await unmount(app);document.body.innerHTML='';}
});

it('fits the complete captured city in the initial overview and restores it after zooming',async()=>{
 const {default:metadata}=await import('../../src/content/regionAtlas.json');
 const app=mount(RegionMap,{target:document.body,props:{progress:createRegionProgress(),position:{x:0,y:1.3,z:0},onTrack:vi.fn(),onClose:vi.fn()}});
 try{
  flushSync();const map=document.querySelector('[data-region-atlas]')!;
  const coversBounds=()=>{const [x,y,w,h]=map.getAttribute('viewBox')!.split(' ').map(Number);expect(x).toBeLessThanOrEqual(metadata.bounds.minX);expect(x+w).toBeGreaterThanOrEqual(metadata.bounds.maxX);expect(y).toBeLessThanOrEqual(-metadata.bounds.maxZ);expect(y+h).toBeGreaterThanOrEqual(-metadata.bounds.minZ);};
  coversBounds();const initial=map.getAttribute('viewBox');
  document.querySelector<HTMLButtonElement>('[aria-label="放大地圖"]')!.click();
  document.querySelector<HTMLButtonElement>('[data-place="course-4"]')!.click();flushSync();expect(map.getAttribute('viewBox')).not.toBe(initial);
  document.querySelector<HTMLButtonElement>('[aria-label="檢視全區"]')!.click();flushSync();coversBounds();expect(map.getAttribute('viewBox')).toBe(initial);
 }finally{await unmount(app);document.body.innerHTML='';}
});

it('uses the active city journey objective for selection, quest marker and tracking',async()=>{
 const track=vi.fn(),objectiveOverride={title:'留下來的聲音',detail:'找到住宅區的風鈴。',placeId:'city-residential'};
 const props={progress:{...createRegionProgress(),chapter:'complete' as const,completedExpeditions:['course','palace'] as const},position:{x:-30,y:1.3,z:76},objectiveOverride,onTrack:track,onClose:vi.fn()};
 const app=mount(RegionMap,{target:document.body,props});
 try{
  flushSync();expect(document.querySelector('[data-location-detail]')?.textContent).toContain('白石巷的風鈴');
  expect(document.querySelector('.chapter')?.textContent).toContain(objectiveOverride.title);
  expect(document.querySelector('[aria-label="選取白石巷的風鈴"] .quest')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('[aria-label="追蹤白石巷的風鈴"]')!.click();expect(track).toHaveBeenCalledWith('city-residential');
 }finally{await unmount(app);document.body.innerHTML='';}
});
