// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {createPalaceAudio} from '../../src/presentation/palace/palaceAudio';
import {createPalaceRun} from '../../src/domain/palace/palaceRun';
it('lets the goal cue finish while the completed scene freezes',()=>{
 const media:{src:string;paused:boolean;play:ReturnType<typeof vi.fn>;pause:ReturnType<typeof vi.fn>}[]=[];
 vi.stubGlobal('Audio',class{src:string;paused=true;volume=1;loop=false;preload='';currentTime=0;
  constructor(src:string){this.src=src;media.push(this);}
  play=vi.fn(()=>{this.paused=false;return Promise.resolve();});pause=vi.fn(()=>{this.paused=true;});removeAttribute(){}load(){}
 });
 const audio=createPalaceAudio();audio.pause(false);
 const before=createPalaceRun();audio.update(before,{...before,finished:true});audio.pause(true);
 expect(media.find(m=>m.src.endsWith('goal.wav'))!.paused).toBe(false);
 expect(media.find(m=>m.src.endsWith('world01_bgm.mp3'))!.paused).toBe(true);
 audio.dispose();expect(media.every(m=>m.paused)).toBe(true);vi.unstubAllGlobals();
});