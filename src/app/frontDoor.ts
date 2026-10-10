export type FrontDoorPhase = 'title' | 'menu' | 'settings' | 'extras' | 'load-game' | 'new-game' | 'exit' | 'loading' | 'game' | 'error';
export type FrontDoorAction = 'activate' | 'extras' | 'load-game' | 'continue' | 'confirm-new' | 'exit' | 'title' | 'settings' | 'back' | 'start' | 'ready' | 'fail' | 'retry' | 'course' | 'palace' | 'town' | 'leave';

const transitions: Record<FrontDoorPhase, Partial<Record<FrontDoorAction, FrontDoorPhase>>> = {
  title: { activate: 'menu' },
  menu: { extras: 'extras', 'load-game': 'load-game', exit: 'exit', start: 'new-game', settings: 'settings', back: 'title' },
  settings: { back: 'menu' },
  extras: {town:'loading',palace:'loading',course:'loading',back:'menu'},
  'load-game': {continue:'loading',back:'menu'},
  'new-game': {'confirm-new':'loading',back:'menu'},
  exit: {back:'menu',title:'title'},
  loading: { ready: 'game', fail: 'error' },
  game: { leave: 'menu' },
  error: { retry: 'loading', back: 'menu' },
};

/** A load can only be requested once; stale readiness cannot skip the title or settings. */
export const stepFrontDoor = (phase: FrontDoorPhase, action: FrontDoorAction): FrontDoorPhase =>
  transitions[phase][action] ?? phase;
