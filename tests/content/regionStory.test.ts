import { describe, expect, it } from 'vitest';
import { regionStories, type RegionStoryId } from '../../src/content/regionStory';
import { start, step } from '../../src/domain/dialogue/dialoguePlayback';
import { ADVANCE, select } from '../../src/domain/dialogue/dialogueInput';
import { validate } from '../../src/domain/dialogue/dialogueGraph';

const ids: RegionStoryId[] = ['town_arrival', 'meadow_signal', 'ruin_relay', 'aqueduct_open', 'town_return'];

describe('first region dialogue content', () => {
  it('provides the five chapter encounters', () => {
    expect(Object.keys(regionStories).sort()).toEqual([...ids].sort());
  });

  it.each(ids)('%s has a valid reachable graph and both characters', id => {
    const { title, graph } = regionStories[id];
    expect(title.trim().length).toBeGreaterThan(0);
    expect(validate(graph)).toEqual([]);
    const nodes = [...graph.nodes.values()];
    expect(nodes.length).toBeGreaterThanOrEqual(10);
    expect(nodes.length).toBeLessThanOrEqual(18);
    expect(nodes.some(node => node.speaker === '悠太翼')).toBe(true);
    expect(nodes.some(node => node.speaker === '澄音（回聲管）')).toBe(true);
    expect(nodes.every(node => node.line.trim().length > 0)).toBe(true);
  });

  it('all player choices converge and all encounter routes terminate', () => {
    let choiceCount = 0;
    for (const { graph } of Object.values(regionStories)) {
      const queue = [start(graph)];
      const ends = new Set<string>();
      let steps = 0;
      while (queue.length) {
        expect(++steps).toBeLessThan(100);
        const state = queue.shift()!;
        if (state.kind === 'ended') { ends.add(state.last.id); continue; }
        if (state.kind === 'awaitingChoice') {
          choiceCount++;
          state.choices.forEach((_, index) => queue.push(step(graph, state, select(index))));
        } else queue.push(step(graph, state, ADVANCE));
      }
      expect(ends.size).toBe(1);
    }
    expect(choiceCount).toBeGreaterThanOrEqual(1);
  });
});

it('directs the meadow report back to the city tower and the relay report toward the seafront',()=>{
 const text=(id:RegionStoryId)=>[...regionStories[id].graph.nodes.values()].map(n=>n.line).join('');
 expect(text('meadow_signal')).toContain('白塔廣場');expect(text('meadow_signal')).toContain('白宮天廊');
 expect(text('meadow_signal')).toContain('騎士');expect(text('ruin_relay')).toContain('白宮天廊');
 expect(text('ruin_relay')).not.toContain('先回城');expect(text('ruin_relay')).not.toContain('遺構');
});
