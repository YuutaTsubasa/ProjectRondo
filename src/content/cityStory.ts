import {parse} from '../domain/dialogue/script/parser';
import {CITY_STOPS,type CityStopId} from '../domain/region/cityJourney';
import market from './dialogue/city/market.dlg?raw';
import residential from './dialogue/city/residential.dlg?raw';
import forecourt from './dialogue/city/forecourt.dlg?raw';
import belvedere from './dialogue/city/belvedere.dlg?raw';
const sources:Record<CityStopId,string>={'city-market':market,'city-residential':residential,'city-forecourt':forecourt,'city-belvedere':belvedere};
export const cityStories=Object.fromEntries(CITY_STOPS.map(stop=>{
 const {graph,errors}=parse(sources[stop.id]);if(!graph||errors.length)throw Error('Invalid city dialogue '+stop.id+': '+JSON.stringify(errors));
 return [stop.id,{title:stop.title,graph}];
})) as Record<CityStopId,{title:string;graph:NonNullable<ReturnType<typeof parse>['graph']>}>;
export function cityStoryChapter(activeId:CityStopId){return {number:'01',title:'白色王城 · 沿潮聲走',activeId,entries:CITY_STOPS.map(s=>({id:s.id,title:s.title}))};}
