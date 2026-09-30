import { describe, expect, it } from 'vitest';
import { PALACE_LAYOUT, type PalaceLayout } from '../../src/domain/palace/palaceLayout';
import { createPalaceRun, stepPalaceRun, selectPalaceTarget, type PalaceRun } from '../../src/domain/palace/palaceRun';
const floor = {id:'floor',x:-20,y:0,width:80,height:1.28};
const layout = (over: Partial<PalaceLayout> = {}): PalaceLayout => ({width:100,platforms:[floor],guards:[],coins:[],checkpoints:[],goal:{x:70,y:0},spawn:{x:0,y:0},...over});
const tick = (s:PalaceRun,l:PalaceLayout,input = {}) => stepPalaceRun(s,{axis:0,jump:false,attack:false,dt:1/60,...input},l);
const advance = (s:PalaceRun,l:PalaceLayout,n:number,input = {}) => {for(let i=0;i<n;i++) s=tick(s,l,input); return s;};
const guard = (x:number,id='g') => ({id,x,y:0,minX:x,maxX:x});
describe('palace layout',()=>{
 it('converts every original solid and entity using the original spawn reference',()=>{
  expect(PALACE_LAYOUT.platforms).toHaveLength(16); expect(PALACE_LAYOUT.guards).toHaveLength(8);
  expect(PALACE_LAYOUT.coins).toHaveLength(25); expect(PALACE_LAYOUT.checkpoints).toHaveLength(3);
  expect(PALACE_LAYOUT.platforms[0]).toMatchObject({x:2.56,y:0,width:15.36,height:1.28});
  expect(PALACE_LAYOUT.spawn).toEqual({x:5.12,y:0}); expect(PALACE_LAYOUT.goal).toEqual({x:186.8,y:0});
 });
});
describe('palace movement',()=>{
 it('returns identity for zero time and finished runs and does not mutate inputs',()=>{
  const l=layout(),s=createPalaceRun(l),copy=structuredClone(s);
  expect(tick(s,l,{dt:0,jump:true})).toBe(s); tick(s,l,{jump:true}); expect(s).toEqual(copy);
  const done={...s,finished:true}; expect(tick(done,l)).toBe(done);
 });
 it('lands, hits ceilings and both solid sides without tunneling',()=>{
  const l=layout({platforms:[floor,{id:'wall',x:3,y:5,width:2,height:5},{id:'roof',x:-2,y:4,width:4,height:1}]});
  let s=createPalaceRun(l); s=advance(s,l,120,{axis:1}); expect(s.player.x).toBeCloseTo(2.6,5);
  s={...createPalaceRun(l),player:{...createPalaceRun(l).player,x:7}}; s=advance(s,l,120,{axis:-1}); expect(s.player.x).toBeCloseTo(5.4,5);
  s=tick(createPalaceRun(l),l,{jump:true}); s=advance(s,l,10); expect(s.player.y).toBeLessThanOrEqual(1.1); expect(s.player.vy).toBeLessThanOrEqual(0);
  s=advance(s,l,100); expect(s.player.y).toBe(0); expect(s.player.grounded).toBe(true);
 });
 it('allows one air jump and restores its budget only on landing',()=>{
  const l=layout(); let s=tick(createPalaceRun(l),l,{jump:true}); s=advance(s,l,12);
  s=tick(s,l,{jump:true}); expect(s.player.airJumped).toBe(true); expect(s.player.airJumpSpent).toBe(true);
  s=advance(s,l,5); const vy=s.player.vy; s=tick(s,l,{jump:true}); expect(s.player.vy).toBeLessThan(vy);
  s=advance(s,l,120); expect(s.player.airJumpSpent).toBe(false);
 });
 it('clamps long frames and patrols inside original bounds',()=>{
  const l=layout({guards:[{...guard(20),minX:19,maxX:21}]}); const s=createPalaceRun(l);
  expect(tick(s,l,{dt:100,axis:1})).toEqual(tick(s,l,{dt:.05,axis:1}));
  const n=advance(s,l,300); expect(n.guards[0].x).toBeGreaterThanOrEqual(19); expect(n.guards[0].x).toBeLessThanOrEqual(21);
 });
});
describe('palace combat and progress',()=>{
 it('ground slash hits once only during active time and only forward',()=>{
  const l=layout({guards:[guard(1.8),guard(-1.8,'back')]}); let s=tick(createPalaceRun(l),l,{attack:true});
  s=advance(s,l,5); expect(s.guards[0].defeated).toBe(false); s=advance(s,l,7);
  expect(s.guards[0].defeated).toBe(true); expect(s.guards[1].defeated).toBe(false); expect(s.player.swordHits).toEqual(['g']);
 });
 it('dashes toward a forward target, bounces, and preserves spent air jump',()=>{
  const l=layout({guards:[guard(6)]}); let s=tick(createPalaceRun(l),l,{jump:true}); s=tick(s,l,{jump:true});
  s=tick(s,l,{attack:true}); expect(s.player.homing?.targetId).toBe('g'); expect(s.player.swordSeconds).toBeNull();
  let bounced=false; for(let i=0;i<45;i++){s=tick(s,l);bounced ||=s.player.bounced;}
  expect(s.guards[0].defeated).toBe(true); expect(bounced).toBe(true); expect(s.player.airJumpSpent).toBe(true);
 });
 it('ignores defeated, backward and distant targets but locks through walls',()=>{
  const l=layout({guards:[guard(-4,'back'),guard(20,'far'),guard(6,'blocked')],platforms:[floor,{id:'wall',x:3,y:8,width:1,height:8}]});
  let s=tick(createPalaceRun(l),l,{jump:true}); s=tick(s,l,{attack:true}); expect(s.player.homing?.targetId).toBe('blocked'); expect(s.player.swordSeconds).toBeNull();
  const l2=layout({guards:[guard(5)]}); s=tick(createPalaceRun(l2),l2,{jump:true}); s.guards[0].defeated=true;
  expect(tick(s,l2,{attack:true}).player.homing).toBeNull();
 });
 it('contact damages once during invulnerability and death restores checkpoint while keeping progress',()=>{
  const l=layout({guards:[guard(0)],coins:[{x:0,y:1.12}],checkpoints:[{id:'cp',x:0,y:0,spawnX:5,spawnY:0}]});
  let s=tick(createPalaceRun(l),l); expect(s.player.health).toBe(2); expect(s.player.hurt).toBeGreaterThan(0);
  s=tick({...s,player:{...s.player,x:0,y:0}},l); expect(s.player.health).toBe(2);
  expect(s.collected).toEqual([0]); expect(s.checkpoint).toBe(0);
  s.guards[0].defeated=true; s={...s,player:{...s.player,y:-13}}; s=tick(s,l); expect(s.player.health).toBe(0);
  s=advance(s,l,60); expect(s.player.health).toBe(3); expect(s.player.x).toBe(5); expect(s.deaths).toBe(1); expect(s.guards[0].defeated).toBe(true); expect(s.collected).toEqual([0]);
 });
 it('requires grounding near the goal, then freezes; reset restores full original state',()=>{
  const l=layout({goal:{x:0,y:0},guards:[guard(20)]}); let s=createPalaceRun(l);
  s=tick(s,l,{jump:true}); expect(s.finished).toBe(false); s=advance(s,l,120); expect(s.finished).toBe(true);
  expect(tick(s,l,{axis:1})).toBe(s); expect(createPalaceRun(l).finished).toBe(false); expect(createPalaceRun(l).deaths).toBe(0);
 });
});

