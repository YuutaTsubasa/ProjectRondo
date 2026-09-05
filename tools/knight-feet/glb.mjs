import fs from 'node:fs';
export const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const mul=(a,b)=>Array.from({length:16},(_,i)=>{let s=0;for(let k=0;k<4;k++)s+=a[k*4+i%4]*b[Math.floor(i/4)*4+k];return s;});
export const point=(m,p)=>[0,1,2].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
export const qm=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
export const norm=q=>{const l=Math.hypot(...q);return q.map(x=>x/l);};
export const invq=q=>[-q[0],-q[1],-q[2],q[3]];
export const axis=(v,a)=>[...v.map(x=>x*Math.sin(a/2)),Math.cos(a/2)];
export function trs(n){const [x,y,z,w]=norm(n.rotation??[0,0,0,1]),s=n.scale??[1,1,1],t=n.translation??[0,0,0];return [(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,...t,1];}
export function slerp(a,b,t){let d=a.reduce((s,x,i)=>s+x*b[i],0);if(d<0){b=b.map(x=>-x);d=-d;}if(d>.9995)return norm(a.map((x,i)=>x+(b[i]-x)*t));const th=Math.acos(Math.min(1,d)),sn=Math.sin(th);return a.map((x,i)=>(x*Math.sin((1-t)*th)+b[i]*Math.sin(t*th))/sn);}
export function load(p){const bytes=fs.readFileSync(p),jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl)),bin=bytes.subarray(28+jl);const cache=new Map();
 const read=i=>{if(cache.has(i))return cache.get(i);const a=j.accessors[i],v=j.bufferViews[a.bufferView],size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],ct={5120:['readInt8',1,127],5121:['readUInt8',1,255],5122:['readInt16LE',2,32767],5123:['readUInt16LE',2,65535],5125:['readUInt32LE',4,4294967295],5126:['readFloatLE',4,1]}[a.componentType];if(a.sparse)throw Error('sparse');const out=Array.from({length:a.count},(_,k)=>Array.from({length:size},(_,c)=>{const x=bin[ct[0]]((v.byteOffset??0)+(a.byteOffset??0)+k*(v.byteStride??size*ct[1])+c*ct[1]);return a.normalized?Math.max(-1,x/ct[2]):x;}));cache.set(i,out);return out;};
 const parents=j.nodes.map(()=>-1);j.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents[c]=i));
 const evaluate=(name,time=0,modify=null,neutral=true)=>{const nodes=j.nodes.map(n=>({...n})),a=j.animations?.find(a=>a.name===name);if(a)for(const c of a.channels){const s=a.samplers[c.sampler],tt=read(s.input).map(x=>x[0]),vv=read(s.output);let k=0;while(k<tt.length-1&&tt[k+1]<=time)k++;const t=k===tt.length-1?0:Math.max(0,(time-tt[k])/(tt[k+1]-tt[k]));if(s.interpolation==='CUBICSPLINE')throw Error('cubic');nodes[c.target.node][c.target.path]=s.interpolation==='STEP'||t===0?vv[k]:c.target.path==='rotation'?slerp(vv[k],vv[k+1],t):vv[k].map((x,i)=>x+(vv[k+1][i]-x)*t);}
 if(neutral&&name!=='0_T-Pose')for(const n of nodes)if(n.name==='RL_BoneRoot')n.rotation=[0,0,0,1];
 if(modify)modify(nodes);const world=[];const get=i=>world[i]??(world[i]=parents[i]<0?(nodes[i].matrix??trs(nodes[i])):mul(get(parents[i]),nodes[i].matrix??trs(nodes[i])));nodes.forEach((_,i)=>get(i));return {nodes,world};};
 const meshes=j.nodes.flatMap((n,ni)=>n.mesh===undefined?[]:j.meshes[n.mesh].primitives.map((p,pi)=>({ni,pi,name:n.name,skin:n.skin,positions:read(p.attributes.POSITION),indices:p.indices===undefined?null:read(p.indices).flat(),sets:[0,1].filter(k=>p.attributes['JOINTS_'+k]!==undefined).map(k=>({j:read(p.attributes['JOINTS_'+k]),w:read(p.attributes['WEIGHTS_'+k])})),normals:read(p.attributes.NORMAL)})));
 const skin=(state,mesh)=>{const sk=j.skins[mesh.skin],mat=sk?.joints.map((n,k)=>mul(state.world[n],read(sk.inverseBindMatrices)[k]));return mesh.positions.map((p,i)=>{if(!mat)return point(state.world[mesh.ni],p);const out=[0,0,0];for(const set of mesh.sets)for(let c=0;c<4;c++){const w=set.w[i][c];if(w){const v=point(mat[set.j[i][c]],p);v.forEach((x,k)=>out[k]+=w*x);}}return out;});};
 return {j,bin,bytes,read,parents,evaluate,meshes,skin};
}
export const bounds=pp=>({min:[0,1,2].map(i=>Math.min(...pp.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...pp.map(p=>p[i])))});
