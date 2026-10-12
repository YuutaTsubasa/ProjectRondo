export const CITY_STOPS=[
 {id:'city-market',name:'潮光街的送貨簿',x:-30,z:76,title:'遲到的第一車麵包',detail:'調查商店街回聲管旁的送貨簿。'},
 {id:'city-residential',name:'白石巷的風鈴',x:-10,z:130,title:'留下來的聲音',detail:'沿東西兩側坡道上行，找到住宅區的風鈴。'},
 {id:'city-forecourt',name:'王宮前庭的舊路牌',x:-10,z:188,title:'把路重新連起來',detail:'登上王宮前庭，查看高塔維修路線。'},
 {id:'city-belvedere',name:'海風眺望廊',x:-74,z:52,title:'等船回來的地方',detail:'沿坡道返回舊城，再登上西側眺望廊。'},
] as const;
export type CityStopId=typeof CITY_STOPS[number]['id'];
export const CITY_JOURNEY_KEY='rondo.city-journey.v1';
type StoragePort={getItem(key:string):string|null;setItem(key:string,value:string):void};
export const isCityStop=(id:string):id is CityStopId=>CITY_STOPS.some(s=>s.id===id);
export function finishCityStop(done:readonly string[],id:string):string[]{return CITY_STOPS[done.length]?.id===id?[...done,id]:[...done];}
export function readCityJourney(storage?:Pick<StoragePort,'getItem'>):string[]{
 try{const data=JSON.parse(storage?.getItem(CITY_JOURNEY_KEY)??'null');if(data?.version!==1||!Array.isArray(data.done)||data.done.length>CITY_STOPS.length)return [];
 return data.done.every((id:unknown,i:number)=>id===CITY_STOPS[i].id)?[...data.done]:[];}catch{return [];}
}
export function writeCityJourney(done:readonly string[],storage?:Pick<StoragePort,'setItem'>):boolean{
 try{if(!storage)return false;storage.setItem(CITY_JOURNEY_KEY,JSON.stringify({version:1,done}));return true;}catch{return false;}
}
