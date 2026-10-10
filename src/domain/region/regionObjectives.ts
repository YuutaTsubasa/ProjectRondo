import {COURSE_RETURN} from './regionLayout';
import type {RegionChapter} from './regionProgress';
export interface RegionPoint {readonly x:number;readonly y:number;readonly z:number}
export interface PlacePoint {readonly id:string;readonly x:number;readonly z:number}
const objectives:Record<RegionChapter,{title:string;detail:string;placeId:string|null}>={
 arrival:{title:'潮聲未到的午後',detail:'聽聽城裡發生了什麼。',placeId:'homecoming'},
 signal:{title:'風裡重複的訊號',detail:'走出南門，調查草原白石環旁的回聲管。',placeId:'signal'},
 relay:{title:'讓新的命令抵達',detail:'回王城白塔廣場西北側，穿越 3D 白宮天廊，修復連結草原與港口的中繼台。',placeId:'course'},
 'relay-report':{title:'訊號接通之後',detail:'接聽澄音的回覆。',placeId:'course'},
 aqueduct:{title:'退潮之前',detail:'前往王城海濱，進入 2D 蒼穹迴廊，解除水道末端封鎖。',placeId:'palace'},
 'aqueduct-report':{title:'水聲回來了',detail:'確認港道的變化。',placeId:'palace'},
 homecoming:{title:'留在簿子上的名字',detail:'回白塔廣場的回聲管，向澄音確認船隻進港。',placeId:'homecoming'},
 complete:{title:'第一章完成',detail:'船能靠岸，人能回家。繼續探索白潮原野，或重訪兩處遠征。',placeId:null},
};
export const regionObjective=(chapter:RegionChapter)=>objectives[chapter];
/** A high flyover must not interact with an object on the ground. */
export function nearbyRegionPlace<T extends PlacePoint>(position:RegionPoint,places:readonly T[],heightAt:(x:number,z:number)=>number):T|undefined{
 if(![position.x,position.y,position.z].every(Number.isFinite))return;
 return places.filter(p=>Math.hypot(p.x-position.x,p.z-position.z)<=4&&Math.abs(position.y-heightAt(p.x,p.z)-1.2)<2.5)
  .sort((a,b)=>Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z))[0];
}

/** Where the 3D course entrance stood in the meadow before it moved to the tower square. */
const LEGACY_COURSE_ENTRANCE={x:-64,z:-170} as const;
/** Only unfinished relay visits used the old outdoor entrance as their destination.
 * Preserve later free exploration and every save elsewhere in the region. */
export function restoreRegionCoursePosition(position:RegionPoint,chapter:RegionChapter):RegionPoint{
 return (chapter==='relay'||chapter==='relay-report')
  &&Math.hypot(position.x-LEGACY_COURSE_ENTRANCE.x,position.z-LEGACY_COURSE_ENTRANCE.z)<=8
  ? {...COURSE_RETURN}:position;
}
