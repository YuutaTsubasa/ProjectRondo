import {bounds} from './glb.mjs';
export const mean=p=>[0,1,2].map(k=>p.reduce((s,v)=>s+v[k],0)/p.length);
export const sub=(a,b)=>a.map((x,i)=>x-b[i]);
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>a.map(x=>x/Math.hypot(...a));
export const dir=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]);
export function landmarks(g){return g.meshes.filter(m=>['Mesh_7','Mesh_26'].includes(m.name)).map(m=>{
 const p=g.skin(g.evaluate(null),m),foot=m.name==='Mesh_7'?'LeftFoot':'RightFoot',node=g.j.nodes.findIndex(n=>n.name===foot);
 // Use fixed original surface vertex IDs for before/after measurements.
 const heel=p.map((v,i)=>({v,i})).filter(x=>x.v[2]<-.035&&x.v[1]<.035).map(x=>x.i),toe=p.map((v,i)=>({v,i})).filter(x=>x.v[2]>.055&&x.v[1]<.012).map(x=>x.i);
 if (node < 0 || heel.length < 50 || toe.length < 50) throw Error('This calibration requires the current knight boot geometry');
 return {m,node,foot,heel,toe};
});}
export function measured(g,lm,s){const m=g.meshes.find(m=>m.name===lm.m.name),p=g.skin(s,m),h=mean(lm.heel.map(i=>p[i])),t=mean(lm.toe.map(i=>p[i])),v=sub(t,h);return {pitch:Math.atan2(v[1],Math.hypot(v[0],v[2]))*180/Math.PI,heel:h,toe:t,min:bounds(p).min};}
