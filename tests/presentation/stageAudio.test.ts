// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createStageAudio} from '../../src/presentation/audio/stageAudio';
import {audioPreferences} from '../../src/presentation/audio/audioPreferences';
import {createMenuMusic} from '../../src/presentation/audio/menuMusic';
vi.mock('../../src/presentation/audio/menuMusic',()=>({createMenuMusic:vi.fn()}));
afterEach(()=>{audioPreferences.reset();vi.unstubAllGlobals();vi.clearAllMocks();document.body.innerHTML='';});
function fixture(scene:'course'|'palace'='course'){
 const music:any[]=[];vi.mocked(createMenuMusic).mockImplementation(()=>{const m={unlock:vi.fn().mockResolvedValue(undefined),setActive:vi.fn(),setTitleScreen:vi.fn(),dispose:vi.fn()};music.push(m);return m;});
 const media:any[]=[];vi.stubGlobal('Audio',class{src:string;paused=true;volume=1;currentTime=0;playbackRate=1;preload='';constructor(src:string){this.src=src;media.push(this);}play=vi.fn(()=>{this.paused=false;return Promise.resolve();});pause=vi.fn(()=>{this.paused=true;});removeAttribute(){}load(){}});
 const stage=createStageAudio(scene);return {stage,music,media};
}
it.each(['course','palace'] as const)('%s changes to the processed result loop once and keeps the goal cue through scene freeze',(scene)=>{
 const f=fixture(scene);f.stage.pause(false);f.stage.finish();f.stage.finish();f.stage.pause(true);
 expect(createMenuMusic).toHaveBeenLastCalledWith({url:'/audio/music/result_victoire.ogg',volume:.5,preservePosition:true});
 expect(f.music[0].setActive).toHaveBeenLastCalledWith(false);expect(f.music[1].setActive).toHaveBeenLastCalledWith(true);
 expect(f.media.find(x=>x.src.endsWith('/goal.wav')).play).toHaveBeenCalledOnce();
 expect(f.media.find(x=>x.src.endsWith('/goal.wav')).paused).toBe(false);
 f.stage.reset();expect(f.music[1].dispose).toHaveBeenCalledOnce();f.stage.pause(false);
 expect(f.music[0].setActive).toHaveBeenLastCalledWith(true);
 f.stage.dispose();expect(f.media.every(x=>x.paused)).toBe(true);expect(f.music[0].dispose).toHaveBeenCalledOnce();
});
it('blocks gameplay effects while paused, allows menu actions, and drops input after disposal',()=>{
 const f=fixture();f.stage.play('coin');expect(f.media.find(x=>x.src.endsWith('/coin.wav')).play).not.toHaveBeenCalled();
 f.stage.ui('back');expect(f.media.find(x=>x.src.endsWith('/ui-back.wav')).play).toHaveBeenCalledOnce();
 f.stage.pause(false);f.stage.play('coin');expect(f.media.find(x=>x.src.endsWith('/coin.wav')).play).toHaveBeenCalledOnce();
 f.stage.dispose();f.stage.ui('confirm');window.dispatchEvent(new Event('keydown'));
 expect(f.media.find(x=>x.src.endsWith('/ui-confirm.wav')).play).not.toHaveBeenCalled();
});
it('plays move only after a real change between paused-menu controls',()=>{
 const f=fixture();document.body.innerHTML='<button>A</button><button>B</button>';
 const [a,b]=document.querySelectorAll('button');a.focus();b.focus();b.focus();
 expect(f.media.find(x=>x.src.endsWith('/ui-move.wav')).play).toHaveBeenCalledOnce();f.stage.dispose();
});

it('keeps UI feedback audible while entering pause and applies master/SFX/mute',()=>{
 const f=fixture();f.stage.pause(false);f.stage.ui('back');f.stage.pause(true);
 expect(f.media.find(x=>x.src.endsWith('/ui-back.wav')).paused).toBe(false);
 audioPreferences.setLevel('master',.5);audioPreferences.setLevel('sfx',.4);
 expect(f.media.find(x=>x.src.endsWith('/coin.wav')).volume).toBeCloseTo(.14);
 audioPreferences.setMuted(true);expect(f.media.every(x=>x.volume===0)).toBe(true);f.stage.dispose();
});
