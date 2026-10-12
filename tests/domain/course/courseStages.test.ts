import {describe,expect,it} from 'vitest';
import {COURSE_STAGES,getCourseStage} from '../../../src/domain/course/courseStages';
import {COURSE_MOVEMENT as m} from '../../../src/domain/course/courseMovement';
import {selectHomingTarget} from '../../../src/domain/hub/character/homingTarget';
import {createCourseCombat,stepCourseCombat} from '../../../src/domain/course/courseCombat';
import {vec3} from '../../../src/domain/math/vec3';
it('offers the original route and four distinct longer challenge courses',()=>{
 expect(COURSE_STAGES.map(s=>s.id)).toEqual(['course','course-2','course-3','course-4','course-5']);
 expect(getCourseStage()).toBe(COURSE_STAGES[0]);expect(getCourseStage('unknown')).toBe(COURSE_STAGES[0]);
 expect(new Set(COURSE_STAGES.map(s=>JSON.stringify(s.platforms))).size).toBe(5);
 for(const s of COURSE_STAGES){expect(s.coins.length).toBeGreaterThan(20);expect(s.gates.length).toBeGreaterThanOrEqual(4);}
});
for(const s of COURSE_STAGES)describe(s.id,()=>{
 it('supports every gate, spawn, coin and guard',()=>{
  expect(s.spawn).toEqual(s.gates[0].spawn);
  for(const g of s.gates){const p=s.platforms.find(p=>Math.abs(p.center.x-g.center.x)+g.halfWidth<p.width/2&&Math.abs(p.center.z-g.center.z)+g.halfDepth<p.depth/2);expect(p).toBeDefined();expect(g.center.y).toBeCloseTo(p!.center.y+1);expect(g.spawn.y).toBeCloseTo(g.center.y+.3);}
  for(const c of s.coins)expect(s.platforms.some(p=>Math.abs(p.center.x-c.x)<p.width/2-.5&&Math.abs(p.center.z-c.z)<p.depth/2-.5&&c.y>=p.center.y+.5&&c.y<=p.center.y+1.8)).toBe(true);
  let combat=createCourseCombat(s);for(let i=0;i<120;i++)combat=stepCourseCombat(combat,vec3(100,100,100),.05,false,s);
  for(const g of combat.guards){const p=s.platforms[g.platform];expect(Math.abs(g.x-p.center.x)).toBeLessThan(p.width/2-.5);expect(g.y).toBe(p.center.y);}
 });
 it('keeps required running jumps reachable with clearance and 25% speed margin',()=>{
  for(const [a,b]of s.jumps){const from=s.platforms[a],to=s.platforms[b],gap=to.center.z-to.depth/2-from.center.z-from.depth/2;
   const disc=m.jumpSpeed**2-2*m.gravity*(to.center.y-from.center.y);expect(disc).toBeGreaterThan(0);
   expect(gap+1.5).toBeLessThan(m.runSpeed*.75*(m.jumpSpeed+Math.sqrt(disc))/m.gravity);
   const overlap=Math.min(from.center.x+from.width/2,to.center.x+to.width/2)-Math.max(from.center.x-from.width/2,to.center.x-to.width/2);expect(overlap).toBeGreaterThanOrEqual(3);
  }
 });
 it('selects each authored homing link and lands safely after its final bounce',()=>{
  for(const chain of s.chains){const start=s.platforms[chain.from],end=s.platforms[chain.to];let from=vec3(start.center.x,start.center.y+1.7,start.center.z+start.depth/2-1),forward=vec3(0,0,1);
   for(const index of chain.crystals){const c=s.crystals[index];expect(selectHomingTarget(from,forward,[...s.crystals,...s.guards.map(g=>vec3(g.x,g.y+1,g.z))],m)).toBe(index);
    expect(Math.hypot(c.x-from.x,c.y-from.y,c.z-from.z)).toBeLessThan(m.homingRange*.7);
    forward=vec3(c.x-from.x,0,c.z-from.z);from=vec3(c.x,c.y+m.homingBounceSpeed*.25-m.gravity*.25**2/2,c.z);
   }
   const c=s.crystals[chain.crystals.at(-1)!],drop=c.y-end.center.y-1;
   const flight=(m.homingBounceSpeed+Math.sqrt(m.homingBounceSpeed**2+2*m.gravity*drop))/m.gravity;
   expect(Math.max(0,end.center.z-end.depth/2+1-c.z)).toBeLessThan(m.maxSpeed*(flight-m.maxSpeed/m.acceleration/2));
  }
 });
});

it('places every coin before the final gate so a full collection is possible',()=>{
 for(const s of COURSE_STAGES){const goal=s.gates.at(-1)!;for(const c of s.coins)expect(c.z).toBeLessThan(goal.center.z-goal.halfDepth-.5);}
});
