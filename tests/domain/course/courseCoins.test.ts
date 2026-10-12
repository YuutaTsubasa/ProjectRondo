import {describe,expect,it} from 'vitest';
import {createCourseRun,stepCourseRun} from '../../../src/domain/course/courseProgress';
const gates=[{label:'start',center:{x:0,y:1,z:0},spawn:{x:0,y:1.3,z:0},halfWidth:2,halfDepth:2},{label:'goal',center:{x:0,y:1,z:20},spawn:{x:0,y:1.3,z:20},halfWidth:2,halfDepth:2}];
const coins=[{x:0,y:1,z:3},{x:0,y:5,z:3},{x:0,y:1,z:20}];
const frame=(x=0,y=1,z=3,active=true)=>({position:{x,y,z},grounded:true,dt:.02,active});
describe('3D course coins',()=>{
 it('collects once with capsule proximity while excluding different heights',()=>{
  const first=stepCourseRun(createCourseRun(),frame(),gates,-12,coins).run;
  expect(first.collected).toEqual([0]);
  expect(stepCourseRun(first,frame(),gates,-12,coins).run.collected).toEqual([0]);
  expect(stepCourseRun(first,frame(0,5,3),gates,-12,coins).run.collected).toEqual([0,1]);
 });
 it('keeps pickups on falls and damage respawns, but resets a new run',()=>{
  const first=stepCourseRun(createCourseRun(),frame(),gates,-12,coins).run;
  expect(stepCourseRun(first,frame(0,-13,3),gates,-12,coins).run.collected).toEqual([0]);
  expect(stepCourseRun({...first,health:0},frame(),gates,-12,coins).run.collected).toEqual([0]);
  expect(createCourseRun().collected).toEqual([]);
 });
 it('freezes pickups when inactive or finished and collects at the finishing gate',()=>{
  const start=createCourseRun();
  expect(stepCourseRun(start,frame(0,1,3,false),gates,-12,coins).run).toBe(start);
  const finished=stepCourseRun(start,frame(0,1,20),gates,-12,coins).run;
  expect(finished.finished).toBe(true);expect(finished.collected).toEqual([2]);
  expect(stepCourseRun(finished,frame(),gates,-12,coins).run).toBe(finished);
 });
});
