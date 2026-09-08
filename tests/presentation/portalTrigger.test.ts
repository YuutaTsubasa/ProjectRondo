import { describe, expect, it } from 'vitest';
import { PORTAL_START, stepPortalTrigger } from '../../src/presentation/babylon/portalTrigger';

describe('stepPortalTrigger', () => {
  // The return from the tower puts the player beside the pedestal, but "beside" is a placement,
  // not a guarantee. Starting disarmed means even a return that lands ON the pedestal cannot
  // bounce the player straight back into the tower.
  it('starts disarmed, so standing inside on the first frame does not fire', () => {
    expect(stepPortalTrigger(PORTAL_START, true).fired).toBe(false);
  });

  it('arms once the player is outside', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    expect(out.trigger.armed).toBe(true);
  });

  it('fires on entry when armed', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    expect(stepPortalTrigger(out.trigger, true).fired).toBe(true);
  });

  it('does not fire again while the player stays inside', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    const entered = stepPortalTrigger(out.trigger, true);
    expect(stepPortalTrigger(entered.trigger, true).fired).toBe(false);
  });

  it('fires again after leaving and coming back', () => {
    const out = stepPortalTrigger(PORTAL_START, false);
    const entered = stepPortalTrigger(out.trigger, true);
    const left = stepPortalTrigger(entered.trigger, false);
    expect(stepPortalTrigger(left.trigger, true).fired).toBe(true);
  });
});
