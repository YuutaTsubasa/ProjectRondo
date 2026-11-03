import {COURSE_STAGES} from '../domain/course/courseStages';
import {PALACE_STAGES} from '../domain/palace/palaceStages';
import type {StageId} from '../domain/stage/stageIds';
export interface StageInfo {readonly id:StageId;readonly kind:'course'|'palace';readonly number:string;readonly title:string;readonly description:string;readonly times:readonly[number,number,number,number];readonly coins:number;readonly guards:number;readonly checkpoints:number;readonly objectives:readonly string[];readonly preview:string;}
export const STAGE_CATALOG:readonly StageInfo[]=[
 ...COURSE_STAGES.map(s=>({id:s.id,kind:'course' as const,number:s.number,title:s.title,description:s.description,times:s.times,coins:s.coins.length,guards:s.guards.length,checkpoints:s.gates.length-1,objectives:[s.objective,'啟動沿途紀錄點','收集金幣並突破騎士守衛'],preview:'/stages/palace-skyway.webp'})),
 ...PALACE_STAGES.map(s=>({id:s.id,kind:'palace' as const,number:s.number,title:s.id==='palace'?'白宮引水道':s.title,description:s.description,times:s.times,coins:s.layout.coins.length,guards:s.layout.guards.filter(g=>g.countsForScore!==false).length,checkpoints:s.layout.checkpoints.length,objectives:['抵達末端閘門',s.layout.guards.some(g=>g.kind==='azure-core')?'沿蒼藍核心穿越缺口':'運用二段跳與空中盾衝穿越缺口','收集金幣並突破騎士守衛'],preview:'/stages/palace-aqueduct.webp'})),
];
export function getStageInfo(id:string):StageInfo {const info=STAGE_CATALOG.find(s=>s.id===id);if(!info)throw Error('Unknown stage '+id);return info;}
