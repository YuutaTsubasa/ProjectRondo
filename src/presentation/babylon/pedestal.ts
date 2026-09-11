/**
 * How tall a portal pedestal stands above the surface it sits on — the hub's plinth in the plaza
 * (`landmark.ts`) and the tower summit's disc (`towerLevel.ts`, `towerScene.ts`).
 *
 * **One constant rather than two that agree**, because the portal rule is written across both and a
 * test covers them with one arc: `standingOnPedestal` decides "standing on it" from a capsule whose
 * centre is `PEDESTAL_HEIGHT + CAPSULE_HALF` over the surrounding ground, and `portalTrigger.test.ts`
 * builds a single jump from this value on the grounds that it answers for either pedestal. Split back
 * into two, that suite stays green while it has stopped covering whichever pedestal moved — the
 * standing rule was rewritten for the hub case, and the hub case is the one that would go dark.
 *
 * **Untuned**: 0.55 u, low enough to step onto without a jump and high enough that standing on it is
 * something the player did on purpose — spec §5's reason for there being no confirm key. Nothing has
 * measured where between those two bounds it belongs; the bounds are what fix it.
 */
export const PEDESTAL_HEIGHT = 0.55;
