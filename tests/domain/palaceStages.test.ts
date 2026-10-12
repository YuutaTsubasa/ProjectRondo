import {expect,it} from 'vitest';
import {PALACE_LAYOUT} from '../../src/domain/palace/palaceLayout';
import {PALACE_STAGES,getPalaceStage} from '../../src/domain/palace/palaceStages';
import {createPalaceRun,stepPalaceRun,selectPalaceTarget,palaceEnemyScore} from '../../src/domain/palace/palaceRun';
it('imports all five non-boss courses with finite original coordinates and score targets',()=>{
 expect(PALACE_STAGES.map(s=>s.number)).toEqual(['1-1','1-2','1-3','1-4','1-5']);
 expect(getPalaceStage().layout).toBe(PALACE_LAYOUT);
 expect(()=>getPalaceStage('palace-1-6')).toThrow();
 const expected=[[192,16,25,8,3],[128,5,17,15,2],[240.64,13,31,31,2],[256,19,29,20,2],[583.68,40,57,41,4]];
 PALACE_STAGES.forEach((stage,i)=>{
  const l=stage.layout;
  expect([l.width,l.platforms.length,l.coins.length,l.guards.length,l.checkpoints.length]).toEqual(expected[i]);
  for(const p of [...l.platforms,...l.coins,...l.guards,...l.checkpoints,l.goal,l.spawn])expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);
  expect(palaceEnemyScore(createPalaceRun(l),l)).toEqual({defeated:0,target:[8,3,4,10,21][i]});
 });
 expect(getPalaceStage('palace-1-2').times).toEqual([18,24,34,48]);
 expect(getPalaceStage('palace-1-5').times).toEqual([66,84,110,145]);
});
it('keeps core centers separate from guard feet and restores them safely after defeat',()=>{
 const l=getPalaceStage('palace-1-2').layout;
 const core=l.guards.find(g=>g.id==='core-tutorial-a')!;
 expect(core).toMatchObject({kind:'azure-core',x:24.4,y:2.44,countsForScore:false,respawnSeconds:1.4});
 let s=createPalaceRun(l);s.guards[0].defeated=true;
 const tick=()=>{s=stepPalaceRun(s,{axis:0,jump:false,attack:false,dt:1/60},l);};
 for(let i=0;i<70;i++)tick();expect(s.guards[0].defeated).toBe(true);
 s.player.x=core.x;s.player.y=core.y-0.95;s.player.invulnerable=99;
 for(let i=0;i<30;i++){s.player.x=core.x;s.player.y=core.y-0.95;tick();}
 expect(s.guards[0].defeated).toBe(true);
 s.player.x=l.spawn.x;s.player.y=0;tick();expect(s.guards[0].defeated).toBe(false);
 expect(s.guards[0].x).toBe(core.x);expect(s.guards[0].y).toBe(core.y);
 expect(palaceEnemyScore(s,l)).toEqual({defeated:0,target:3});
});
it('chains airborne cores with an air-jump refill and leaves ordinary guard bounce unchanged',()=>{
 const l=getPalaceStage('palace-1-2').layout;let s=createPalaceRun(l);
 s.player.x=21;s.player.y=1;s.player.grounded=false;s.player.airJumpSpent=true;
 expect(selectPalaceTarget(s,l)).toBe('core-tutorial-a');
 for(let frame=0;frame<90&&!s.guards[0].defeated;frame++)s=stepPalaceRun(s,{axis:1,jump:false,attack:frame===0,dt:1/60},l);
 expect(s.guards[0].defeated).toBe(true);expect(s.player.airJumpSpent).toBe(false);
 expect(s.player.y).toBeCloseTo(2.44-.95,1);
 expect(selectPalaceTarget(s,l)).toBe('core-tutorial-b');
});
it.each(['palace-1-2','palace-1-3','palace-1-4','palace-1-5'])('completes %s from inputs without teleporting',id=>{
 const l=getPalaceStage(id).layout;let s=createPalaceRun(l);
 for(let frame=0;frame<60*180&&!s.finished;frame++){
  const p=s.player,support=l.platforms.find(b=>Math.abs(p.y-b.y)<.01&&p.x>=b.x-.4&&p.x<b.x+b.width+.4);
  // Do not spend the air jump above an already reachable landing: that can
  // overshoot the short lower terraces before the next elevated platform.
  const landing=l.platforms.some(b=>{
   const discriminant=p.vy*p.vy+60*(p.y-b.y);if(discriminant<0)return false;
   const t=(p.vy+Math.sqrt(discriminant))/30,x=p.x+10*t;
   return t>0&&x>b.x-.3&&x<b.x+b.width+.3;
  });
  const jump=p.x<l.goal.x-3&&(p.grounded?!!support&&p.x>support.x+support.width-1.2:!p.airJumpSpent&&!p.homing&&p.vy<.5&&!landing);
  const attack=!!selectPalaceTarget(s,l)||(p.grounded&&s.guards.some(g=>!g.defeated&&g.x>p.x&&g.x-p.x<3));
  s=stepPalaceRun(s,{axis:Math.max(-1,Math.min(1,(l.goal.x-p.x)*.4)),jump,attack,dt:1/60},l);
 }
 expect({finished:s.finished,deaths:s.deaths,x:s.player.x}).toMatchObject({finished:true,deaths:0});
});
