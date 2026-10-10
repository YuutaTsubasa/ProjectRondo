import { expect, it } from 'vitest';
import { createCourseCombat, stepCourseCombat, hitCourseGuard, recoverCourseCombat, COURSE_GUARD_SPAWNS } from '../../src/domain/course/courseCombat';
import { COURSE_PLATFORMS } from '../../src/domain/course/courseLayout';
const near = {x:-3,y:1,z:20};
const step = (s:ReturnType<typeof createCourseCombat>,n:number,immune=false) => {for(let i=0;i<n;i++)s=stepCourseCombat(s,near,.05,immune);return s;};
it('patrols only supported broad platforms, keeping landing and respawn lanes clear',()=>{
 expect(COURSE_GUARD_SPAWNS.length).toBeGreaterThanOrEqual(10);
 let s=createCourseCombat();for(let i=0;i<600;i++)s=stepCourseCombat(s,{x:100,y:1,z:100},.05,false);
 for(const g of s.guards){const p=COURSE_PLATFORMS[g.platform];expect(Math.abs(g.x-p.center.x)).toBeLessThan(p.width/2-.5);expect(g.y).toBe(p.center.y);}
});
it('telegraphs before hitting, then grants invulnerability against overlapping guards',()=>{
 let s={...createCourseCombat(),invulnerable:0};s=step(s,5);expect(s.health).toBe(3);expect(s.guards[0].phase).toBe('windup');
 s=step(s,11);expect(s.health).toBe(2);expect(s.damage).toBe(1);
 s=step(s,5);expect(s.health).toBe(2);
});
it('sword or homing target hits defeat once, cancel a pending strike and reset on retry',()=>{
 let s=step(createCourseCombat(),5);s=hitCourseGuard(s,0);s=hitCourseGuard(s,0);expect(s.defeated).toBe(1);
 s=step(s,15);expect(s.health).toBe(3);expect(s.guards[0].phase).toBe('defeated');
 const healed=recoverCourseCombat({...s,health:0,damage:3});expect(healed.health).toBe(3);expect(healed.defeated).toBe(1);
 expect(createCourseCombat().defeated).toBe(0);
});
it('does not hit an airborne/dashing player or advance invalid delta',()=>{
 expect(step(createCourseCombat(),20,true).health).toBe(3);
 const s=createCourseCombat();expect(stepCourseCombat(s,near,NaN,false)).toBe(s);
});
