import { parse } from '../domain/dialogue/script/parser';
import type { DialogueGraph } from '../domain/dialogue/dialogueGraph';
import { PARLOR_NAME, PARLOR_TALKS, type ParlorTalkId } from '../domain/town/mahjongParlor';
import first from './dialogue/parlor/ichimoku_first.dlg?raw';
import rules from './dialogue/parlor/ichimoku_rules.dlg?raw';
import bluff from './dialogue/parlor/ichimoku_bluff.dlg?raw';
import nap from './dialogue/parlor/ichimoku_nap.dlg?raw';

function talk(id: ParlorTalkId, title: string, source: string): { readonly title: string; readonly graph: DialogueGraph } {
  const { graph, errors } = parse(source);
  if (!graph || errors.length) throw new Error(`Parlor dialogue ${id}.dlg failed to compile: ${JSON.stringify(errors)}`);
  return { title, graph };
}

/** 一目元's side conversations: they never advance the chapter. */
export const parlorStories: Readonly<Record<ParlorTalkId, { readonly title: string; readonly graph: DialogueGraph }>> = {
  ichimoku_first: talk('ichimoku_first', '飄在三缺一的館主', first),
  ichimoku_rules: talk('ichimoku_rules', '花牌要分開收', rules),
  ichimoku_bluff: talk('ichimoku_bluff', '獨眼的角度', bluff),
  ichimoku_nap: talk('ichimoku_nap', '只是讓眼睛休息', nap),
};

export function parlorStoryChapter(activeId: ParlorTalkId) {
  return { number: '01', title: PARLOR_NAME, activeId, entries: PARLOR_TALKS.map(id => ({ id, title: parlorStories[id].title })) };
}
