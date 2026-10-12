import {expect,it} from 'vitest';
import {CITY_STOPS,finishCityStop,readCityJourney,writeCityJourney,CITY_JOURNEY_KEY} from '../../src/domain/region/cityJourney';
it('only finishes the next city stop, remains idempotent and preserves optional exploration order',()=>{
 expect(finishCityStop([],CITY_STOPS[1].id)).toEqual([]);
 let done:string[]=[];for(const stop of CITY_STOPS)done=finishCityStop(done,stop.id);
 expect(done).toEqual(CITY_STOPS.map(s=>s.id));expect(finishCityStop(done,CITY_STOPS[0].id)).toEqual(done);
});
it('accepts only a contiguous valid journey and survives unavailable storage',()=>{
 const data=new Map<string,string>();const s={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 expect(readCityJourney(s)).toEqual([]);writeCityJourney([CITY_STOPS[0].id],s);expect(readCityJourney(s)).toEqual([CITY_STOPS[0].id]);
 s.setItem(CITY_JOURNEY_KEY,JSON.stringify({version:1,done:[CITY_STOPS[1].id]}));expect(readCityJourney(s)).toEqual([]);
 s.setItem(CITY_JOURNEY_KEY,'{');expect(readCityJourney(s)).toEqual([]);
});
