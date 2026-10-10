export type GameEntry = 'hub' | 'course' | 'palace' | 'town' | 'region';
/** Keep the title light and only import the selected 3D session after an explicit menu action. */
export const loadGameSession = (entry: GameEntry = 'region') =>
  entry === 'region' ? import('./RegionSession.svelte') :
  entry === 'town' ? import('./TownSession.svelte') :
  entry === 'palace' ? import('./PalaceSession.svelte') :
  entry === 'course' ? import('./CourseSession.svelte') :
  import('./GameSession.svelte');
