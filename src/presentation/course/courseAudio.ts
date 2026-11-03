import type {CourseRun} from '../../domain/course/courseProgress';
import type {CourseCombat} from '../../domain/course/courseCombat';
import {createStageAudio} from '../audio/stageAudio';
export function createCourseAudio(){
 const audio=createStageAudio('course');
 return {...audio,
  updateProgress(before:CourseRun,after:CourseRun){
   if(after.collected.length>before.collected.length)audio.play('coin');
   if(after.falls>before.falls)audio.play('death');
   if(after.finished&&!before.finished)audio.finish();
   else if(after.checkpoint>before.checkpoint)audio.play('checkpoint');
  },
  updateCombat(before:CourseCombat,after:CourseCombat){
   if(after.defeated>before.defeated||after.health>0&&after.damage>before.damage)audio.play('hit');
  },
 };
}
