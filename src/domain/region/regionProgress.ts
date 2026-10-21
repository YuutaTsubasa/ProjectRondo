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

/** Stage hosts welcome players independently of optional story progress. */
export function canEnterRegionExpedition(_progress: RegionProgress, _id: RegionExpeditionId): boolean {
  return true;
}

/** Call only for a real stage goal. Leaving, retrying, or replaying cannot grant story progress. */
export function completeRegionExpedition(progress: RegionProgress, id: RegionExpeditionId): RegionProgress {
  const chapter = id === 'course' && progress.chapter === 'relay' ? 'relay-report' :
    id === 'palace' && progress.chapter === 'aqueduct' ? 'aqueduct-report' : undefined;
  const completed = progress.completedExpeditions.includes(id);
  if (!chapter && completed) return progress;
  return { ...progress, chapter: chapter ?? progress.chapter, completedExpeditions: completed ? progress.completedExpeditions : [...progress.completedExpeditions, id] };
}

const siteIds: readonly string[] = ['ridge', 'cove', 'watch'];

export function discoverRegionSite(progress: RegionProgress, id: string): RegionProgress {
  if (!siteIds.includes(id) || progress.discoveries.includes(id)) return progress;
  return { ...progress, discoveries: [...progress.discoveries, id] };
}

/** Legacy story chapters still require their earned stages; free exploration can add others. */
const requiredExpeditions: Record<RegionChapter, readonly RegionExpeditionId[]> = {
  arrival: [], signal: [], relay: [],
  'relay-report': ['course'], aqueduct: ['course'],
  'aqueduct-report': ['course', 'palace'], homecoming: ['course', 'palace'], complete: ['course', 'palace'],
};

function uniqueAllowedList(value: unknown, allowed: readonly string[]): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string' && allowed.includes(item)) &&
    new Set(value).size === value.length;
}

/** Validate old story prerequisites while accepting independently completed expeditions. */
export function validateRegionProgress(value: unknown): RegionProgress | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.chapter !== 'string' ||
    !Object.hasOwn(requiredExpeditions, candidate.chapter) ||
    !uniqueAllowedList(candidate.discoveries, siteIds) ||
    !uniqueAllowedList(candidate.completedExpeditions, ['course', 'palace'])) return null;
  const chapter = candidate.chapter as RegionChapter;
  const expected = requiredExpeditions[chapter];
  const completed = candidate.completedExpeditions;
  if (!expected.every(id => completed.includes(id))) return null;
  return {
    version: 1, chapter, discoveries: [...candidate.discoveries],
    completedExpeditions: [...completed] as RegionExpeditionId[],
  };
}

/** Untrusted local storage; anything invalid starts a new chapter. */
export function parseRegionProgress(raw: string | null): RegionProgress {
  if (raw === null) return createRegionProgress();
  try {
    return validateRegionProgress(JSON.parse(raw)) ?? createRegionProgress();
  } catch {
    return createRegionProgress();
  }
}
