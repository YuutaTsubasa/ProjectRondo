import {expect,it} from 'vitest';
import {cityStories} from '../../src/content/cityStory';
import {CITY_STOPS} from '../../src/domain/region/cityJourney';
import {validate} from '../../src/domain/dialogue/dialogueGraph';
import {start,step} from '../../src/domain/dialogue/dialoguePlayback';
import {ADVANCE,select} from '../../src/domain/dialogue/dialogueInput';
it.each(CITY_STOPS)('$id has reachable, terminating choices and a Yuuta-led story',({id})=>{
 const {graph}=cityStories[id];expect(validate(graph)).toEqual([]);
 expect([...graph.nodes.values()].some(n=>n.speaker==='悠太翼')).toBe(true);
 const queue=[start(graph)],ends=new Set<string>();let steps=0;
 while(queue.length){expect(++steps).toBeLessThan(100);const state=queue.shift()!;
  if(state.kind==='ended'){ends.add(state.last.id);continue;}
  if(state.kind==='awaitingChoice')state.choices.forEach((_,i)=>queue.push(step(graph,state,select(i))));
  else queue.push(step(graph,state,ADVANCE));
 }
 expect(ends.size).toBe(1);
});
