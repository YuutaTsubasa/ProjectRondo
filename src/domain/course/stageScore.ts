/** Scoring rules from ProjectAlmost revision 76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc,
 * src/domain/gameplay/stageResult.ts; times in seconds, not milliseconds. */
export const PALACE_RANK_TIMES = [30,42,58,78] as const;
/** Initial targets for Rondo's original 3D trial; tune independently from Palace. */
export const COURSE_RANK_TIMES = [45,65,90,120] as const;
export interface StageScoreInput {
 elapsed:number;times:readonly [number,number,number,number];
 coins:number;coinTarget:number;enemies:number;enemyTarget:number;
 checkpoints:number;checkpointTarget:number;damage:number;falls:number;
}
export type StageRank='S'|'A'|'B'|'C'|'D';
export interface StageScore {total:number;rank:StageRank;time:number;coins:number;enemies:number;checkpoints:number;penalty:number}
export function scoreStage(s:StageScoreInput):StageScore {
 const ratio=(value:number,target:number,max:number)=>target<=0?max:Math.floor(Math.max(0,Math.min(1,value/target))*max);
 const time=s.elapsed<=s.times[0]?300:s.elapsed<=s.times[1]?240:s.elapsed<=s.times[2]?170:s.elapsed<=s.times[3]?100:Math.max(0,100-Math.floor(s.elapsed-s.times[3])*3);
 const coins=ratio(s.coins,s.coinTarget,200),enemies=ratio(s.enemies,s.enemyTarget,150),checkpoints=ratio(s.checkpoints,s.checkpointTarget,50);
 const penalty=Math.max(0,s.damage)*80+Math.max(0,s.falls)*180;
 const total=300+time+coins+enemies+checkpoints-penalty;
 return {total,rank:total>=850?'S':total>=700?'A':total>=550?'B':total>=400?'C':'D',time,coins,enemies,checkpoints,penalty};
}
