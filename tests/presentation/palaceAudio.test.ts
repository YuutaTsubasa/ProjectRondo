// @vitest-environment jsdom
import {afterEach, expect,it,vi} from 'vitest';
import {createPalaceAudio} from '../../src/presentation/palace/palaceAudio';
import {createPalaceRun} from '../../src/domain/palace/palaceRun';
import {createMenuMusic} from '../../src/presentation/audio/menuMusic';
vi.mock('../../src/presentation/audio/menuMusic',()=>({createMenuMusic:vi.fn()}));
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
function fixture(){
 const music={prepare:vi.fn().mockResolvedValue(undefined),unlock:vi.fn().mockResolvedValue(undefined),setActive:vi.fn(),setTitleScreen:vi.fn(),dispose:vi.fn()};
 const result={prepare:vi.fn().mockResolvedValue(undefined),unlock:vi.fn().mockResolvedValue(undefined),setActive:vi.fn(),setTitleScreen:vi.fn(),dispose:vi.fn()};
 vi.mocked(createMenuMusic).mockReturnValueOnce(music).mockReturnValue(result);
 const media:{src:string;paused:boolean;play:ReturnType<typeof vi.fn>;pause:ReturnType<typeof vi.fn>}[]=[];
 vi.stubGlobal('Audio',class{src:string;paused=true;volume=1;loop=false;preload='';currentTime=0;
  constructor(src:string){this.src=src;media.push(this);}
  play=vi.fn(()=>{this.paused=false;return Promise.resolve();});pause=vi.fn(()=>{this.paused=true;});removeAttribute(){}load(){}
 });
 return {audio:createPalaceAudio(),music,result,media};
}
it('lets the goal cue finish while completed scene music freezes',()=>{
 const {audio,music,media}=fixture();audio.pause(false);
 const before=createPalaceRun();audio.update(before,{...before,finished:true});audio.pause(true);
 expect(media.find(m=>m.src.endsWith('goal.wav'))!.paused).toBe(false);
 expect(music.setActive).toHaveBeenLastCalledWith(false);
 audio.dispose();expect(media.every(m=>m.paused)).toBe(true);expect(music.dispose).toHaveBeenCalledOnce();
});
it('uses the dedicated decoded palace cue and retries unlock only while active',()=>{
 const {audio,music,media}=fixture();
 expect(createMenuMusic).toHaveBeenCalledWith({url:'/audio/music/palace_arcade.ogg',volume:.5,preservePosition:true});
 expect(media).toHaveLength(18);
 window.dispatchEvent(new Event('pointerdown'));expect(music.unlock).not.toHaveBeenCalled();
 audio.pause(false);expect(music.unlock).toHaveBeenCalledOnce();
 window.dispatchEvent(new Event('keydown'));expect(music.unlock).toHaveBeenCalledTimes(2);
 audio.pause(true);window.dispatchEvent(new Event('pointerdown'));expect(music.unlock).toHaveBeenCalledTimes(2);
 audio.dispose();window.dispatchEvent(new Event('keydown'));expect(music.unlock).toHaveBeenCalledTimes(2);
});

it('plays actual jump, impact, death and collection edges only once',()=>{
 const {audio,media}=fixture();audio.pause(false);const before=createPalaceRun();
 const jump={...before,player:{...before.player,grounded:false,vy:12,airJumped:true}};
 audio.update(before,jump);expect(media.filter(m=>m.src.endsWith('armor-step.wav'))[0].play).toHaveBeenCalledOnce();
 const impact={...jump,damageTaken:1,player:{...jump.player,health:2},collected:[0],checkpoint:0};
 audio.update(jump,impact);audio.update(impact,impact);
 expect(media.find(m=>m.src.endsWith('/hit.wav'))!.play).toHaveBeenCalledOnce();
 expect(media.find(m=>m.src.endsWith('/coin.wav'))!.play).toHaveBeenCalledOnce();
 expect(media.find(m=>m.src.endsWith('/checkpoint.wav'))!.play).toHaveBeenCalledOnce();
 audio.update(impact,{...impact,deaths:1,player:{...impact.player,health:0}});
 expect(media.find(m=>m.src.endsWith('/death.wav'))!.play).toHaveBeenCalledOnce();audio.dispose();
});

it('rotates the eight sword takes once per actual swing and suppresses them while paused',()=>{
 const {audio,media}=fixture();audio.pause(false);const before=createPalaceRun();
 const winding={...before,player:{...before.player,swordSeconds:.02}};
 const slashing={...before,player:{...before.player,swordSeconds:.12}};
 for(let i=0;i<9;i++){audio.update(winding,slashing);audio.update(slashing,slashing);}
 const swings=media.filter(m=>m.src.includes('/sword/swipe-'));
 expect(swings).toHaveLength(8);expect(swings[0].play).toHaveBeenCalledTimes(2);
 for(const sample of swings.slice(1))expect(sample.play).toHaveBeenCalledOnce();
 audio.pause(true);audio.update(winding,slashing);
 expect(swings[1].play).toHaveBeenCalledOnce();audio.dispose();
});
