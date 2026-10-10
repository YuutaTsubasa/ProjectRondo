export type GameEntry = 'hub' | 'course' | 'palace' | 'town' | 'region';
// Keep each import in its own loader. A conditional expression can be folded into
// one preload wrapper in production, losing the other branches' extracted CSS.
const sessions = {
  region: () => import('./RegionSession.svelte'),
  town: () => import('./TownSession.svelte'),
  palace: () => import('./PalaceSession.svelte'),
  course: () => import('./CourseSession.svelte'),
  hub: () => import('./GameSession.svelte'),
};
/** Keep the title light; load the chosen session and its styles together. */
export const loadGameSession = (entry: GameEntry = 'region') => sessions[entry]();
