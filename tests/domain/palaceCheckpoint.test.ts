import { describe, expect, it } from 'vitest';
import { createPalaceRun, stepPalaceRun, type PalaceRun } from '../../src/domain/palace/palaceRun';
import type { PalaceLayout } from '../../src/domain/palace/palaceLayout';

const layout: PalaceLayout = {
  width:40, spawn:{x:0,y:0}, goal:{x:39,y:0}, coins:[], guards:[],
  platforms:[{id:'floor',x:-5,y:0,width:45,height:1.28}],
  checkpoints:[{id:'first',x:5,y:0,spawnX:6,spawnY:0},{id:'second',x:15,y:0,spawnX:16,spawnY:0}],
};
const tick=(s:PalaceRun,dt=1/60)=>stepPalaceRun(s,{axis:0,jump:false,attack:false,dt},layout);

describe('palace airborne checkpoints',()=>{
  it.each([0,1.5,3.5])('activates near the beacon with feet at height %s',y=>{
    const s=createPalaceRun(layout);Object.assign(s.player,{x:5,y,grounded:y===0,vy:0});
    expect(tick(s).checkpoint).toBe(0);
  });
  it.each([{x:5,y:6},{x:5,y:-2.5},{x:8,y:1.5}])('does not trigger outside the beacon volume %j',point=>{
    const s=createPalaceRun(layout);Object.assign(s.player,{...point,grounded:false});
    expect(tick(s).checkpoint).toBe(-1);
  });
  it('activates during a fast Homing pass without landing',()=>{
    const stage={...layout,guards:[{id:'g',x:10,y:2,minX:10,maxX:10}]};
    let s=createPalaceRun(stage);Object.assign(s.player,{x:3.8,y:2,grounded:false,coyote:0});
    s=stepPalaceRun(s,{axis:0,jump:false,attack:true,dt:.05},stage);
    expect(s.player.homing?.targetId).toBe('g');expect(s.player.grounded).toBe(false);
    expect(s.checkpoint).toBe(0);
  });
  it('respawns on the authored safe ground after an airborne activation and preserves the latest checkpoint',()=>{
    let s=createPalaceRun(layout);Object.assign(s.player,{x:15,y:2,grounded:false});s=tick(s);
    expect(s.checkpoint).toBe(1);
    Object.assign(s.player,{x:5,y:2});s=tick(s);expect(s.checkpoint).toBe(1);
    s.player.y=-13;s=tick(s);for(let i=0;i<50;i++)s=tick(s);
    expect(s.player).toMatchObject({x:16,y:0,grounded:true,health:3});
    expect(createPalaceRun(layout).checkpoint).toBe(-1);
  });
});
