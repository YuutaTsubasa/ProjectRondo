export type GameEntry = 'hub' | 'course';
/** Keep the title light and only import the selected 3D session after an explicit menu action. */
export const loadGameSession = (entry: GameEntry = 'hub') => entry === 'course'
  ? import('./CourseSession.svelte')
  : import('./GameSession.svelte');
