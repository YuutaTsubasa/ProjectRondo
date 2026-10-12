/** Authored surfaces are shared by visible paving, Havok support and foot/camera probes. */
export interface TownSurface {
 readonly id:string; readonly minX:number; readonly maxX:number;
 readonly minZ:number; readonly maxZ:number;
 readonly fromY:number; readonly toY:number; readonly axis:'x'|'z';
}
export const ORIGINAL_TOWN_BOUNDS={minX:-40,maxX:40,minZ:-63,maxZ:57} as const;
export const CITY_LOOP:readonly (readonly [number,number])[]=[[-30,50],[-30,76],[-70,76],[-70,130],[-70,188],[50,188],[50,130],[50,76],[30,76],[30,50]];
/** A continuous walk through the four journey stops, returning via the old square to the overlook. */
export const CITY_EXPLORATION_ROUTE:readonly (readonly [number,number])[]=[[-30,76],[-70,76],[-70,130],[-10,130],[-70,130],[-70,188],[-10,188],[-70,188],[-70,76],[-30,76],[-30,12],[-56,12],[-74,12],[-74,22],[-74,46],[-74,52]];
export const TOWN_TERRACES:readonly TownSurface[]=[
 {id:'market-district',minX:-84,maxX:64,minZ:57,maxZ:91,fromY:0,toY:0,axis:'z'},
 {id:'market-garden',minX:-42,maxX:22,minZ:91,maxZ:115,fromY:0,toY:0,axis:'z'},
 {id:'residential-district',minX:-84,maxX:64,minZ:115,maxZ:145,fromY:6,toY:6,axis:'z'},
 {id:'palace-forecourt',minX:-84,maxX:64,minZ:169,maxZ:209,fromY:12,toY:12,axis:'z'},
 ...[-70,50].flatMap(x=>[
  {id:'lower-ascent-'+x,minX:x-8,maxX:x+8,minZ:91,maxZ:115,fromY:0,toY:6,axis:'z' as const},
  {id:'royal-ascent-'+x,minX:x-8,maxX:x+8,minZ:145,maxZ:169,fromY:6,toY:12,axis:'z' as const},
 ]),
 {id:'west-ascent',minX:-56,maxX:-32,minZ:8,maxZ:16,fromY:6,toY:0,axis:'x'},
 {id:'garden-terrace',minX:-84,maxX:-56,minZ:2,maxZ:22,fromY:6,toY:6,axis:'z'},
 {id:'upper-ascent',minX:-80,maxX:-68,minZ:22,maxZ:46,fromY:6,toY:12,axis:'z'},
 {id:'belvedere',minX:-84,maxX:-60,minZ:46,maxZ:56,fromY:12,toY:12,axis:'z'},
 {id:'sky-arcade',minX:-60,maxX:-42,minZ:48,maxZ:56,fromY:12,toY:12,axis:'x'},
];
export const TERRACE_ROUTE:readonly (readonly [number,number])[]=[[0,12],[-32,12],[-56,12],[-74,12],[-74,22],[-74,46],[-74,52],[-45,52]];
export function surfaceHeight(surface:TownSurface,x:number,z:number):number {
 const t=surface.axis==='x'?(x-surface.minX)/(surface.maxX-surface.minX):(z-surface.minZ)/(surface.maxZ-surface.minZ);
 return surface.fromY+(surface.toY-surface.fromY)*Math.max(0,Math.min(1,t));
}
export function townSurfaceHeight(x:number,z:number):number|null {
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 for(const s of TOWN_TERRACES)if(x>=s.minX&&x<=s.maxX&&z>=s.minZ&&z<=s.maxZ)return surfaceHeight(s,x,z);
 const b=ORIGINAL_TOWN_BOUNDS;
 return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ?0:null;
}
