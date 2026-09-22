import { SWORD_ACTIVE_END, SWORD_ACTIVE_START, SWORD_DURATION } from '../hub/character/swordAttack';
import { PALACE_LAYOUT, type PalaceLayout, type PalacePoint } from './palaceLayout';

export const PALACE_BODY_WIDTH = .8;
export const PALACE_BODY_HEIGHT = 1.9;
const HALF = PALACE_BODY_WIDTH / 2;
const EPS = 1e-6;
export interface PalacePlayer extends PalacePoint {
  vx:number; vy:number; facing:1|-1; grounded:boolean; airJumpSpent:boolean;
  jumpBuffer:number; coyote:number; health:number; invulnerable:number; hurt:number; deadFor:number;
  swordSeconds:number|null; swordHits:string[];
  homing:{targetId:string;seconds:number}|null; airJumped:boolean; bounced:boolean;
}
export interface PalaceGuard extends PalacePoint { id:string; direction:1|-1; defeated:boolean; defeatedFor:number }
export interface PalaceRun {
  player:PalacePlayer; guards:PalaceGuard[]; collected:number[]; checkpoint:number;
  elapsed:number; deaths:number; finished:boolean;
}
export interface PalaceInput { axis:number; jump:boolean; attack:boolean; dt:number }
function playerAt(point:PalacePoint):PalacePlayer {
  return {...point,vx:0,vy:0,facing:1,grounded:true,airJumpSpent:false,jumpBuffer:0,coyote:.12,
    health:3,invulnerable:0,hurt:0,deadFor:0,swordSeconds:null,swordHits:[],homing:null,airJumped:false,bounced:false};
}
export function createPalaceRun(layout:PalaceLayout=PALACE_LAYOUT):PalaceRun {
  const player=playerAt(layout.spawn); player.grounded=supported(player,layout); player.coyote=player.grounded?.12:0;
  return {player,guards:layout.guards.map(g=>({id:g.id,x:g.x,y:g.y,direction:1,defeated:false,defeatedFor:0})),
    collected:[],checkpoint:-1,elapsed:0,deaths:0,finished:false};
}
function supported(p:PalacePlayer,l:PalaceLayout):boolean {
  return l.platforms.some(b=>Math.abs(p.y-b.y)<EPS && p.x+HALF>b.x+EPS && p.x-HALF<b.x+b.width-EPS);
}
/** Open segment/solid intersection avoids targeting through floor edges or walls. */
function clearLine(a:PalacePoint,b:PalacePoint,l:PalaceLayout):boolean {
  return !l.platforms.some(box=>{
    let near=0,far=1;
    for(const [origin,delta,min,max] of [[a.x,b.x-a.x,box.x+EPS,box.x+box.width-EPS],[a.y,b.y-a.y,box.y-box.height+EPS,box.y-EPS]]) {
      if(Math.abs(delta)<EPS) { if(origin<=min || origin>=max) return false; }
      else { const t1=(min-origin)/delta,t2=(max-origin)/delta; near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));if(near>=far)return false; }
    }
    return near<far && far>0 && near<1;
  });
}
function center(p:PalacePoint):PalacePoint {return {x:p.x,y:p.y+PALACE_BODY_HEIGHT/2};}
function targetFor(p:PalacePlayer,guards:PalaceGuard[],l:PalaceLayout):PalaceGuard|undefined {
  return guards.filter(g=>!g.defeated && (g.x-p.x)*p.facing>0 && Math.hypot(g.x-p.x,g.y-p.y)<=12 && clearLine(center(p),center(g),l))
    .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
}
/** The reticle and attack input share this exact eligibility decision. */
export function selectPalaceTarget(state:PalaceRun,layout:PalaceLayout=PALACE_LAYOUT):string|null {
  const p=state.player;
  if(state.finished || p.health<=0 || p.grounded || p.hurt>0 || p.swordSeconds!==null)return null;
  if(p.homing)return state.guards.some(g=>g.id===p.homing!.targetId && !g.defeated)?p.homing.targetId:null;
  return targetFor(p,state.guards,layout)?.id??null;
}
function move(p:PalacePlayer,l:PalaceLayout,dt:number):boolean {
  let blocked=false;
  const oldX=p.x,nextX=p.x+p.vx*dt;
  p.x=nextX;
  for(const b of l.platforms) {
    if(p.y>=b.y-EPS || p.y+PALACE_BODY_HEIGHT<=b.y-b.height+EPS)continue;
    if(p.vx>0 && oldX+HALF<=b.x+EPS && p.x+HALF>=b.x) {p.x=b.x-HALF;p.vx=0;blocked=true;}
    else if(p.vx<0 && oldX-HALF>=b.x+b.width-EPS && p.x-HALF<=b.x+b.width) {p.x=b.x+b.width+HALF;p.vx=0;blocked=true;}
  }
  const oldY=p.y; p.y+=p.vy*dt;p.grounded=false;
  for(const b of l.platforms) {
    if(p.x+HALF<=b.x+EPS || p.x-HALF>=b.x+b.width-EPS)continue;
    if(p.vy<=0 && oldY>=b.y-EPS && p.y<=b.y) {p.y=b.y;p.vy=0;p.grounded=true;blocked=true;}
    else if(p.vy>0 && oldY+PALACE_BODY_HEIGHT<=b.y-b.height+EPS && p.y+PALACE_BODY_HEIGHT>=b.y-b.height) {p.y=b.y-b.height-PALACE_BODY_HEIGHT;p.vy=0;blocked=true;}
  }
  p.grounded ||= supported(p,l) && p.vy<=0;
  return blocked;
}
function defeat(g:PalaceGuard):void {g.defeated=true;g.defeatedFor=0;}
function die(s:PalaceRun):void {s.player.health=0;s.player.deadFor=.7;s.player.homing=null;s.player.swordSeconds=null;s.player.vx=0;s.player.vy=0;s.deaths++;}
function approach(value:number,target:number,amount:number):number {return value<target?Math.min(target,value+amount):Math.max(target,value-amount);}
/** Pure fixed-substep simulation. Jump and attack are press edges supplied by the input adapter. */
export function stepPalaceRun(state:PalaceRun,input:PalaceInput,layout:PalaceLayout=PALACE_LAYOUT):PalaceRun {
  const dt=Number.isFinite(input.dt)?Math.min(.05,Math.max(0,input.dt)):0;
  if(dt===0 || state.finished)return state;
  const s:PalaceRun={...state,player:{...state.player,swordHits:[...state.player.swordHits],homing:state.player.homing?{...state.player.homing}:null,airJumped:false,bounced:false},
    guards:state.guards.map(g=>({...g})),collected:[...state.collected]};
  const axis=Number.isFinite(input.axis)?Math.max(-1,Math.min(1,input.axis)):0;
  if(s.player.health>0) {
    if(input.jump)s.player.jumpBuffer=.14;
    if(axis && !s.player.homing && s.player.hurt<=0)s.player.facing=axis>0?1:-1;
    if(input.attack && !s.player.homing && s.player.swordSeconds===null && s.player.hurt<=0) {
      const targetId=selectPalaceTarget(s,layout);
      const target=targetId?s.guards.find(g=>g.id===targetId):undefined;
      if(target) {s.player.homing={targetId:target.id,seconds:0};s.player.swordHits=[];}
      else {s.player.swordSeconds=0;s.player.swordHits=[];}
    }
  }
  const count=Math.ceil(dt/(1/120)),h=dt/count;
  for(let i=0;i<count && !s.finished;i++)simulate(s,axis,h,layout);
  return s;
}
function simulate(s:PalaceRun,axis:number,dt:number,l:PalaceLayout):void {
  const p=s.player;s.elapsed+=dt;
  for(const g of s.guards) {
    if(g.defeated) {g.defeatedFor+=dt;continue;}
    const patrol=l.guards.find(spawn=>spawn.id===g.id);if(!patrol)continue;
    g.x+=g.direction*1.6*dt;
    if(g.x>=patrol.maxX){g.x=patrol.maxX;g.direction=-1;}
    if(g.x<=patrol.minX){g.x=patrol.minX;g.direction=1;}
  }
  if(p.health<=0) {
    p.deadFor=Math.max(0,p.deadFor-dt);
    if(p.deadFor<=EPS){const cp=l.checkpoints[s.checkpoint];s.player=playerAt(cp?{x:cp.spawnX,y:cp.spawnY}:l.spawn);s.player.invulnerable=.9;}
    return;
  }
  p.invulnerable=Math.max(0,p.invulnerable-dt);p.hurt=Math.max(0,p.hurt-dt);
  p.grounded=supported(p,l) && p.vy<=0;
  p.coyote=p.grounded?.12:Math.max(0,p.coyote-dt);
  if(p.jumpBuffer>0 && !p.homing && p.hurt<=0) {
    if(p.grounded || p.coyote>0) {p.vy=12.8;p.grounded=false;p.coyote=0;p.jumpBuffer=0;}
    else if(!p.airJumpSpent) {p.vy=12.8;p.airJumpSpent=true;p.airJumped=true;p.jumpBuffer=0;}
  }
  p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);
  let dashTarget=p.homing?s.guards.find(g=>g.id===p.homing!.targetId && !g.defeated):undefined;
  if(p.homing && (!dashTarget || p.homing.seconds>=.65 || !clearLine(center(p),center(dashTarget),l))) {p.homing=null;dashTarget=undefined;}
  if(p.homing && dashTarget) {
    p.homing.seconds+=dt;
    const dx=dashTarget.x-p.x,dy=dashTarget.y-p.y,distance=Math.hypot(dx,dy);
    p.vx=distance>EPS?dx/distance*24:0;p.vy=distance>EPS?dy/distance*24:0;
    const blocked=move(p,l,dt);
    if(Math.hypot(dashTarget.x-p.x,dashTarget.y-p.y)<.8) {
      defeat(dashTarget);p.homing=null;p.vy=12.8;p.vx=p.facing*10;p.grounded=false;p.coyote=0;p.bounced=true;
    } else if(blocked)p.homing=null;
  } else {
    if(p.hurt<=0)p.vx=approach(p.vx,axis*10,(axis?19:30)*dt);
    p.vy-=30*dt;move(p,l,dt);
    if(p.grounded){p.airJumpSpent=false;p.coyote=.12;}
  }
  if(p.swordSeconds!==null) {
    p.swordSeconds+=dt;
    if(p.swordSeconds>=SWORD_DURATION){p.swordSeconds=null;p.swordHits=[];}
    else if(p.swordSeconds>=SWORD_ACTIVE_START && p.swordSeconds<=SWORD_ACTIVE_END) {
      for(const g of s.guards) {
        const dx=(g.x-p.x)*p.facing;
        if(!g.defeated && !p.swordHits.includes(g.id) && dx>=0 && dx<=2.2 && Math.abs(g.y-p.y)<=1.5 && clearLine(center(p),center(g),l)) {defeat(g);p.swordHits.push(g.id);}
      }
    }
  }
  l.coins.forEach((coin,index)=>{
    const nearestY=Math.max(p.y,Math.min(p.y+PALACE_BODY_HEIGHT,coin.y));
    if(!s.collected.includes(index) && Math.hypot(Math.max(0,Math.abs(coin.x-p.x)-HALF),coin.y-nearestY)<=.7)s.collected.push(index);
  });
  l.checkpoints.forEach((cp,index)=>{if(index>s.checkpoint && p.grounded && Math.abs(p.y-cp.y)<.15 && Math.abs(p.x-cp.x)<1)s.checkpoint=index;});
  if(!p.homing && !p.bounced && p.invulnerable<=0) {
    const contact=s.guards.find(g=>!g.defeated && Math.abs(g.x-p.x)<.8 && Math.abs(g.y-p.y)<PALACE_BODY_HEIGHT);
    if(contact){p.health--;p.invulnerable=.9;p.hurt=.42;p.vx=(p.x<contact.x?-1:1)*7;p.vy=6;p.grounded=false;p.swordSeconds=null;if(p.health<=0)die(s);}
  }
  if(p.y< -12 && p.health>0)die(s);
  if(p.health>0 && p.grounded && Math.abs(p.x-l.goal.x)<1.1 && Math.abs(p.y-l.goal.y)<.15)s.finished=true;
}
