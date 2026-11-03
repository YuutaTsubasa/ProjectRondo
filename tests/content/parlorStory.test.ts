import {describe,expect,it} from 'vitest';
import {parlorStories,parlorStoryChapter} from '../../src/content/parlorStory';
import {PARLOR_TALKS,PARLOR_NAME} from '../../src/domain/town/mahjongParlor';
import {start,step} from '../../src/domain/dialogue/dialoguePlayback';
import {ADVANCE,select} from '../../src/domain/dialogue/dialogueInput';
import {validate} from '../../src/domain/dialogue/dialogueGraph';

describe('一目元 parlor dialogue content',()=>{
 it('provides every talk the parlor schedules',()=>{
  expect(Object.keys(parlorStories).sort()).toEqual([...PARLOR_TALKS].sort());
 });
 it.each(PARLOR_TALKS)('%s is a valid conversation between 悠太翼 and 一目元',id=>{
  const {title,graph}=parlorStories[id];
  expect(title.trim().length).toBeGreaterThan(0);
  expect(validate(graph)).toEqual([]);
  const nodes=[...graph.nodes.values()];
  expect(nodes.length).toBeGreaterThanOrEqual(6);
  expect(nodes.length).toBeLessThanOrEqual(18);
  expect(new Set(nodes.map(n=>n.speaker))).toEqual(new Set(['悠太翼','一目元']));
  expect(nodes.every(n=>n.line.trim().length>0)).toBe(true);
 });
 it('every route through every talk terminates at one ending',()=>{
  for(const {graph} of Object.values(parlorStories)){
   const queue=[start(graph)],ends=new Set<string>();let steps=0;
   while(queue.length){
    expect(++steps).toBeLessThan(100);
    const state=queue.shift()!;
    if(state.kind==='ended'){ends.add(state.last.id);continue;}
    if(state.kind==='awaitingChoice')state.choices.forEach((_,i)=>queue.push(step(graph,state,select(i))));
    else queue.push(step(graph,state,ADVANCE));
   }
   expect(ends.size).toBe(1);
  }
 });
 it('opens with 一目元 introducing itself as the parlor host',()=>{
  const graph=parlorStories.ichimoku_first.graph,first=start(graph);
  expect(first.kind==='speaking'&&first.current.speaker).toBe('一目元');
  const text=[...graph.nodes.values()].map(n=>n.line).join('');
  expect(text).toContain(PARLOR_NAME);expect(text).toContain('一目元');expect(text).toContain('館主');
 });
 it('labels the talk with the parlor rather than the chapter story',()=>{
  const chapter=parlorStoryChapter('ichimoku_bluff');
  expect(chapter.title).toBe(PARLOR_NAME);
  expect(chapter.entries.find(e=>e.id===chapter.activeId)?.title).toBe(parlorStories.ichimoku_bluff.title);
 });
});
