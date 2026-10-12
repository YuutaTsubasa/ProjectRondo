// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import RegionSession from '../../src/app/RegionSession.svelte';
import {REGION_SAVE_KEY} from '../../src/app/regionSave';
import {CITY_JOURNEY_KEY} from '../../src/domain/region/cityJourney';
vi.mock('../../src/app/RegionWorld.svelte',async()=>({default:(await import('./RegionWorldFixture.svelte')).default}));
vi.mock('../../src/app/CourseSession.svelte',async()=>({default:(await import('./RegionExpeditionFixture.svelte')).default}));
vi.mock('../../src/app/PalaceSession.svelte',async()=>({default:(await import('./RegionExpeditionFixture.svelte')).default}));

it('passes the next optional city stop from the resumed session into the map',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
 localStorage.setItem(REGION_SAVE_KEY,JSON.stringify({version:1,progress:{version:1,chapter:'complete',discoveries:[],completedExpeditions:['course','palace']},position:{x:-30,y:1.3,z:76}}));
 localStorage.setItem(CITY_JOURNEY_KEY,JSON.stringify({version:1,done:['city-market']}));
 const app=mount(RegionSession,{target:document.body,props:{onReady:vi.fn(),onFailure:vi.fn()}});
 try{
  flushSync();await new Promise(resolve=>setTimeout(resolve,0));flushSync();
  document.querySelector<HTMLButtonElement>('[aria-label="開啟區域地圖"]')!.click();flushSync();
  expect(document.querySelector('[data-location-detail]')?.textContent).toContain('白石巷的風鈴');
  expect(document.querySelector('[aria-label="選取白石巷的風鈴"] .quest')).not.toBeNull();
  expect(document.querySelector('.map-screen .chapter')?.textContent).toContain('留下來的聲音');
  expect(JSON.parse(localStorage.getItem(REGION_SAVE_KEY)!).progress.chapter).toBe('complete');
 }finally{await unmount(app);document.body.innerHTML='';localStorage.clear();vi.unstubAllGlobals();}
});
