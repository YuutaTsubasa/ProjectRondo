export type GameEntry = 'hub' | 'course' | 'palace';
/** Keep the title light and only import the selected 3D session after an explicit menu action. */
export const loadGameSession = (entry: GameEntry = 'hub') => entry === 'palace' ? import('./PalaceSession.svelte') : entry === 'course'
  ? import('./CourseSession.svelte')
  : import('./GameSession.svelte');
