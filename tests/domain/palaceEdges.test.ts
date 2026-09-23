import { expect, it } from 'vitest';
import type { PalaceLayout } from '../../src/domain/palace/palaceLayout';
import { createPalaceRun, stepPalaceRun } from '../../src/domain/palace/palaceRun';
const l:PalaceLayout={width:50,platforms:[{id:'floor',x:-10,y:0,width:20,height:1.28}],guards:[],coins:[],checkpoints:[],spawn:{x:0,y:0},goal:{x:40,y:0}};
const tick=(s:ReturnType<typeof createPalaceRun>, input={})=>stepPalaceRun(s,{axis:0,jump:false,attack:false,dt:1/60,...input},l);
it('uses coyote time for a late ledge jump without spending the air jump',()=>{
 const initial=createPalaceRun(l);
 const walking={...initial,player:{...initial.player,x:10.39,vx:10}};
 let s=tick(walking,{axis:1}); expect(s.player.grounded).toBe(false); expect(s.player.coyote).toBeGreaterThan(0);
 s=tick(s,{jump:true});expect(s.player.vy).toBeGreaterThan(12);expect(s.player.airJumpSpent).toBe(false);
});
it('buffers a used-air-jump press until landing and launches on the next substep',()=>{
 const initial=createPalaceRun(l);
 let s={...initial,player:{...initial.player,y:.1,vy:-3,grounded:false,coyote:0,airJumpSpent:true}};
 s=tick(s,{jump:true}); expect(s.player.jumpBuffer).toBeGreaterThan(0);
 for(let i=0;i<5;i++)s=tick(s);
 expect(s.player.vy).toBeGreaterThan(0);expect(s.player.y).toBeGreaterThan(0);expect(s.player.airJumpSpent).toBe(false);
});
it('expires a homing dash at its time limit without refreshing the air jump',()=>{
 const stage={...l,guards:[{id:'target',x:8,y:0,minX:8,maxX:8}]}; const initial=createPalaceRun(stage);
 const s=stepPalaceRun({...initial,player:{...initial.player,y:3,grounded:false,coyote:0,airJumpSpent:true,homing:{targetId:'target',seconds:.645}}},{axis:0,jump:false,attack:false,dt:.05},stage);
 expect(s.player.homing).toBeNull();expect(s.player.airJumpSpent).toBe(true);expect(s.guards[0].defeated).toBe(false);
});
it('cancels a dash when its guard disappears and handles left-facing homing symmetrically',()=>{
 const stage={...l,guards:[{id:'target',x:-5,y:0,minX:-5,maxX:-5}]};let s=createPalaceRun(stage);
 s=stepPalaceRun(s,{axis:-1,jump:true,attack:false,dt:1/60},stage);
 s=stepPalaceRun(s,{axis:-1,jump:false,attack:true,dt:1/60},stage);
 expect(s.player.homing?.targetId).toBe('target');expect(s.player.vx).toBeLessThan(0);
 s={...s,guards:s.guards.map(g=>({...g,defeated:true}))};
 expect(stepPalaceRun(s,{axis:0,jump:false,attack:false,dt:1/60},stage).player.homing).toBeNull();
});
