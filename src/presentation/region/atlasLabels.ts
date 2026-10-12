type AtlasPlace={id:string;x:number;z:number};
/** Keep icon hit targets available; suppress colliding name plates at distant zoom. */
export function visibleAtlasLabels(places:readonly AtlasPlace[],selected:string,objective:string|null,zoom:number):Set<string>{
 const priority=(p:AtlasPlace)=>p.id===selected?0:p.id===objective?1:2;
 const ordered=[...places].sort((a,b)=>priority(a)-priority(b));
 const accepted:AtlasPlace[]=[];
 for(const place of ordered){
  if(accepted.some(other=>Math.abs(place.x-other.x)<90/zoom&&Math.abs(place.z-other.z)<28/zoom))continue;
  // Name plates must not cover a neighbouring selectable icon either.
  if(place.id!==selected&&places.some(other=>other.id!==place.id&&other.x-place.x>0&&other.x-place.x<84/zoom&&Math.abs(other.z-place.z)<18/zoom))continue;
  accepted.push(place);
 }
 return new Set(accepted.map(p=>p.id));
}
