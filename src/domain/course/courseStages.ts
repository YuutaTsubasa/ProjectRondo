import {type Vec3,vec3} from '../math/vec3';
import {COURSE_PLATFORMS,COURSE_GATES,COURSE_CRYSTALS,COURSE_JUMPS,COURSE_CHAINS,COURSE_SPAWN,COURSE_KILL_Y,COURSE_GUARD_SPAWNS,type CoursePlatform,type CourseGate,type CourseGuardSpawn} from './courseLayout';
export type CourseId='course'|'course-2'|'course-3'|'course-4'|'course-5';
export interface CourseDefinition {
 readonly id:CourseId;readonly number:string;readonly title:string;readonly subtitle:string;
 readonly description:string;readonly objective:string;readonly tip:string;
 readonly times:readonly[number,number,number,number];
 readonly platforms:readonly CoursePlatform[];readonly gates:readonly[CourseGate,...CourseGate[]];
 readonly crystals:readonly Vec3[];readonly guards:readonly CourseGuardSpawn[];readonly coins:readonly Vec3[];
 readonly spawn:Vec3;readonly killY:number;
 readonly jumps:readonly(readonly[number,number])[];
 readonly chains:readonly{from:number;to:number;crystals:readonly number[]}[];
}
/** Coins follow the safe walkway; broad terraces offer optional side rows away from the jump edges. */
function walkwayCoins(platforms:readonly CoursePlatform[],goal:CourseGate):Vec3[]{
 return platforms.flatMap((p,i)=>{
  const line=[-.28,0,.28].map(t=>vec3(p.center.x,p.center.y+1,p.center.z+p.depth*t));
  if(p.width>=14)for(const side of [-1,1])line.push(vec3(p.center.x+side*(p.width/2-2.6),p.center.y+1,p.center.z+(i%2?2:-2)));
  return line.map(c=>({...c,z:Math.min(c.z,goal.center.z-goal.halfDepth-1.5)}));
 });
}
const original:CourseDefinition={id:'course',number:'01',title:'白宮天廊',subtitle:'白色王城',description:'穿越白宮天廊與騎士守衛，重新接通白塔中繼台。',objective:'抵達白塔中繼台',tip:'先確認下一個落腳處，再用二段跳與空中盾衝跨越缺口。',times:[45,65,90,120],platforms:COURSE_PLATFORMS,gates:COURSE_GATES,crystals:COURSE_CRYSTALS,guards:COURSE_GUARD_SPAWNS,coins:walkwayCoins(COURSE_PLATFORMS,COURSE_GATES.at(-1)!),spawn:COURSE_SPAWN,killY:COURSE_KILL_Y,jumps:COURSE_JUMPS,chains:COURSE_CHAINS};
/** Each terrace supplies X, surface height, width, depth and the preceding gap. Large gaps are crystal crossings. */
type Terrace=readonly[x:number,y:number,width:number,depth:number,gap:number];
function build(id:CourseId,number:string,title:string,description:string,tip:string,times:CourseDefinition['times'],terraces:readonly Terrace[],gateLabels:readonly string[]):CourseDefinition{
 const platforms:CoursePlatform[]=[],jumps:[number,number][]=[],crystals:Vec3[]=[],chains:{from:number;to:number;crystals:number[]}[]=[];
 for(const [i,[x,y,width,depth,gap]]of terraces.entries()){
  const previous=platforms[i-1];const z=previous?previous.center.z+previous.depth/2+gap+depth/2:depth/2-6;
  const p={id:`${id}-terrace-${i}`,center:vec3(x,y,z),width,depth};platforms.push(p);
  if(!previous)continue;
  if(gap<10)jumps.push([i-1,i]);
  else{
   const startZ=previous.center.z+previous.depth/2+4.5,endZ=z-depth/2+1.5;
   const count=Math.ceil((endZ-startZ)/6.5)+1,indices:number[]=[];
   for(let j=0;j<count;j++){const t=j/(count-1);indices.push(crystals.length);crystals.push(vec3(previous.center.x+(x-previous.center.x)*t,previous.center.y+2.6+(y-previous.center.y+.2)*t,startZ+(endZ-startZ)*t));}
   chains.push({from:i-1,to:i,crystals:indices});
  }
 }
 const broad=platforms.map((p,i)=>({p,i})).filter(({p})=>p.width>=14);
 const gates=broad.map(({p},i)=>({label:gateLabels[i]??`${title}露臺`,center:vec3(p.center.x,p.center.y+1,i===0?0:i===broad.length-1?p.center.z+p.depth/2-4:p.center.z),spawn:vec3(p.center.x,p.center.y+1.3,i===0?0:i===broad.length-1?p.center.z+p.depth/2-4:p.center.z),halfWidth:3,halfDepth:2.5})) as [CourseGate,...CourseGate[]];
 const guards=broad.flatMap(({p,i},index)=>index===0?[]:[-1,1].map(side=>({id:0,platform:i,x:p.center.x+side*3.4,y:p.center.y,z:p.center.z+side*3}))).map((g,id)=>({...g,id}));
 return{id,number,title,subtitle:'白色王城 · 天廊試煉',description,objective:`抵達${gates.at(-1)!.label}`,tip,times,platforms,gates,guards,crystals,coins:walkwayCoins(platforms,gates.at(-1)!),jumps,chains,spawn:gates[0].spawn,killY:-12};
}
export const COURSE_STAGES:readonly CourseDefinition[]=[original,
 build('course-2','02','白柱迴廊','沿交錯白柱與窄橋前進，在左右換線中尋找下一座露臺。','先在寬露臺調整方向，再沿金幣指引起跳；窄橋仍保留安全落腳空間。',[55,75,100,130],[
  [0,0,18,26,0],[2,0,8,10,3.2],[-1,.2,8,10,3.2],[2,.2,8,10,3.2],[0,.4,16,20,3.2],
  [5,.6,16,20,28],[7,.8,7,10,3.2],[4,.8,7,10,3.2],[6,1,16,20,3.2],[-1,1.2,20,26,30],
 ],['白柱前庭','交錯橋庭','東翼露臺','雙柱望台','迴廊鐘台']),
 build('course-3','03','晨光階庭','踏上逐層升高的白石階庭，沿晨光水晶抵達王宮上層。','逐階加速起跳，登高後再接上水晶；每段上升後都有寬敞紀錄點。',[60,82,110,140],[
  [0,0,18,26,0],[0,.5,8,9,3],[1,1,8,9,3],[2,1.5,8,9,3],[2,2,16,20,3],
  [-2,3,16,20,28],[-3,3.5,7,9,3],[-2,4,7,9,3],[-1,4.5,16,20,3],[3,5.5,18,24,28],
  [4,6,8,10,3],[2,6.5,20,26,3],
 ],['晨光前庭','第一階庭','高架花台','雲上休臺','晨光上庭','金頂觀景台']),
 build('course-4','04','水晶星廊','穿越三段彎曲星廊，以連續空中盾衝串起遠方白塔。','水晶會逐步轉向；落地後先調整面向，再起跳展開下一段接力。',[60,82,110,140],[
  [0,0,18,26,0],[1,.2,8,10,3.2],[0,.4,16,20,3.2],[-7,1,16,22,32],
  [-5,1.4,8,10,3.2],[-3,1.6,16,20,3.2],[5,2,16,22,34],[7,2.4,8,10,3.2],[5,2.6,16,20,3.2],[-2,3,20,28,34],
 ],['星廊前庭','西行出發台','西翼星台','星光中庭','東翼星台','回光露臺','星冠終台']),
 build('course-5','05','王冠巡禮','穿越高低錯落的王冠巡道，在窄橋、守衛與水晶接力之間完成最後巡禮。','先擊退寬台守衛，再挑戰下一段窄橋；收集側翼金幣後記得回到中央起跳。',[65,88,118,150],[
  [0,0,18,26,0],[-2,.4,7,10,3.3],[-4,.8,7,10,3.3],[-2,1,16,20,3.3],
  [4,1.6,16,22,30],[6,2,7,10,3.3],[4,2.4,7,10,3.3],[2,2.8,16,20,3.3],
  [-4,3.2,16,22,32],[-6,3.6,7,10,3.3],[-4,4,7,10,3.3],[-2,4.4,20,28,3.3],
 ],['巡禮起點','銀翼哨台','東冠露臺','巡禮中庭','西冠露臺','王冠終庭']),
];
export function getCourseStage(id:string='course'):CourseDefinition{return COURSE_STAGES.find(s=>s.id===id)??original;}
