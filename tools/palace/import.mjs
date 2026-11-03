import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const revision='76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc';
const repository='https://github.com/YuutaTsubasa/ProjectAlmost';
const sourcePath='src/domain/gameplay/gameplayStageSources.ts';
const base='repos/YuutaTsubasa/ProjectAlmost/contents/';
const fetch=path=>{
 let data=JSON.parse(execFileSync('gh',['api',base+path+'?ref='+revision],{maxBuffer:60*1024*1024}));
 if(data.encoding!=='base64')data=JSON.parse(execFileSync('gh',['api','repos/YuutaTsubasa/ProjectAlmost/git/blobs/'+data.sha],{maxBuffer:60*1024*1024}));
 return Buffer.from(data.content,'base64');
};
mkdirSync('public/palace',{recursive:true});
const source=fetch(sourcePath).toString('utf8');
// The source's item values are JSON literals. Balance braces outside JSON strings;
// never execute upstream TypeScript or rely on the position of the following level.
function stageValue(id){
 const marker=new RegExp('"'+id+'":\\s*\\{').exec(source);
 if(!marker)throw new Error('Missing source stage '+id);
 const start=source.indexOf('{',marker.index);let depth=0,string=false,escaped=false;
 for(let i=start;i<source.length;i++){
  const c=source[i];
  if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;continue;}
  if(c==='"')string=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(source.slice(start,i+1));
 }
 throw new Error('Unclosed source stage '+id);
}
const stages=['1-1','1-2','1-3','1-4','1-5'];
for(const id of stages){const value=stageValue(id);if(value.id!==id)throw new Error('Mismatched stage '+id);writeFileSync('public/palace/stage-'+id+'.json',JSON.stringify(value,null,2)+'\n');}
const paths=['maps/white_palace_sky.webp','maps/white_palace_far_bg.webp','maps/white_palace_mid_bg_loop.webp','tiles/white_palace_platform_tiles.webp','props/white_palace_checkpoint.webp','props/white_palace_goal_idle.webp','audio/world01_bgm.mp3','audio/sfx/coin.wav','audio/sfx/hit.wav','audio/sfx/checkpoint.wav','audio/sfx/goal.wav'];
const stagesOnly=process.argv.includes('--stages-only');
const knight=process.argv.slice(2).find(a=>!a.startsWith('--'))??'C:/Users/User/Repo/3DModel/knight-parkour/dist/assets/knight.glb';
if(!stagesOnly){for(const path of paths)writeFileSync('public/palace/'+path.split('/').at(-1),fetch('public/assets/'+path));copyFileSync(knight,'public/palace/guard.glb');}
const old=existsSync('public/palace/source-receipt.json')?JSON.parse(readFileSync('public/palace/source-receipt.json','utf8')):{};
const files=[...stages.map(id=>'stage-'+id+'.json'),'guard.glb',...paths.map(p=>p.split('/').at(-1))];
writeFileSync('public/palace/source-receipt.json',JSON.stringify({repository,revision,stage:sourcePath+'#1-1',stages:stages.map(id=>sourcePath+'#'+id),sourceSha256:createHash('sha256').update(source).digest('hex'),knightSource:stagesOnly?old.knightSource:knight,files:files.map(file=>{const bytes=readFileSync('public/palace/'+file);return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})},null,2)+'\n');
console.log('Imported White Palace '+stages.join(', ')+'.');
