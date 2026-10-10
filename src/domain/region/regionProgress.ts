/** Story progress outlives disposable scenes and contains no engine or content references. */
export type RegionChapter = 'arrival' | 'signal' | 'relay' | 'relay-report' |
  'aqueduct' | 'aqueduct-report' | 'homecoming' | 'complete';
export type RegionExpeditionId = 'course' | 'palace';
type DialogueId = 'town_arrival' | 'meadow_signal' | 'ruin_relay' | 'aqueduct_open' | 'town_return';

export interface RegionProgress {
  readonly version: 1;
  readonly chapter: RegionChapter;
  readonly discoveries: readonly string[];
  readonly completedExpeditions: readonly RegionExpeditionId[];
}

export function createRegionProgress(): RegionProgress {
  return { version: 1, chapter: 'arrival', discoveries: [], completedExpeditions: [] };
}

const dialogueTransitions: Record<DialogueId, readonly [RegionChapter, RegionChapter]> = {
  town_arrival: ['arrival', 'signal'],
  meadow_signal: ['signal', 'relay'],
  ruin_relay: ['relay-report', 'aqueduct'],
  aqueduct_open: ['aqueduct-report', 'homecoming'],
  town_return: ['homecoming', 'complete'],
};

/** Only the current encounter can advance the chapter; stale UI callbacks are harmless. */
export function finishRegionDialogue(progress: RegionProgress, storyId: DialogueId): RegionProgress {
  const transition = dialogueTransitions[storyId];
  if (!transition || progress.chapter !== transition[0]) return progress;
  return { ...progress, chapter: transition[1] };
}

export function canEnterRegionExpedition(progress: RegionProgress, id: RegionExpeditionId): boolean {
  return progress.completedExpeditions.includes(id) ||
    (id === 'course' && progress.chapter === 'relay') ||
    (id === 'palace' && progress.chapter === 'aqueduct');
}

/** Call only for a real stage goal. Leaving, retrying, or replaying cannot grant story progress. */
export function completeRegionExpedition(progress: RegionProgress, id: RegionExpeditionId): RegionProgress {
  const chapter = id === 'course' && progress.chapter === 'relay' ? 'relay-report' :
    id === 'palace' && progress.chapter === 'aqueduct' ? 'aqueduct-report' : undefined;
  if (!chapter) return progress;
  return { ...progress, chapter, completedExpeditions: [...progress.completedExpeditions, id] };
}

const siteIds: readonly string[] = ['ridge', 'cove', 'watch'];

export function discoverRegionSite(progress: RegionProgress, id: string): RegionProgress {
  if (!siteIds.includes(id) || progress.discoveries.includes(id)) return progress;
  return { ...progress, discoveries: [...progress.discoveries, id] };
}

/** The required completed stages at each chapter also make corrupted saves fail closed. */
const requiredExpeditions: Record<RegionChapter, readonly RegionExpeditionId[]> = {
  arrival: [], signal: [], relay: [],
  'relay-report': ['course'], aqueduct: ['course'],
  'aqueduct-report': ['course', 'palace'], homecoming: ['course', 'palace'], complete: ['course', 'palace'],
};

function uniqueAllowedList(value: unknown, allowed: readonly string[]): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && allowed.includes(item)) &&
    new Set(value).size === value.length;
}

/** Untrusted local storage is accepted only when its stage flags agree with its chapter. */
export function parseRegionProgress(raw: string | null): RegionProgress {
  if (raw === null) return createRegionProgress();
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return createRegionProgress();
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== 1 || typeof candidate.chapter !== 'string' ||
      !Object.hasOwn(requiredExpeditions, candidate.chapter) ||
      !uniqueAllowedList(candidate.discoveries, siteIds) ||
      !uniqueAllowedList(candidate.completedExpeditions, ['course', 'palace'])) return createRegionProgress();
    const chapter = candidate.chapter as RegionChapter;
    const expected = requiredExpeditions[chapter];
    const completed = candidate.completedExpeditions;
    if (completed.length !== expected.length || !expected.every(id => completed.includes(id))) {
      return createRegionProgress();
    }
    return {
      version: 1, chapter, discoveries: [...candidate.discoveries],
      completedExpeditions: [...expected],
    };
  } catch {
    return createRegionProgress();
  }
}
