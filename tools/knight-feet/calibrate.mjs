import fs from 'node:fs';import {load,qm,norm,axis} from './glb.mjs';import {landmarks,measured,sub,unit,dir} from './sole.mjs';
// The sole is calibrated in the ankle's local space, after undoing the legacy exporter offset.
// Constant quaternion multiplication preserves angular motion and glTF slerp between keys.
const [, , input, out, legacyPitch = '0'] = process.argv;
if (!input || !out || !['0', '20'].includes(legacyPitch)) throw Error('Usage: node calibrate.mjs input.glb output.glb [legacy-parent-pitch: 0 or 20]');
if (input === out) throw Error('Use a separate output so the source remains available for verification');
const g=load(input),lms=landmarks(g);
if (g.j.asset.extras?.knightFootCalibration) throw Error('This GLB is already calibrated; refusing to apply the correction twice');
if (lms.length !== 2) throw Error('Expected both knight boot meshes');
if (g.j.animations.map(a=>a.name).sort().join(',') !== '0_T-Pose,Idle,Jump,Run,Walk') throw Error('Unexpected clip set; inspect before calibrating');
const transposeDir=(m,p)=>[0,1,2].map(i=>m[i*4]*p[0]+m[i*4+1]*p[1]+m[i*4+2]*p[2]);
// Undo the exporter’s +20 degree parent-rest-X rotation before calibrating.
const undo=axis([1,0,0],-Number(legacyPitch)*Math.PI/180);
const pre=nodes=>{for(const lm of lms)nodes[lm.node].rotation=qm(undo,nodes[lm.node].rotation);};
const corrections=[];
for(const lm of lms){const rest=g.evaluate(null),p=measured(g,lm,rest),f=unit(sub(p.toe,p.heel)),right=unit([f[2],0,-f[0]]);
 const localAxis=unit(transposeDir(rest.world[lm.node],right));
 const solve=(clip,times,unpitch)=>{let lo=-60,hi=30;for(let iteration=0;iteration<28;iteration++){const deg=(lo+hi)/2,q=axis(localAxis,deg*Math.PI/180);let total=0;for(const time of times){const s=g.evaluate(clip,time,nodes=>{if(unpitch)pre(nodes);nodes[lm.node].rotation=qm(nodes[lm.node].rotation,q);});total+=measured(g,lm,s).pitch;}const value=total/times.length;if(value>0)lo=deg;else hi=deg;}const deg=(lo+hi)/2;return {deg,q:axis(localAxis,deg*Math.PI/180)};};
 const a=g.j.animations.find(a=>a.name==='Idle'),duration=Math.max(...a.samplers.map(s=>g.read(s.input).at(-1)[0]));
 corrections.push({name:lm.foot,node:lm.node,localAxis,rest:solve(null,[0],false),tpose:solve('0_T-Pose',[0],false),animation:solve('Idle',Array.from({length:31},(_,i)=>duration*i/30),true)});
}
function writeAccessor(i,values){const a=g.j.accessors[i],v=g.j.bufferViews[a.bufferView];if(a.componentType!==5126||a.type!=='VEC4')throw Error('Expected float quaternion');values.forEach((q,k)=>q.forEach((x,c)=>g.bin.writeFloatLE(x,(v.byteOffset??0)+(a.byteOffset??0)+k*(v.byteStride??16)+c*4)));}
for(const c of corrections){g.j.nodes[c.node].rotation=norm(qm(g.j.nodes[c.node].rotation,c.rest.q));for(const a of g.j.animations){const ch=a.channels.find(ch=>ch.target.node===c.node&&ch.target.path==='rotation');if(!ch)throw Error('Missing foot rotation '+a.name);const s=a.samplers[ch.sampler];if(s.interpolation==='CUBICSPLINE')throw Error('Cubic rotations need tangent correction');const isMotion=a.name!=='0_T-Pose';const values=g.read(s.output).map(q=>norm(qm(isMotion?qm(undo,q):q,isMotion?c.animation.q:c.tpose.q)));writeAccessor(s.output,values); const acc=g.j.accessors[s.output]; if(acc.min) acc.min=[0,1,2,3].map(i=>Math.min(...values.map(q=>q[i]))); if(acc.max) acc.max=[0,1,2,3].map(i=>Math.max(...values.map(q=>q[i])));}}
g.j.asset.extras={...g.j.asset.extras,knightFootCalibration:{version:1,undoParentPitchDegrees:Number(legacyPitch),corrections}};
const raw=Buffer.from(JSON.stringify(g.j)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+g.bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(g.bin.length,0);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(out,Buffer.concat([header,json,bh,g.bin]));console.log(JSON.stringify({output:out,corrections},null,2));
