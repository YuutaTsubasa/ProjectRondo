export type FrontDoorPhase = 'title' | 'menu' | 'settings' | 'loading' | 'game' | 'error';
export type FrontDoorAction = 'activate' | 'settings' | 'back' | 'start' | 'ready' | 'fail' | 'retry' | 'course' | 'palace' | 'leave';

const transitions: Record<FrontDoorPhase, Partial<Record<FrontDoorAction, FrontDoorPhase>>> = {
  title: { activate: 'menu' },
  menu: { palace: 'loading', course: 'loading', start: 'loading', settings: 'settings', back: 'title' },
  settings: { back: 'menu' },
  loading: { ready: 'game', fail: 'error' },
  game: { leave: 'menu' },
  error: { retry: 'loading', back: 'menu' },
};

/** A load can only be requested once; stale readiness cannot skip the title or settings. */
export const stepFrontDoor = (phase: FrontDoorPhase, action: FrontDoorAction): FrontDoorPhase =>
  transitions[phase][action] ?? phase;