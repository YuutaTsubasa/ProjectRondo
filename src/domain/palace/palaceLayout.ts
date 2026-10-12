import source from '../../../public/palace/stage-1-1.json';
export interface PalacePoint { x: number; y: number }
export interface PalacePlatform extends PalacePoint { id: string; width: number; height: number }
export interface PalaceGuardSpawn extends PalacePoint {
 id:string; minX:number; maxX:number; kind?:'guard'|'azure-core';
 countsForScore?:boolean; respawnSeconds?:number;
}
export interface PalaceCheckpoint extends PalacePoint { id: string; spawnX: number; spawnY: number }
export interface PalaceLayout {
  width: number;
  platforms: readonly PalacePlatform[];
  guards: readonly PalaceGuardSpawn[];
  coins: readonly PalacePoint[];
  checkpoints: readonly PalaceCheckpoint[];
  goal: PalacePoint;
  spawn: PalacePoint;
}
/** Pinned ProjectAlmost runtime data: source pixels, grounded feet and airborne centers. */
export interface PalaceStageSource {
 id:string;rankTargets:{sTime:number;aTime:number;bTime:number;cTime:number};
 world:{width:number;height:number;tileSize:number};
 platforms:readonly {col:number;row:number;width:number;height:number}[];
 enemies:readonly {id:string;type?:string;x:number;y?:number;surfaceY?:number;patrolMinX:number;patrolMaxX:number;countsForScore?:boolean;respawnPolicy?:string;respawnDelayMs?:number}[];
 coins:readonly PalacePoint[];
 checkpoints:readonly {id:string;x:number;surfaceY:number;spawnX:number;spawnSurfaceY:number}[];
 goal:{x:number;surfaceY:number};playerSpawn:{x:number;surfaceY:number};
}
const scale=50;
const y=(sourceY:number)=>(512-sourceY)/scale;
export function convertPalaceLayout(source:PalaceStageSource):PalaceLayout {
 return {
  width:source.world.width/scale,
  platforms:source.platforms.map((p,i)=>({id:`platform-${i}`,x:p.col*source.world.tileSize/scale,y:y(p.row*source.world.tileSize),width:p.width*source.world.tileSize/scale,height:p.height*source.world.tileSize/scale})),
  guards:source.enemies.map(g=>{
   const core=g.type==='azure-core',sourceY=core?g.y:g.surfaceY;
   if(!Number.isFinite(sourceY))throw new Error(`Invalid palace enemy coordinate: ${g.id}`);
   return {id:g.id,kind:core?'azure-core':'guard',x:g.x/scale,y:y(sourceY!),minX:g.patrolMinX/scale,maxX:g.patrolMaxX/scale,
    countsForScore:g.countsForScore??!core,respawnSeconds:(g.respawnPolicy??(core?'regenerate':'persistent'))==='regenerate'?(g.respawnDelayMs??1400)/1000:undefined};
  }),
  coins:source.coins.map(c=>({x:c.x/scale,y:y(c.y)})),
  checkpoints:source.checkpoints.map(c=>({id:c.id,x:c.x/scale,y:y(c.surfaceY),spawnX:c.spawnX/scale,spawnY:y(c.spawnSurfaceY)})),
  goal:{x:source.goal.x/scale,y:y(source.goal.surfaceY)},spawn:{x:source.playerSpawn.x/scale,y:y(source.playerSpawn.surfaceY)},
 };
}
/** Original 1-1 remains the default for existing entries and callers. */
export const PALACE_LAYOUT=convertPalaceLayout(source);
