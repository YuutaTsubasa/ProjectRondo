import { describe, expect, it } from 'vitest';
import {
  PORTAL_STANDING_BAND, PORTAL_START, standingOnPedestal, stepPortalTrigger,
} from '../../src/presentation/babylon/portalTrigger';
import { CAPSULE_HALF } from '../../src/presentation/babylon/capsule';
import { FALL_GRACE_SECONDS } from '../../src/presentation/babylon/groundContact';
import { TOWER_SUMMIT_PEDESTAL_HEIGHT, TOWER_SUMMIT_RADIUS } from '../../src/presentation/babylon/towerLevel';
import { MovementConstants } from '../../src/domain/hub/character/movementConstants';

const { gravity, jumpSpeed } = MovementConstants;

/** The capsule's centre, relative to the ground it jumped from, `t` seconds into a standing jump. */
const jumpCentreY = (t: number): number => CAPSULE_HALF + jumpSpeed * t - (gravity / 2) * t * t;

/** Every frame of a jump taken from the ground beside a pedestal, at 60 fps, as the height of the
 *  capsule's centre above the height that centre has when the feet are on the pedestal's top face.
 *  Both pedestals in the game are {@link TOWER_SUMMIT_PEDESTAL_HEIGHT} tall — `landmark.ts`'s hub
 *  plinth is the same 0.55 — so one arc answers for both. */
const jumpOverPedestal = (): number[] =>
  Array.from({ length: Math.ceil((2 * jumpSpeed) / gravity / (1 / 60)) + 1 }, (_, frame) =>
    jumpCentreY(frame / 60) - (TOWER_SUMMIT_PEDESTAL_HEIGHT + CAPSULE_HALF));

describe('standingOnPedestal', () => {
  const onTheFace = {
    planarDistance: 0, radius: TOWER_SUMMIT_RADIUS, aboveStandingHeight: 0, airborne: false,
  };

  it('counts a supported frame with its feet on the top face', () => {
    expect(standingOnPedestal(onTheFace)).toBe(true);
  });

  it('does not count a frame outside the pedestal', () => {
    expect(standingOnPedestal({ ...onTheFace, planarDistance: TOWER_SUMMIT_RADIUS + 0.01 })).toBe(false);
  });

  // The bug this rule was rewritten for: a 0.55 u plinth is nothing to a 1.6875 u jump apex, so a
  // player running across the hub's plaza and jumping over it was inside the trigger for most of the
  // arc, and the scene swapped without spec §5's "climbing onto the pedestal" ever happening.
  it('counts no frame of a jump that passes over the pedestal', () => {
    const arc = jumpOverPedestal();
    expect(arc.some((above) => above > 0)).toBe(true); // it really does clear the top face
    for (const aboveStandingHeight of arc) {
      expect(standingOnPedestal({ ...onTheFace, aboveStandingHeight, airborne: true })).toBe(false);
    }
  });

  // Why the rule needs `airborne` and cannot be a band, however narrow: the arc crosses the standing
  // height itself on the way up and again on the way down, so a band that admits standing admits it.
  it('cannot be excluded by the height alone', () => {
    const arc = jumpOverPedestal();
    expect(arc.some((above) => Math.abs(above) <= PORTAL_STANDING_BAND)).toBe(true);
  });

  // Holds the doc's upper bound on the band: the frames that read `!airborne` while unsupported are
  // the first FALL_GRACE_SECONDS of an uncommanded loss of support, and the band has to be inside the
  // drop those make or a walk-off from something over the pedestal reads as standing on it.
  it('has a band narrower than the drop a still-supported-looking fall can make', () => {
    expect(PORTAL_STANDING_BAND).toBeLessThan((gravity / 2) * FALL_GRACE_SECONDS ** 2);
  });

  it('does not count standing on the ground at the foot of the pedestal', () => {
    const atTheFoot = { ...onTheFace, aboveStandingHeight: -TOWER_SUMMIT_PEDESTAL_HEIGHT };
    expect(standingOnPedestal(atTheFoot)).toBe(false);
  });
});

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
