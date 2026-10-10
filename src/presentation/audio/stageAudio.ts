import {createMenuMusic, type MenuMusic} from './menuMusic';
import {audioPreferences} from './audioPreferences';
import {MANIFEST} from './manifest';
import type {SoundCue} from '../../domain/audio/soundCue';
const EFFECTS = {
  swing:'sword.swing',coin:'stage.coin',hit:'stage.hit',death:'stage.death',checkpoint:'stage.checkpoint',goal:'stage.goal',
  takeoff:'jump.takeoff',land:'jump.land',move:'ui.move',confirm:'ui.confirm',back:'ui.back',
} as const satisfies Record<string,SoundCue>;
export type StageEffect = keyof typeof EFFECTS;
/** Owns stage/result music independently from the render loop, which freezes on clear. */
export function createStageAudio(stage:'palace'|'course') {
  const cue=MANIFEST[`music.${stage}`];
  const music=createMenuMusic({url:cue.files[0],volume:cue.volume,preservePosition:true});
  music.setActive(false);
  let result:MenuMusic|undefined;
  const bank=Object.fromEntries(Object.entries(EFFECTS).map(([key,cue])=>{
    return [key,MANIFEST[cue].files.map(file=>{const audio=new Audio(file);audio.preload='auto';return audio;})];
  })) as Record<StageEffect,HTMLAudioElement[]>;
  bank.takeoff[0].playbackRate=1.12;bank.land[0].playbackRate=.88;
  const variants=new Map<StageEffect,number>();
  let paused=true,finished=false,disposed=false;
  let lastFocus:Element|null=null;
  const unsubscribe=audioPreferences.subscribe(levels=>{
    const gain=levels.muted?0:levels.master*levels.sfx;
    for(const [key,cue] of Object.entries(EFFECTS))for(const sound of bank[key as StageEffect])sound.volume=gain*MANIFEST[cue].volume;
  });
  const unlock=()=>{if(disposed)return;if(finished)void result?.unlock();else if(!paused)void music.unlock();};
  const play=(key:StageEffect,ui=false)=>{
    if(disposed||!ui&&(paused||finished))return;
    const index=variants.get(key)??0;variants.set(key,index+1);
    const sound=bank[key][index%bank[key].length];sound.currentTime=0;void sound.play().catch(()=>{});
  };
  const focus=(event:FocusEvent)=>{
    if(disposed||!paused&&!finished||!(event.target instanceof Element))return;
    const button=event.target.closest('button');if(!button)return;
    if(lastFocus&&lastFocus!==button)play('move',true);lastFocus=button;
  };
  const key=(event:KeyboardEvent)=>{unlock();if(event.key==='Escape'&&!event.repeat)play('back',true);};
  const click=(event:MouseEvent)=>{if((paused||finished)&&event.target instanceof Element&&event.target.closest('button'))play('confirm',true);};
  window.addEventListener('click',click,true);
  window.addEventListener('keydown',key);window.addEventListener('pointerdown',unlock);
  window.addEventListener('focusin',focus);
  return {
    play:(key:StageEffect)=>play(key),
    ui:(key:'move'|'confirm'|'back')=>play(key,true),
    pause(value:boolean){
      if(disposed)return;paused=value;lastFocus=null;music.setActive(!paused&&!finished);
      if(value)for(const [key,sounds] of Object.entries(bank))if(!['goal','move','confirm','back'].includes(key))for(const sound of sounds)sound.pause();
      unlock();
    },
    finish(){
      if(disposed||finished)return;
      play('goal');finished=true;music.setActive(false);
      const cue=MANIFEST['music.result'];
      result=createMenuMusic({url:cue.files[0],volume:cue.volume,preservePosition:true});
      result.setActive(true);void result.unlock();
    },
    reset(){
      if(disposed)return;finished=false;lastFocus=null;result?.dispose();result=undefined;
      for(const [key,sounds] of Object.entries(bank))if(!['move','confirm','back'].includes(key))for(const media of sounds){media.pause();media.currentTime=0;}
      music.setActive(!paused);unlock();
    },
    dispose(){
      if(disposed)return;disposed=true;unsubscribe();music.dispose();result?.dispose();
      window.removeEventListener('click',click,true);window.removeEventListener('keydown',key);window.removeEventListener('pointerdown',unlock);window.removeEventListener('focusin',focus);
      for(const media of Object.values(bank).flat()){media.pause();media.removeAttribute('src');media.load();}
    },
  };
}