describe('Homing passage through palace solids', () => {
 it.each([1,-1] as const)('crosses walls facing %s and restores solid collision after the bounce', facing => {
  const wall={id:'wall',x:facing===1?3:-4,y:8,width:1,height:8};
  const l=layout({guards:[guard(facing*6)],platforms:[floor,wall]});
  let s=tick(createPalaceRun(l),l,{axis:facing,jump:true});
  s.player.airJumpSpent=true;
  expect(selectPalaceTarget(s,l)).toBe('g');
  s=tick(s,l,{attack:true});
  for(let i=0;i<40&&!s.guards[0].defeated;i++)s=tick(s,l);
  expect(s.guards[0].defeated).toBe(true);
  expect(s.player.x*facing).toBeGreaterThan(5);
  expect(s.player.airJumpSpent).toBe(true);
  s=advance(s,l,120,{axis:-facing});
  expect(s.player.x).toBeCloseTo(facing===1?4.4:-4.4,4);
 });
 it('crosses a platform underside and emerges above its solid volume before bouncing',()=>{
  const platform={id:'raised',x:3,y:3,width:6,height:2};
  const l=layout({platforms:[floor,platform],guards:[{...guard(6),y:3}]});
  let s=tick(createPalaceRun(l),l,{jump:true});s=tick(s,l,{attack:true});
  for(let i=0;i<40&&!s.guards[0].defeated;i++)s=tick(s,l);
  expect(s.guards[0].defeated).toBe(true);expect(s.player.y).toBeGreaterThanOrEqual(3);
  expect(s.player.vy).toBeGreaterThan(0);
 });
 it.each(['lost target','timeout'])('leaves no player embedded in a wall after %s',reason=>{
  const l=layout({platforms:[floor,{id:'wall',x:2,y:8,width:3,height:8}],guards:[guard(7)]});
  let s=tick(createPalaceRun(l),l,{jump:true});s=tick(s,l,{attack:true});
  for(let i=0;i<12&&s.player.x<2.5;i++)s=tick(s,l);
  expect(s.player.x).toBeGreaterThan(2.5);expect(s.player.homing).not.toBeNull();
  if(reason==='lost target')s.guards[0].defeated=true;else s.player.homing!.seconds=.65;
  s=tick(s,l);
  expect(s.player.homing).toBeNull();expect(s.player.x).toBeLessThanOrEqual(1.6);
 });
 it('still blocks ordinary sword damage across a wall',()=>{
  const l=layout({platforms:[floor,{id:'wall',x:.8,y:4,width:.25,height:4}],guards:[guard(1.8)]});
  let s=tick(createPalaceRun(l),l,{attack:true});s=advance(s,l,20);
  expect(s.guards[0].defeated).toBe(false);
 });
});
