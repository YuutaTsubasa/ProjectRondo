import { parse } from '../domain/dialogue/script/parser';
import type { DialogueGraph } from '../domain/dialogue/dialogueGraph';
import arrival from './dialogue/region/town_arrival.dlg?raw';
import signal from './dialogue/region/meadow_signal.dlg?raw';
import relay from './dialogue/region/ruin_relay.dlg?raw';
import aqueduct from './dialogue/region/aqueduct_open.dlg?raw';
import homecoming from './dialogue/region/town_return.dlg?raw';

export type RegionStoryId = 'town_arrival' | 'meadow_signal' | 'ruin_relay' | 'aqueduct_open' | 'town_return';

function encounter(id: RegionStoryId, title: string, source: string): { readonly title: string; readonly graph: DialogueGraph } {
  const { graph, errors } = parse(source);
  if (!graph || errors.length) {
    throw new Error(`First-region dialogue ${id}.dlg failed to compile: ${JSON.stringify(errors)}`);
  }
  return { title, graph };
}

export const regionStories: Readonly<Record<RegionStoryId, { readonly title: string; readonly graph: DialogueGraph }>> = {
  town_arrival: encounter('town_arrival', '潮聲未到的午後', arrival),
  meadow_signal: encounter('meadow_signal', '草原上的閉閘聲', signal),
  ruin_relay: encounter('ruin_relay', '送得出去的聲音', relay),
  aqueduct_open: encounter('aqueduct_open', '第一艘回家的船', aqueduct),
  town_return: encounter('town_return', '白色王城的回聲', homecoming),
};

/** The five encounters are steps inside Chapter 01, not five independent chapters. */
const storyOrder: readonly RegionStoryId[] = ['town_arrival', 'meadow_signal', 'ruin_relay', 'aqueduct_open', 'town_return'];
export function regionStoryChapter(activeId: RegionStoryId) {
  return {
    number: '01', title: '白潮原野', activeId,
    entries: storyOrder.map(id => ({ id, title: regionStories[id].title })),
  };
}
