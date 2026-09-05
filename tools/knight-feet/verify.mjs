import assert from 'node:assert/strict';import {load} from './glb.mjs';import {landmarks,measured} from './sole.mjs';
if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node verify.mjs original.glb corrected.glb');
const original=load(process.argv[2]),g=load(process.argv[3]),lms=landmarks(original),report=[];
for(const name of [null,'0_T-Pose','Idle','Walk','Run','Jump']){
 const anim=g.j.animations.find(a=>a.name===name),duration=anim?Math.max(...anim.samplers.map(s=>g.read(s.input).at(-1)[0])):0;
 const n=name?Math.ceil(duration*60):0,values=lms.map(()=>[]);
 for(let i=0;i<=n;i++){const s=g.evaluate(name,n?duration*i/n:0);lms.forEach((lm,k)=>values[k].push(measured(g,lm,s).pitch));}
 for(const v of values)assert(v.every(Number.isFinite),'Invalid skinned sole measurement in '+name);
 report.push({clip:name??'rest',samples:n+1,feet:values.map((v,k)=>({foot:lms[k].foot,min:Math.min(...v),mean:v.reduce((s,x)=>s+x,0)/v.length,max:Math.max(...v)}))});
}
console.log(JSON.stringify(report,null,2));
for(const r of report.filter(r=>['rest','0_T-Pose','Idle'].includes(r.clip)))for(const f of r.feet)assert(Math.max(Math.abs(f.min),Math.abs(f.max))<1,`${r.clip} ${f.foot}: sole pitch ${f.min.toFixed(2)} to ${f.max.toFixed(2)} degrees; expected within 1 degree of level`);
console.log('PASS: Rest and Idle soles level; all four clips sampled at 60 Hz.');

await import('./integrity.mjs');
