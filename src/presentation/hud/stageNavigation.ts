export interface StagePoint { x:number; y:number }
/** A fixed 40-unit local radius; positive world y (or z) points up. */
export function projectStagePoint(point:StagePoint,player:StagePoint,clamp=false):StagePoint {
 let x=(point.x-player.x)*2.5,y=-(point.y-player.y)*2.5;
 const length=Math.hypot(x,y);
 if(clamp&&length>72){x=x/length*72;y=y/length*72;}
 return {x:100+x,y:100+y};
}
export const stageHeading=(facing:StagePoint):number=>Math.atan2(facing.x,facing.y)*180/Math.PI;
