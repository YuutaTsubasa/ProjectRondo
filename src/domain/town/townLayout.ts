export type TownBuildingKind = 'house' | 'shop' | 'tower' | 'gate' | 'arcade';
export interface TownBuilding { readonly id:string; readonly kind:TownBuildingKind; readonly x:number; readonly z:number; readonly yaw:number; readonly height:number }
export const TOWN_BOUNDS={minX:-40,maxX:40,minZ:-63,maxZ:57} as const;
export const TOWN_SPAWN = {x:0,y:1.2,z:-54} as const;
export const TOWN_BUILDINGS:readonly TownBuilding[] = [
 ...[-25,-10,5].flatMap((z,i)=>[
  {id:`west-house-${i}`,kind:'house' as const,x:-13,z,yaw:Math.PI/2,height:9},
  {id:`east-house-${i}`,kind:'house' as const,x:13,z,yaw:-Math.PI/2,height:9},
 ]),
 {id:'plaza-shop-west',kind:'shop',x:-16,z:24,yaw:Math.PI/2,height:9.5},
 {id:'plaza-shop-north',kind:'shop',x:15,z:40,yaw:Math.PI,height:9.5},
 {id:'city-gate',kind:'gate',x:0,z:-43,yaw:Math.PI,height:11},
 ...[18,24,30].map((x,i)=>({id:'sea-arcade-'+i,kind:'arcade' as const,x,z:24,yaw:0,height:6})),
 {id:'royal-tower',kind:'tower',x:0,z:43,yaw:Math.PI,height:23},
];
export function outsideTown(x:number,y:number,z:number):boolean {
 return ![x,y,z].every(Number.isFinite)||y < -3||y>100||x<TOWN_BOUNDS.minX||x>TOWN_BOUNDS.maxX||z<TOWN_BOUNDS.minZ||z>TOWN_BOUNDS.maxZ;
}
export function townLocation(x:number,z:number):string {
 return z < -38 ? '王城入口 · CITY GATE' : x>27 ? '海風步道 · SEAFRONT' : z>13 ? '白塔廣場 · TOWER SQUARE' : '白石街 · IVORY STREET';
}
