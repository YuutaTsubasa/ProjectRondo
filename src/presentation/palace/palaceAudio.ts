import { audioPreferences } from '../audio/audioPreferences';
import type { PalaceRun } from '../../domain/palace/palaceRun';

/** Small level-owned bank; browser autoplay failure retries on the next player gesture. */
export function createPalaceAudio() {
  const music=new Audio('/palace/world01_bgm.mp3');music.loop=true;music.preload='auto';
  const sounds=['coin','hit','checkpoint','goal'] as const;
  const bank=Object.fromEntries(sounds.map(key=>[key,new Audio('/palace/'+key+'.wav')])) as Record<typeof sounds[number],HTMLAudioElement>;
  let paused=true,disposed=false;
  const unsubscribe=audioPreferences.subscribe(levels=>{
    const master=levels.muted?0:levels.master;
    music.volume=master*levels.music*.5;
    for(const sound of Object.values(bank))sound.volume=master*levels.sfx*.7;
  });
  const start=()=>{if(!paused&&!disposed&&music.paused)void music.play().catch(()=>{});};
  const play=(key:typeof sounds[number])=>{if(disposed||paused)return;const sound=bank[key];sound.currentTime=0;void sound.play().catch(()=>{});};
  window.addEventListener('keydown',start);window.addEventListener('pointerdown',start);
  return {
    update(before:PalaceRun,after:PalaceRun){
      if(after.collected.length>before.collected.length)play('coin');
      if(after.player.health<before.player.health||after.guards.filter(g=>g.defeated).length>before.guards.filter(g=>g.defeated).length)play('hit');
      if(after.checkpoint>before.checkpoint)play('checkpoint');
      if(after.finished&&!before.finished)play('goal');
    },
    pause(value:boolean){paused=value;if(value){music.pause();[bank.coin,bank.hit,bank.checkpoint].forEach(s=>s.pause());}else start();},
    dispose(){disposed=true;unsubscribe();window.removeEventListener('keydown',start);window.removeEventListener('pointerdown',start);for(const media of [music,...Object.values(bank)]){media.pause();media.removeAttribute('src');media.load();}},
  };
}
