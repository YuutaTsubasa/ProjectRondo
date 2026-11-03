import {swordSoundCrossed} from '../audio/swordSound';
import type {PalaceRun} from '../../domain/palace/palaceRun';
import {createStageAudio} from '../audio/stageAudio';
/** Effects follow simulation edges, so a render or paused frame cannot replay them. */
export function createPalaceAudio(){
  const audio=createStageAudio('palace');
  return {...audio,
    update(before:PalaceRun,after:PalaceRun){
      const p=after.player,old=before.player;
      if(swordSoundCrossed(old.swordSeconds,p.swordSeconds))audio.play('swing');
      if(after.deaths>before.deaths)audio.play('death');
      else if(after.damageTaken>before.damageTaken||p.health<old.health||after.guards.some(g=>g.defeated&&before.guards.some(old=>old.id===g.id&&!old.defeated)))audio.play('hit');
      if(p.health>0&&old.health>0){
        if(p.airJumped&&!old.airJumped||old.grounded&&!p.grounded&&p.vy>0&&!p.homing&&!p.bounced)audio.play('takeoff');
        if(!old.grounded&&p.grounded&&!old.homing&&!p.bounced)audio.play('land');
      }
      if(after.collected.length>before.collected.length)audio.play('coin');
      if(after.checkpoint>before.checkpoint)audio.play('checkpoint');
      if(after.finished&&!before.finished)audio.finish();
    },
  };
}
