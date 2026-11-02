import {TOWN_BUILDINGS} from './townLayout';
import type {RegionPoint} from '../region/regionObjectives';

/** The middle east townhouse on Ivory Street is now 白石台麻館, a Taiwanese mahjong parlor. */
export const PARLOR_HOUSE_ID='east-house-1';
export const PARLOR_NAME='白石台麻館';
const house=TOWN_BUILDINGS.find(b=>b.id===PARLOR_HOUSE_ID)!;
/** In front of the street-facing door, clear of the sidewalk lamp. */
export const PARLOR_ENTRANCE={id:'parlor',x:house.x-4.6,z:house.z} as const;
export const PARLOR_RETURN={x:PARLOR_ENTRANCE.x-.6,y:1.3,z:PARLOR_ENTRANCE.z} as const;
/** Leaving faces the street, so the camera starts against the facade rather than in the sidewalk trees. */
export const PARLOR_RETURN_FACING={x:-1,z:0} as const;

/** The interior is its own small scene: metres, origin at the room's floor centre, door on -z. */
export const PARLOR_ROOM={minX:-6,maxX:6,minZ:-5,maxZ:5,height:4.2} as const;
export const PARLOR_SPAWN={x:0,y:1.2,z:-3.6} as const;
export const PARLOR_EXIT={x:0,z:-4.3} as const;

export type ParlorSide='north'|'south'|'east'|'west';
export interface ParlorTable {readonly id:string;readonly x:number;readonly z:number}
export interface ParlorChair {readonly tableId:string;readonly side:ParlorSide;readonly x:number;readonly z:number;readonly yaw:number}
export const PARLOR_TABLE_SIZE=1;
export const PARLOR_TABLES:readonly ParlorTable[]=[
 {id:'south-west',x:-3,z:-.6},{id:'south-east',x:3,z:-.6},
 {id:'north-west',x:-3,z:2.8},{id:'north-east',x:3,z:2.8},
];
const SEAT_DISTANCE=.95;
const SIDES:readonly (readonly [ParlorSide,number,number])[]=[['north',0,1],['south',0,-1],['east',1,0],['west',-1,0]];
/** 一目元 hovers in the aisle seat of the back table, turned toward the aisle and the door (yaw: +z forward). */
export const PARLOR_HOST={tableId:'north-east',x:3-SEAT_DISTANCE,z:2.8,hover:.85,yaw:-.75*Math.PI} as const;

/** Chairs face their table; the host's seat stays empty for it to float in. */
export function parlorChairs():ParlorChair[]{
 return PARLOR_TABLES.flatMap(table=>SIDES
  .filter(([side])=>!(table.id===PARLOR_HOST.tableId&&side==='west'))
  .map(([side,dx,dz])=>({tableId:table.id,side,x:table.x+dx*SEAT_DISTANCE,z:table.z+dz*SEAT_DISTANCE,yaw:Math.atan2(-dx,-dz)})));
}

export type ParlorSpot='host'|'exit';
const finite=(p:RegionPoint)=>[p.x,p.y,p.z].every(Number.isFinite);
/** Like the outdoor interactions, a jump high above a spot does not reach it. */
export function nearbyParlorSpot(position:RegionPoint):ParlorSpot|undefined{
 if(!finite(position)||Math.abs(position.y-1.2)>1.5)return;
 const host=Math.hypot(position.x-PARLOR_HOST.x,position.z-PARLOR_HOST.z),exit=Math.hypot(position.x-PARLOR_EXIT.x,position.z-PARLOR_EXIT.z);
 if(host<=2.2&&host<exit)return 'host';
 if(exit<=1.6)return 'exit';
}
export function outsideParlor(position:RegionPoint):boolean{
 return !finite(position)||position.y< -1||position.y>PARLOR_ROOM.height+2
  ||position.x<PARLOR_ROOM.minX||position.x>PARLOR_ROOM.maxX||position.z<PARLOR_ROOM.minZ||position.z>PARLOR_ROOM.maxZ;
}

export const PARLOR_TALKS=['ichimoku_first','ichimoku_rules','ichimoku_bluff','ichimoku_nap'] as const;
export type ParlorTalkId=typeof PARLOR_TALKS[number];
/** The first conversation is the introduction; later visits cycle through the other topics. */
export function parlorTalk(previousTalks:number):ParlorTalkId{
 if(!Number.isInteger(previousTalks)||previousTalks<=0)return PARLOR_TALKS[0];
 return PARLOR_TALKS[1+(previousTalks-1)%(PARLOR_TALKS.length-1)];
}
