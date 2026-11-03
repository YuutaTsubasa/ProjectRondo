import type { Vec3 } from '../math/vec3';
import { COURSE_PLATFORMS,COURSE_GUARD_SPAWNS,type CourseGuardSpawn,type CoursePlatform } from './courseLayout';
export {COURSE_GUARD_SPAWNS} from './courseLayout';
interface CombatLayout {guards:readonly CourseGuardSpawn[];platforms:readonly CoursePlatform[]}
const DEFAULT_LAYOUT:CombatLayout={guards:COURSE_GUARD_SPAWNS,platforms:COURSE_PLATFORMS};
export const COURSE_GUARD_ATTACK_RADIUS = 2.6;
export type GuardPhase = 'patrol'|'windup'|'strike'|'recover'|'defeated';
export interface CourseGuard {id:number;platform:number;x:number;y:number;z:number;yaw:number;direction:number;phase:GuardPhase;timer:number}
export interface CourseCombat {guards:readonly CourseGuard[];health:number;damage:number;defeated:number;invulnerable:number}
export const createCourseCombat=(layout:CombatLayout=DEFAULT_LAYOUT):CourseCombat=>({guards:layout.guards.map(g=>({...g,yaw:Math.PI/2,direction:1,phase:'patrol',timer:0})),health:3,damage:0,defeated:0,invulnerable:1.2});
export function hitCourseGuard(state:CourseCombat,id:number):CourseCombat {
 const target=state.guards[id];if(!target||target.phase==='defeated'||state.health<=0)return state;
 return {...state,defeated:state.defeated+1,guards:state.guards.map(g=>g.id===id?{...g,phase:'defeated',timer:0}:g)};
}
export function recoverCourseCombat(state:CourseCombat):CourseCombat {
 return {...state,health:3,invulnerable:1.5,guards:state.guards.map(g=>g.phase==='defeated'?g:{...g,phase:'patrol',timer:0})};
}
/** Bounded patrol and a committed, visible windup. Damage occurs once at strike entry. */
export function stepCourseCombat(state:CourseCombat,player:Vec3,delta:number,immune:boolean,layout:CombatLayout=DEFAULT_LAYOUT):CourseCombat {
 if(!Number.isFinite(delta)||delta<=0||state.health<=0)return state;
 const dt=Math.min(.05,delta);let health=state.health,damage=state.damage,invulnerable=Math.max(0,state.invulnerable-dt);
 const guards=state.guards.map(original=>{
  const g={...original};if(g.phase==='defeated'){g.timer=Math.min(1,g.timer+dt);return g;}
  const dx=player.x-g.x,dz=player.z-g.z,distance=Math.hypot(dx,dz);
  const sameHeight=Math.abs(player.y-(g.y+1))<1.45;
  if(g.phase==='patrol'){
   if(sameHeight&&distance<COURSE_GUARD_ATTACK_RADIUS){g.phase='windup';g.timer=.65;g.yaw=Math.atan2(dx,dz);}
   else{const spawn=layout.guards[g.id],p=layout.platforms[g.platform];
    const lo=Math.max(p.center.x-p.width/2+1,spawn.x-1.65),hi=Math.min(p.center.x+p.width/2-1,spawn.x+1.65);
    const nx=g.x+g.direction*1.15*dt;g.x=Math.max(lo,Math.min(hi,nx));if(nx>=hi||nx<=lo)g.direction*=-1;g.yaw=g.direction*Math.PI/2;}
  }else{
   g.timer-=dt;
   if(g.timer<=0){
    if(g.phase==='windup'){
     g.phase='strike';g.timer=.22;
     const forward=distance<.1?1:(dx*Math.sin(g.yaw)+dz*Math.cos(g.yaw))/distance;
     if(!immune&&invulnerable<=0&&sameHeight&&distance<COURSE_GUARD_ATTACK_RADIUS&&forward>.25){health=Math.max(0,health-1);damage++;invulnerable=1.35;}
    }else if(g.phase==='strike'){g.phase='recover';g.timer=.8;}
    else {g.phase='patrol';g.timer=0;}
   }
  }
  return g;
 });
 return {guards,health,damage,invulnerable,defeated:state.defeated};
}
