import one from '../../../public/palace/stage-1-1.json';
import two from '../../../public/palace/stage-1-2.json';
import three from '../../../public/palace/stage-1-3.json';
import four from '../../../public/palace/stage-1-4.json';
import five from '../../../public/palace/stage-1-5.json';
import {PALACE_LAYOUT,convertPalaceLayout,type PalaceLayout} from './palaceLayout';
export type PalaceStageId='palace'|'palace-1-2'|'palace-1-3'|'palace-1-4'|'palace-1-5';
export interface PalaceStage {
 readonly id:PalaceStageId;readonly number:string;readonly title:string;readonly description:string;
 readonly times:readonly [number,number,number,number];readonly layout:PalaceLayout;
}
// 1-2..1-5 titles are the pinned source's zhHant subtitles; 1-1 keeps its Rondo name.
const titles=['蒼穹迴廊','蒼藍中庭','天空露台','拱橋','空中花園'];
const descriptions=['穿越守衛迴廊，沿引水道抵達末端閘門。','追擊蒼藍核心，越過中庭的連續斷橋。','沿空中核心攀上露台，選擇高處路線前進。','穿越守衛與拱橋，沿蒼藍光芒躍過高處缺口。','串連宮殿的長程試煉，穿越四座紀錄點抵達花園。'];
export const PALACE_STAGES:readonly PalaceStage[]=[one,two,three,four,five].map((source,i)=>({
 id:i===0?'palace':`palace-${source.id}` as PalaceStageId,number:source.id,title:titles[i]!,description:descriptions[i]!,
 times:[source.rankTargets.sTime,source.rankTargets.aTime,source.rankTargets.bTime,source.rankTargets.cTime],
 layout:i===0?PALACE_LAYOUT:convertPalaceLayout(source),
}));
export function getPalaceStage(id:string='palace'):PalaceStage {
 const stage=PALACE_STAGES.find(stage=>stage.id===id);
 if(!stage)throw new Error(`Unknown palace stage: ${id}`);
 return stage;
}
