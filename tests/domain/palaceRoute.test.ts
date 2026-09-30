import { expect, it } from 'vitest';
import { PALACE_LAYOUT, type PalaceLayout } from '../../src/domain/palace/palaceLayout';
import { createPalaceRun, stepPalaceRun, selectPalaceTarget } from '../../src/domain/palace/palaceRun';
it('previews exactly the airborne forward target selected for a dash',()=>{
 const l:PalaceLayout={width:30,platforms:[{id:'floor',x:0,y:0,width:30,height:1.28}],spawn:{x:2,y:0},goal:{x:29,y:0},coins:[],checkpoints:[],guards:[{id:'g',x:8,y:0,minX:8,maxX:8}]};
 let s=createPalaceRun(l);expect(selectPalaceTarget(s,l)).toBeNull();
 s=stepPalaceRun(s,{axis:0,jump:true,attack:false,dt:1/60},l);
 expect(selectPalaceTarget(s,l)).toBe('g');
 expect(stepPalaceRun(s,{axis:0,jump:false,attack:true,dt:1/60},l).player.homing?.targetId).toBe(selectPalaceTarget(s,l));
});
it('completes the entire original stage from inputs without teleporting',()=>{
 let s=createPalaceRun();
 for(let frame=0;frame<60*65 && !s.finished;frame++) {
  const p=s.player;
  const support=PALACE_LAYOUT.platforms.find(b=>Math.abs(p.y-b.y)<.01 && p.x>=b.x-.4 && p.x<b.x+b.width+.4);
  const jump=p.x<PALACE_LAYOUT.goal.x-3 && (p.grounded ? !!support && p.x>support.x+support.width-1.2 : !p.airJumpSpent && !p.homing && p.vy<.5);
  s=stepPalaceRun(s,{axis:Math.max(-1,Math.min(1,(PALACE_LAYOUT.goal.x-p.x)*.4)),jump,attack:frame%12===0,dt:1/60});

 }
 expect({finished:s.finished,deaths:s.deaths,x:s.player.x,y:s.player.y,checkpoint:s.checkpoint}).toMatchObject({finished:true,deaths:0,checkpoint:2});
});
