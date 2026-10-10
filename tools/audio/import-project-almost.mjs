import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const revision='76b9ca1c680e98e27ac9f51871bf4feffb3f0bbc';
const files=['game_result.mp3',...['armor-step','checkpoint','coin','death','goal','hit','ui-back','ui-confirm','ui-move'].map(s=>`sfx/${s}.wav`)];
const root='public/audio';
for(const path of [`${root}/sfx`,`${root}/music`,'docs/audio'])mkdirSync(path,{recursive:true});
const receipts=[];
for(const file of files){
 const source=`public/assets/audio/${file}`;
 let result=JSON.parse(execFileSync('gh',['api',`repos/YuutaTsubasa/ProjectAlmost/contents/${source}?ref=${revision}`],{maxBuffer:32*1024*1024}));
 if(result.encoding!=='base64')result=JSON.parse(execFileSync('gh',['api',`repos/YuutaTsubasa/ProjectAlmost/git/blobs/${result.sha}`],{maxBuffer:32*1024*1024}));
 const bytes=Buffer.from(result.content,'base64');const output=file==='game_result.mp3'?`${root}/music/result_original.mp3`:`${root}/${file}`;writeFileSync(output,bytes);
 receipts.push({source,output,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
writeFileSync('docs/audio/project-almost-import.json',JSON.stringify({repository:'https://github.com/YuutaTsubasa/ProjectAlmost',revision,registry:'src/domain/audio/audioAssets.ts',processing:'Verbatim copies; no transcoding or modification.',files:receipts},null,2)+'\n');
console.log(receipts);
