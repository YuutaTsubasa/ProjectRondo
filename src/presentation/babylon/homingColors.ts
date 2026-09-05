/**
 * The homing attack's red.
 *
 * Shared between the reticle's ring (`homingReticle.ts`, drawn on the crystal a press would fly to)
 * and the hit flash (`crystals.ts`, the crystal a dash actually reached). Those are two moments of one
 * statement — "this crystal, right now" — so the two are not independent: retuning one without the
 * other would split the mechanic's whole feedback into two colour vocabularies, aim in one red and
 * arrival in another, with nothing on screen to say they were ever meant to match. One definition
 * means they cannot drift apart silently, and one retune moves both.
 *
 * **Untuned**: plain saturated red, chosen only to be unambiguous against the crystal's own cyan
 * `CRYSTAL_EMISSIVE`. Both sites have been watched in the browser and the red held up against that
 * cyan every time — but it was never compared against another red, or against a non-red, so it is a
 * value confirmed legible rather than one anything chose. Retune by eye, here.
 *
 * `readonly` and frozen, so "one definition" is a property of the value and not of everyone's good
 * manners — a mutable exported array is a shared variable, and `HOMING_RED_RGB[0] = 0.5` from any
 * importer would move one site's red and not the other's, which is the exact drift this module was
 * extracted to make impossible. The type refuses that at the build; the freeze refuses it at runtime
 * as well, where a cast or a plain-JS consumer would otherwise get past the type.
 */
export const HOMING_RED_RGB: readonly [number, number, number] = Object.freeze([1, 0, 0] as const);
